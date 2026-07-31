import type { Platform } from "@autouploader/shared";

export interface PoolTask {
  accountId: string;
  platform: Platform;
}

export interface PoolLimits {
  youtube: number;
  tiktok: number;
  instagram: number;
  browsers: number;
}

const BROWSER_PLATFORMS = new Set<Platform>(["tiktok", "instagram"]);

/** Enforces account, platform, and browser concurrency limits. */
export class BoundedTaskPool {
  private readonly limits: PoolLimits;
  private readonly activeAccounts = new Set<string>();
  private readonly activeByPlatform: Record<Platform, number> = {
    youtube: 0,
    tiktok: 0,
    instagram: 0,
  };
  private activeBrowsers = 0;

  constructor(limits: PoolLimits) {
    this.limits = limits;
  }

  canRun(task: PoolTask): boolean {
    if (this.activeAccounts.has(task.accountId)) return false;
    if (this.activeByPlatform[task.platform] >= this.limits[task.platform]) return false;
    if (
      BROWSER_PLATFORMS.has(task.platform) &&
      this.activeBrowsers >= this.limits.browsers
    ) {
      return false;
    }
    return true;
  }

  async run<T>(task: PoolTask, fn: () => Promise<T>): Promise<T> {
    if (!this.canRun(task)) {
      throw new Error(`Нет свободного слота для аккаунта ${task.accountId}`);
    }
    this.activeAccounts.add(task.accountId);
    this.activeByPlatform[task.platform] += 1;
    if (BROWSER_PLATFORMS.has(task.platform)) this.activeBrowsers += 1;
    try {
      return await fn();
    } finally {
      this.activeAccounts.delete(task.accountId);
      this.activeByPlatform[task.platform] -= 1;
      if (BROWSER_PLATFORMS.has(task.platform)) this.activeBrowsers -= 1;
    }
  }
}
