export const ERASE_CONFIRM_WORD = "erase";

export function typedWordMatches(typed: string, expected: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase();
}
