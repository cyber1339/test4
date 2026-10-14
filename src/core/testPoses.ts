// Synthetic pose generators for unit tests (no camera needed).
import type { Landmark } from './geometry.ts';
import { LM } from './geometry.ts';

const blank = (): Landmark[] => Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
const set = (lm: Landmark[], i: number, x: number, y: number, v = 0.95) => { lm[i] = { x, y, visibility: v }; };

/** Three landmarks a-b-c forming `deg` at b. Everything else invisible. */
export function jointPose(ids: [number, number, number], deg: number): Landmark[] {
  const lm = blank();
  const r = (deg * Math.PI) / 180;
  set(lm, ids[1], 0.5, 0.5);
  set(lm, ids[0], 0.5, 0.4);
  set(lm, ids[2], 0.5 + 0.1 * Math.sin(r), 0.5 - 0.1 * Math.cos(r));
  return lm;
}
export const squatPose = (deg: number) => jointPose([LM.R_HIP, LM.R_KNEE, LM.R_ANKLE], deg);
export const situpPose = (deg: number) => jointPose([LM.R_SHOULDER, LM.R_HIP, LM.R_KNEE], deg);
export const dipPose = (deg: number) => jointPose([LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST], deg);

/** Side view of a pushup. `hipDrop` > 0 sags the hips. */
export function pushupPose(elbow: number, hipDrop = 0): Landmark[] {
  const lm = blank();
  const r = (elbow * Math.PI) / 180;
  set(lm, LM.R_SHOULDER, 0.3, 0.5);
  set(lm, LM.R_ELBOW, 0.3, 0.6);
  set(lm, LM.R_WRIST, 0.3 + 0.1 * Math.sin(r), 0.6 - 0.1 * Math.cos(r));
  set(lm, LM.R_HIP, 0.5, 0.5 + hipDrop);
  set(lm, LM.R_ANKLE, 0.7, 0.5);
  return lm;
}

/** Front view of a pullup. `chinAbove`: mouth above wrists. `shouldersAtBar`: shoulders up to wrist height. */
export function pullupPose(elbow: number, chinAbove: boolean, hipX = 0.5, shouldersAtBar = false): Landmark[] {
  const lm = blank();
  const r = (elbow * Math.PI) / 180;
  for (const [sh, el, wr, hip, cx] of [
    [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, LM.L_HIP, 0.4],
    [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, LM.R_HIP, 0.6],
  ] as const) {
    set(lm, wr, cx, 0.4);
    set(lm, el, cx, 0.5);
    set(lm, sh, cx + 0.1 * Math.sin(r) * (cx < 0.5 ? -1 : 1), shouldersAtBar ? 0.38 : 0.5 - 0.1 * Math.cos(r));
    set(lm, hip, hipX + (cx < 0.5 ? -0.05 : 0.05), 0.8);
  }
  const mouthY = chinAbove ? 0.37 : 0.52;
  set(lm, LM.MOUTH_L, 0.48, mouthY);
  set(lm, LM.MOUTH_R, 0.52, mouthY);
  return lm;
}

export function plankPose(hipDrop = 0): Landmark[] {
  const lm = blank();
  set(lm, LM.R_SHOULDER, 0.3, 0.5); set(lm, LM.R_HIP, 0.5, 0.5 + hipDrop); set(lm, LM.R_ANKLE, 0.7, 0.5);
  return lm;
}
export function hangPose(elbow: number): Landmark[] {
  const lm = blank();
  const r = (elbow * Math.PI) / 180;
  for (const [sh, el, wr, cx] of [[LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, 0.4], [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, 0.6]] as const) {
    set(lm, wr, cx, 0.4); set(lm, el, cx, 0.5);
    set(lm, sh, cx + 0.1 * Math.sin(r) * (cx < 0.5 ? -1 : 1), 0.5 - 0.1 * Math.cos(r));
  }
  return lm;
}

/** Joint-angle profile of one rep at `fps`: top -> bottom -> hold -> top. */
export function repProfile(o: { top?: number; bottom: number; downMs?: number; holdMs?: number; upMs?: number; fps?: number }): number[] {
  const { top = 170, bottom, downMs = 800, holdMs = 200, upMs = 800, fps = 30 } = o;
  const n = (ms: number) => Math.max(1, Math.round((ms / 1000) * fps));
  const out: number[] = [];
  for (let i = 0; i < 10; i++) out.push(top);
  for (let i = 1; i <= n(downMs); i++) out.push(top + ((bottom - top) * i) / n(downMs));
  for (let i = 0; i < n(holdMs); i++) out.push(bottom);
  for (let i = 1; i <= n(upMs); i++) out.push(bottom + ((top - bottom) * i) / n(upMs));
  for (let i = 0; i < 10; i++) out.push(top);
  return out;
}
