import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import {
  CreateUploadBatchSchema,
  PlatformSchema,
  type CreateUploadBatch,
  type UploadJobSummary,
} from "@autouploader/shared";
import { getDb } from "../db/client.js";
import { accounts, jobs, videos, type JobRow } from "../db/schema.js";
import { buildBatchPairs } from "./batch-plan.js";
import { executeUploadJob } from "./executor.js";
import { resolveBatchSchedule } from "./schedule.js";
import { BoundedTaskPool, type PoolLimits } from "./task-pool.js";

type JobListener = (job: UploadJobSummary) => void;

function positiveEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function schedulerLimitsFromEnv(): PoolLimits {
  return {
    youtube: positiveEnv("SCHEDULER_MAX_YOUTUBE", 3),
    tiktok: positiveEnv("SCHEDULER_MAX_TIKTOK", 2),
    instagram: positiveEnv("SCHEDULER_MAX_INSTAGRAM", 2),
    browsers: positiveEnv("SCHEDULER_MAX_BROWSERS", 3),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class UploadScheduler {
  private readonly pool: BoundedTaskPool;
  private readonly listeners = new Set<JobListener>();
  private readonly activeJobs = new Map<string, AbortController>();
  private timer: NodeJS.Timeout | undefined;
  private pumping = false;

  constructor(limits: PoolLimits = schedulerLimitsFromEnv()) {
    this.pool = new BoundedTaskPool(limits);
  }

  start(): void {
    if (this.timer) return;
    getDb();
    this.timer = setInterval(() => this.pump(), 1000);
    this.pump();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  subscribe(listener: JobListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createBatch(input: CreateUploadBatch): UploadJobSummary[] {
    const request = CreateUploadBatchSchema.parse(input);
    const db = getDb();
    const uniqueAccountIds = [...new Set(request.accountIds)];
    const accountRows = db
      .select()
      .from(accounts)
      .where(inArray(accounts.id, uniqueAccountIds))
      .all();
    if (accountRows.length !== uniqueAccountIds.length) {
      throw new Error("Один или несколько выбранных аккаунтов не найдены");
    }

    const now = new Date();
    const scheduledAt = resolveBatchSchedule(request.scheduledAt, now);
    const createdJobIds: string[] = [];
    db.transaction((tx) => {
      const videoIds: string[] = [];
      for (const item of request.videos) {
        const videoId = randomUUID();
        videoIds.push(videoId);
        tx.insert(videos)
          .values({
            id: videoId,
            filePath: item.filePath,
            title: item.title,
            description: item.description,
            privacyStatus: item.privacyStatus,
            addedAt: now,
          })
          .run();
      }

      const accountMap = new Map(accountRows.map((account) => [account.id, account]));
      for (const pair of buildBatchPairs(uniqueAccountIds, videoIds)) {
        const account = accountMap.get(pair.accountId);
        if (!account) continue;
        const jobId = randomUUID();
        createdJobIds.push(jobId);
        tx.insert(jobs)
          .values({
            id: jobId,
            accountId: account.id,
            videoId: pair.videoId,
            platform: account.platform,
            scheduledAt,
            status: "pending",
            attempts: 0,
            lastError: null,
            executedBy: "client",
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });

    this.pump();
    return this.listJobs().filter((job) => createdJobIds.includes(job.id));
  }

  listJobs(): UploadJobSummary[] {
    const db = getDb();
    const jobRows = db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(1000).all();
    if (jobRows.length === 0) return [];
    const accountMap = new Map(db.select().from(accounts).all().map((row) => [row.id, row]));
    const videoMap = new Map(db.select().from(videos).all().map((row) => [row.id, row]));

    return jobRows.flatMap((job) => {
      const account = accountMap.get(job.accountId);
      const video = videoMap.get(job.videoId);
      if (!account || !video) return [];
      const createdAt = job.createdAt;
      return [{
        id: job.id,
        accountId: job.accountId,
        accountLabel: account.label,
        platform: PlatformSchema.parse(job.platform),
        videoId: job.videoId,
        filePath: video.filePath,
        title: video.title ?? "",
        status: job.status as UploadJobSummary["status"],
        attempts: job.attempts,
        lastError: job.lastError,
        scheduledAt: job.scheduledAt.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: (job.updatedAt ?? createdAt).toISOString(),
      }];
    });
  }

  retry(jobId: string): UploadJobSummary {
    const db = getDb();
    const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!row) throw new Error("Задание не найдено");
    if (row.status !== "failed" && row.status !== "missed") {
      throw new Error("Повторить можно только неудачное задание");
    }
    const now = new Date();
    db.update(jobs)
      .set({ status: "pending", lastError: null, scheduledAt: now, updatedAt: now })
      .where(eq(jobs.id, jobId))
      .run();
    const summary = this.findSummary(jobId);
    this.emit(summary);
    this.pump();
    return summary;
  }

  cancel(jobId: string): UploadJobSummary {
    const db = getDb();
    const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!row) throw new Error("Задание не найдено");
    if (row.status !== "pending" && row.status !== "running") {
      throw new Error("Отменить можно только задание в очереди или в процессе");
    }

    const now = new Date();
    if (row.status === "pending") {
      const updated = db
        .update(jobs)
        .set({ status: "cancelled", lastError: null, updatedAt: now })
        .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending")))
        .run();
      if (updated.changes !== 1) {
        throw new Error("Не удалось отменить задание");
      }
    } else {
      this.activeJobs.get(jobId)?.abort();
      db.update(jobs)
        .set({ status: "cancelled", lastError: null, updatedAt: now })
        .where(and(eq(jobs.id, jobId), eq(jobs.status, "running")))
        .run();
    }

    const summary = this.findSummary(jobId);
    this.emit(summary);
    return summary;
  }

  private findSummary(jobId: string): UploadJobSummary {
    const summary = this.listJobs().find((item) => item.id === jobId);
    if (!summary) throw new Error("Не удалось прочитать задание");
    return summary;
  }

  private emit(job: UploadJobSummary): void {
    for (const listener of this.listeners) listener(job);
  }

  private emitById(jobId: string): void {
    this.emit(this.findSummary(jobId));
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      const db = getDb();
      const pending = db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "pending"), lte(jobs.scheduledAt, new Date())))
        .orderBy(asc(jobs.scheduledAt), asc(jobs.createdAt))
        .limit(200)
        .all();

      for (const job of pending) {
        const platform = PlatformSchema.parse(job.platform);
        const task = { accountId: job.accountId, platform };
        if (!this.pool.canRun(task)) continue;
        const now = new Date();
        const claimed = db
          .update(jobs)
          .set({
            status: "running",
            attempts: job.attempts + 1,
            lastError: null,
            updatedAt: now,
          })
          .where(and(eq(jobs.id, job.id), eq(jobs.status, "pending")))
          .run();
        if (claimed.changes !== 1) continue;
        const runningJob: JobRow = {
          ...job,
          status: "running",
          attempts: job.attempts + 1,
          lastError: null,
          updatedAt: now,
        };
        this.emitById(job.id);
        const abortController = new AbortController();
        this.activeJobs.set(job.id, abortController);
        void this.pool
          .run(task, () => executeUploadJob(runningJob, abortController.signal))
          .then(() => {
            if (abortController.signal.aborted) return;
            this.finish(job.id, "done", null);
          })
          .catch((error) => {
            if (abortController.signal.aborted) return;
            this.finish(job.id, "failed", errorMessage(error));
          })
          .finally(() => {
            this.activeJobs.delete(job.id);
            this.pump();
          });
      }
    } finally {
      this.pumping = false;
    }
  }

  private finish(jobId: string, status: "done" | "failed", lastError: string | null): void {
    const db = getDb();
    const current = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!current || current.status === "cancelled") {
      return;
    }

    db.update(jobs)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
      .run();
    this.emitById(jobId);
  }
}

let scheduler: UploadScheduler | undefined;
export function getUploadScheduler(): UploadScheduler {
  scheduler ??= new UploadScheduler();
  return scheduler;
}
