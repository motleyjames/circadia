/** Diary is 43147. Operator is a second process on 43149. */
export const OPERATOR_PORT = 43149;

export function isOperatorSurface(): boolean {
  return process.env.NEXT_PUBLIC_CIRCADIA_SURFACE === "mod" || process.env.CIRCADIA_SURFACE === "mod";
}
