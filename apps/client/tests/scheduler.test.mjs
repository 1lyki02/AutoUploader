import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildBatchPairs } from "../src/main/jobs/batch-plan.ts";
import { isScheduledJobDue, resolveBatchSchedule } from "../src/main/jobs/schedule.ts";
import { BoundedTaskPool } from "../src/main/jobs/task-pool.ts";

const limits = { youtube: 3, tiktok: 2, instagram: 2, browsers: 3 };

test("buildBatchPairs creates the cartesian product", () => {
  assert.deepEqual(buildBatchPairs(["a1", "a2"], ["v1", "v2"]), [
    { accountId: "a1", videoId: "v1" },
    { accountId: "a2", videoId: "v1" },
    { accountId: "a1", videoId: "v2" },
    { accountId: "a2", videoId: "v2" },
  ]);
});

test("pool serializes jobs for the same account", async () => {
  const pool = new BoundedTaskPool(limits);
  let release;
  const running = pool.run({ accountId: "a1", platform: "youtube" }, () =>
    new Promise((resolve) => { release = resolve; }),
  );
  assert.equal(pool.canRun({ accountId: "a1", platform: "youtube" }), false);
  assert.equal(pool.canRun({ accountId: "a2", platform: "youtube" }), true);
  release();
  await running;
  assert.equal(pool.canRun({ accountId: "a1", platform: "youtube" }), true);
});

test("pool enforces the shared browser limit", async () => {
  const pool = new BoundedTaskPool({ ...limits, browsers: 1 });
  let release;
  const running = pool.run({ accountId: "t1", platform: "tiktok" }, () =>
    new Promise((resolve) => { release = resolve; }),
  );
  assert.equal(pool.canRun({ accountId: "i1", platform: "instagram" }), false);
  assert.equal(pool.canRun({ accountId: "y1", platform: "youtube" }), true);
  release();
  await running;
  assert.equal(pool.canRun({ accountId: "i1", platform: "instagram" }), true);
});

test("pool releases capacity after a failed job", async () => {
  const pool = new BoundedTaskPool(limits);
  await assert.rejects(pool.run({ accountId: "a1", platform: "instagram" }, async () => {
    throw new Error("upload failed");
  }));
  assert.equal(pool.canRun({ accountId: "a1", platform: "instagram" }), true);
});

test("batch schedule uses one exact timestamp for every job", () => {
  const now = new Date("2026-07-28T09:00:00.000Z");
  const requested = "2026-07-28T10:30:00.000Z";
  const values = Array.from({ length: 6 }, () =>
    resolveBatchSchedule(requested, now).toISOString(),
  );
  assert.deepEqual(new Set(values), new Set([requested]));
});

test("future jobs are not due and overdue jobs are due after app start", () => {
  const now = new Date("2026-07-28T10:00:00.000Z");
  assert.equal(isScheduledJobDue(new Date("2026-07-28T10:30:00.000Z"), now), false);
  assert.equal(isScheduledJobDue(new Date("2026-07-28T09:30:00.000Z"), now), true);
});

test("schedule rejects timestamps in the past", () => {
  assert.throws(
    () =>
      resolveBatchSchedule(
        "2026-07-28T09:59:00.000Z",
        new Date("2026-07-28T10:00:00.000Z"),
      ),
    /будущем/,
  );
});
