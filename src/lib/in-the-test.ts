import type { CircadiaState } from "@/lib/types";

/** Consented, or an episode is open. Broader than isObserving. */
export function inTheTest(state: Pick<CircadiaState, "study" | "episode">): boolean {
  return state.study.consented === true || state.episode !== null;
}
