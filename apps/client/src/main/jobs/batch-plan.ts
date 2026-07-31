export interface BatchPair {
  accountId: string;
  videoId: string;
}

/** Builds every video × every account exactly once. */
export function buildBatchPairs(accountIds: string[], videoIds: string[]): BatchPair[] {
  return videoIds.flatMap((videoId) =>
    accountIds.map((accountId) => ({ accountId, videoId })),
  );
}
