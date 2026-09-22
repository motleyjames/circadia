/** The deployed Worker. One origin. The phone will import this file as-is. */
export const CIRCADIA_SYNC_ORIGIN = "https://circadia-sync.motleyjames.workers.dev";

export const WORKER_OBJECT_ID = /^[0-9a-f]{64}$/;

export function circadiaVaultUrl(workerId: string): string {
  if (!WORKER_OBJECT_ID.test(workerId)) {
    throw new Error("Invalid Worker id.");
  }
  return `${CIRCADIA_SYNC_ORIGIN}/vault/${workerId}`;
}
