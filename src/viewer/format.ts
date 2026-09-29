/** Compact number for UI labels (3 significant digits, no trailing zeros). */
export const fmtNum = (v: number): string => String(Number(v.toPrecision(3)))
