import type { CounterKind } from './types.ts';
import { LM, bestSide, mean, toIsotropic, vis } from './geometry.ts';
import type { JointKey, Landmark } from './geometry.ts';

export interface FramingResult { ok: boolean; confidence: number; message: string }

const SIDE_KEYS: Record<Exclude<CounterKind, 'pullup' | 'hang'>, JointKey[]> = {
  pushup: ['S', 'E', 'W', 'H', 'A'],
  plank: ['S', 'H', 'A'],
  dip: ['S', 'E', 'W', 'H'],
  squat: ['S', 'H', 'K', 'A'],
  situp: ['S', 'H', 'K'],
  lsit: ['S', 'E', 'W', 'H', 'K', 'A'],
};
const NEEDS_HORIZONTAL: CounterKind[] = ['pushup', 'plank', 'situp'];
const inFrame = (p: Landmark) => p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;

/** Pre-training check: visible enough and in a plausible start posture? */
export function checkFraming(lm: Landmark[] | null, kind: CounterKind, aspect: number): FramingResult {
  if (!lm || lm.length < 29) return { ok: false, confidence: 0, message: 'cal.noBody' };
  const p = toIsotropic(lm, aspect);

  if (kind === 'pullup' || kind === 'hang') {
    const ids = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST, LM.L_HIP, LM.R_HIP, LM.NOSE];
    const conf = mean(ids.map((i) => vis(p[i])));
    if (conf < 0.5) return { ok: false, confidence: conf, message: 'cal.noWrists' };
    if (!ids.every((i) => inFrame(lm[i]))) return { ok: false, confidence: conf, message: 'cal.moveBack' };
    const wristY = mean([p[LM.L_WRIST].y, p[LM.R_WRIST].y]);
    const shoulderY = mean([p[LM.L_SHOULDER].y, p[LM.R_SHOULDER].y]);
    if (wristY > shoulderY) return { ok: false, confidence: conf, message: 'cal.grabBar' };
    return { ok: true, confidence: conf, message: 'cal.ready' };
  }

  const keys = SIDE_KEYS[kind];
  const { chain, conf } = bestSide(p, keys);
  if (conf < 0.5) {
    const missing = keys.find((k) => vis(p[chain[k]]) < 0.5);
    return { ok: false, confidence: conf, message: missing === 'W' ? 'cal.noWrists' : 'cal.moveBack' };
  }
  if (!keys.every((k) => inFrame(lm[chain[k]]))) return { ok: false, confidence: conf, message: 'cal.moveBack' };
  if (NEEDS_HORIZONTAL.includes(kind)) {
    const s = p[chain.S];
    const far = p[kind === 'situp' ? chain.K : chain.A];
    if (!(Math.abs(s.x - far.x) > Math.abs(s.y - far.y) * 1.2)) return { ok: false, confidence: conf, message: 'cal.getDown' };
  }
  return { ok: true, confidence: conf, message: 'cal.ready' };
}
