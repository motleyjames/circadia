export const ERASE_CONFIRM_WORD = "erase";
export const DELETE_STUDY_CONFIRM = "delete study data";
export const DELETE_TESTER_NIGHTS_CONFIRM = "delete nights";

export function typedWordMatches(typed: string, expected: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase();
}
