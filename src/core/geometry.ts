export interface Landmark { x: number; y: number; z?: number; visibility?: number }

/** MediaPipe Pose landmark indices (subset). */
export const LM = {
  NOSE: 0, MOUTH_L: 9, MOUTH_R: 10,
  L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
} as const;

export const vis = (p?: Landmark): number => p?.visibility ?? 0;

/** Angle at b (degrees 0..180) formed by a-b-c. */
export function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-9) return 180;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Landmarks are normalised per axis; multiply x by aspect (w/h) so angles are not distorted. */
export function toIsotropic(lm: Landmark[], aspect: number): Landmark[] {
  return lm.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z, visibility: p.visibility }));
}

/** Left/right chains of the same joints; pick the better visible side. */
export const SIDES = {
  L: { S: LM.L_SHOULDER, E: LM.L_ELBOW, W: LM.L_WRIST, H: LM.L_HIP, K: LM.L_KNEE, A: LM.L_ANKLE },
  R: { S: LM.R_SHOULDER, E: LM.R_ELBOW, W: LM.R_WRIST, H: LM.R_HIP, K: LM.R_KNEE, A: LM.R_ANKLE },
} as const;
export type Chain = (typeof SIDES)['L'] | (typeof SIDES)['R'];
export type JointKey = keyof Chain;

export function bestSide(lm: Landmark[], keys: JointKey[]): { chain: Chain; conf: number } {
  const score = (c: Chain) => mean(keys.map((k) => vis(lm[c[k]])));
  const l = score(SIDES.L), r = score(SIDES.R);
  return l >= r ? { chain: SIDES.L, conf: l } : { chain: SIDES.R, conf: r };
}
