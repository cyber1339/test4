import type { CounterKind } from './types.ts';
import { angle, bestSide, mean, toIsotropic, vis } from './geometry.ts';
import type { Landmark } from './geometry.ts';

export type HoldKind = 'plank' | 'hang' | 'lsit';
export const isHoldKind = (k: CounterKind): k is HoldKind => k === 'plank' || k === 'hang' || k === 'lsit';

export interface HoldResult { seconds: number; holding: boolean; confidence: number; feedback: string | null }

/**
 * Counts seconds only while the position is valid. A hold must be valid for `startMs` before it starts,
 * and a short glitch (`graceMs`) does not reset it. Low confidence never adds time.
 */
export class HoldTracker {
  readonly kind: HoldKind;
  private ms = 0;
  private validSince: number | null = null;
  private lastT: number | null = null;
  private lastValidT = 0;
  private active = false;
  paused = false;
  private startMs: number;
  private graceMs: number;
  constructor(kind: HoldKind, startMs = 500, graceMs = 400) { this.kind = kind; this.startMs = startMs; this.graceMs = graceMs; }

  get seconds(): number { return this.ms / 1000; }
  reset(): void { this.ms = 0; this.validSince = null; this.lastT = null; this.active = false; }
  pause(): void { this.paused = true; this.validSince = null; this.lastT = null; this.active = false; }
  resume(): void { this.paused = false; }

  update(lm: Landmark[] | null, t: number, aspect = 1): HoldResult {
    if (this.paused) return { seconds: this.seconds, holding: false, confidence: 0, feedback: null };
    const chk = lm && lm.length >= 29 ? check(this.kind, toIsotropic(lm, aspect)) : { ok: false, conf: 0, fb: 'fb.lost' };
    const dt = this.lastT === null ? 0 : t - this.lastT;
    this.lastT = t;
    if (chk.ok) {
      this.lastValidT = t;
      if (this.validSince === null) this.validSince = t;
      if (!this.active && t - this.validSince >= this.startMs) this.active = true;
      if (this.active) this.ms += dt;
    } else if (t - this.lastValidT > this.graceMs) {
      this.validSince = null;
      this.active = false;
    }
    return { seconds: this.seconds, holding: this.active && chk.ok, confidence: chk.conf, feedback: chk.ok ? null : chk.fb };
  }
}

function check(kind: HoldKind, lm: Landmark[]): { ok: boolean; conf: number; fb: string | null } {
  if (kind === 'hang') {
    const arms = [[11, 13, 15], [12, 14, 16]].map((ids) => ({ ids, conf: mean(ids.map((i) => vis(lm[i]))) })).filter((a) => a.conf >= 0.5);
    if (!arms.length) return { ok: false, conf: 0, fb: 'fb.lost' };
    const elbow = mean(arms.map((a) => angle(lm[a.ids[0]], lm[a.ids[1]], lm[a.ids[2]])));
    const above = arms.every((a) => lm[a.ids[2]].y < lm[a.ids[0]].y);
    const conf = mean(arms.map((a) => a.conf));
    if (!above) return { ok: false, conf, fb: 'fb.grabBar' };
    if (elbow < 150) return { ok: false, conf, fb: 'fb.armsStraight' };
    return { ok: true, conf, fb: null };
  }
  const keys = kind === 'plank' ? (['S', 'H', 'A'] as const) : (['S', 'E', 'W', 'H', 'K', 'A'] as const);
  const { chain, conf } = bestSide(lm, [...keys]);
  if (conf < 0.5) return { ok: false, conf, fb: 'fb.lost' };
  const [S, H, A] = [lm[chain.S], lm[chain.H], lm[chain.A]];
  if (kind === 'plank') {
    const horizontal = Math.abs(S.x - A.x) > Math.abs(S.y - A.y) * 1.5;
    if (!horizontal) return { ok: false, conf, fb: 'fb.getInPosition' };
    if (angle(S, H, A) < 160) return { ok: false, conf, fb: 'fb.straight' };
    return { ok: true, conf, fb: null };
  }
  // L-sit (beta): straight arms, legs straight and raised near hip height
  const armsStraight = angle(S, lm[chain.E], lm[chain.W]) >= 150;
  const legsStraight = angle(H, lm[chain.K], A) >= 150;
  const legLen = Math.hypot(A.x - H.x, A.y - H.y) || 1;
  const legsUp = Math.abs(A.y - H.y) <= 0.4 * legLen;
  if (!armsStraight) return { ok: false, conf, fb: 'fb.armsStraight' };
  if (!legsStraight) return { ok: false, conf, fb: 'fb.legsStraight' };
  if (!legsUp) return { ok: false, conf, fb: 'fb.legsUp' };
  return { ok: true, conf, fb: null };
}
