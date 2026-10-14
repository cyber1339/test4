import type { CounterKind } from './types.ts';
import { LM, angle, bestSide, mean, median, toIsotropic, vis } from './geometry.ts';
import type { Landmark } from './geometry.ts';

/**
 * Rep counting state machine. Pure logic: no DOM/camera/React; time is injected (ms).
 * Pushup/dip/squat: READY -> DESCENDING -> BOTTOM -> ASCENDING -> COMPLETED
 * Pullup/situp:     READY -> ASCENDING  -> TOP    -> DESCENDING -> COMPLETED
 * LOST = not tracking (no/low-confidence detection, or not re-armed at the start position).
 */
export type RepKind = 'pushup' | 'pullup' | 'squat' | 'situp' | 'dip';
export const isRepKind = (k: CounterKind): k is RepKind => ['pushup', 'pullup', 'squat', 'situp', 'dip'].includes(k);

export type Phase = 'LOST' | 'READY' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING' | 'TOP' | 'COMPLETED';
export type RejectReason = 'DEPTH' | 'BODY' | 'FAST' | 'LOST';
export type Warning = 'BODY' | 'SWING';
export type RepEvent = { type: 'valid'; warnings: Warning[] } | { type: 'rejected'; reason: RejectReason };

export interface FrameResult {
  phase: Phase;
  confidence: number; // 0..1
  angle: number | null; // smoothed primary joint angle
  feedback: string | null; // i18n key
  event?: RepEvent;
}

export interface Tuning {
  extended: number; leave: number; peak: number; release: number;
  minRepMs: number; maxRepMs: number; minConfidence: number; lostMs: number;
  armFrames: number; smoothing: number;
  bodyRejectDeg: number; bodyWarnDeg: number; // 0 = body line not checked
  chestToBar: boolean;
}

const BASE: Tuning = {
  extended: 150, leave: 135, peak: 100, release: 115,
  minRepMs: 900, maxRepMs: 30000, minConfidence: 0.5, lostMs: 600,
  armFrames: 5, smoothing: 0.5, bodyRejectDeg: 0, bodyWarnDeg: 0, chestToBar: false,
};

export const DEFAULT_TUNING: Record<RepKind, Tuning> = {
  pushup: { ...BASE, bodyRejectDeg: 145, bodyWarnDeg: 160 },
  pullup: { ...BASE, peak: 90, release: 110, minRepMs: 1200 },
  dip: { ...BASE, peak: 105, release: 120, minRepMs: 1000 },
  squat: { ...BASE, extended: 160, leave: 145, peak: 100, release: 120, minRepMs: 1200 },
  situp: { ...BASE, extended: 125, leave: 115, peak: 80, release: 100, minRepMs: 1000 },
};

const PH = {
  down: { down: 'DESCENDING', peak: 'BOTTOM', up: 'ASCENDING' },
  pull: { down: 'ASCENDING', peak: 'TOP', up: 'DESCENDING' },
} as const;
const phasesFor = (k: RepKind) => (k === 'pullup' || k === 'situp' ? PH.pull : PH.down);

interface Measure {
  primary: number; confidence: number;
  body?: number; chinAbove?: boolean; chinUnknown?: boolean; shouldersAtBar?: boolean;
  hipX?: number; shoulderWidth?: number;
}
type Measured = { m: Measure | null; confidence: number };

function measureArmBody(lm: Landmark[], withBody: boolean, minConf: number): Measured {
  const { chain, conf } = bestSide(lm, ['S', 'E', 'W']);
  if (conf < minConf) return { m: null, confidence: conf };
  const m: Measure = { primary: angle(lm[chain.S], lm[chain.E], lm[chain.W]), confidence: conf };
  if (withBody) {
    if (vis(lm[chain.A]) >= 0.4) m.body = angle(lm[chain.S], lm[chain.H], lm[chain.A]);
    else if (vis(lm[chain.K]) >= 0.4) m.body = angle(lm[chain.S], lm[chain.H], lm[chain.K]);
  }
  return { m, confidence: conf };
}

function measurePullup(lm: Landmark[], cfg: Tuning): Measured {
  const arms = [
    [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST],
    [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST],
  ].map((ids) => ({ ids, conf: mean(ids.map((i) => vis(lm[i]))) }));
  const good = arms.filter((a) => a.conf >= cfg.minConfidence);
  if (!good.length) return { m: null, confidence: Math.max(arms[0].conf, arms[1].conf) };
  const primary = mean(good.map((a) => angle(lm[a.ids[0]], lm[a.ids[1]], lm[a.ids[2]])));
  const wristY = mean(good.map((a) => lm[a.ids[2]].y));
  const m: Measure = { primary, confidence: mean(good.map((a) => a.conf)) };
  const mouths = [lm[LM.MOUTH_L], lm[LM.MOUTH_R]].filter((p) => vis(p) >= 0.4);
  if (mouths.length) m.chinAbove = mean(mouths.map((p) => p.y)) < wristY;
  else m.chinUnknown = true;
  const sh = [lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]];
  const shY = mean(sh.filter((p) => vis(p) >= 0.4).map((p) => p.y));
  if (!Number.isNaN(shY) && sh.some((p) => vis(p) >= 0.4)) m.shouldersAtBar = shY <= wristY + 0.03;
  const hips = [lm[LM.L_HIP], lm[LM.R_HIP]].filter((p) => vis(p) >= 0.4);
  if (hips.length && vis(sh[0]) >= 0.4 && vis(sh[1]) >= 0.4) {
    m.hipX = mean(hips.map((p) => p.x));
    m.shoulderWidth = Math.abs(sh[0].x - sh[1].x);
  }
  return { m, confidence: m.confidence };
}

function measure(kind: RepKind, lm: Landmark[], cfg: Tuning): Measured {
  switch (kind) {
    case 'pushup': return measureArmBody(lm, cfg.bodyRejectDeg > 0, cfg.minConfidence);
    case 'dip': return measureArmBody(lm, false, cfg.minConfidence);
    case 'pullup': return measurePullup(lm, cfg);
    case 'squat': {
      const { chain, conf } = bestSide(lm, ['H', 'K', 'A']);
      if (conf < cfg.minConfidence) return { m: null, confidence: conf };
      return { m: { primary: angle(lm[chain.H], lm[chain.K], lm[chain.A]), confidence: conf }, confidence: conf };
    }
    case 'situp': {
      const { chain, conf } = bestSide(lm, ['S', 'H', 'K']);
      if (conf < cfg.minConfidence) return { m: null, confidence: conf };
      return { m: { primary: angle(lm[chain.S], lm[chain.H], lm[chain.K]), confidence: conf }, confidence: conf };
    }
  }
}

export class RepCounter {
  readonly kind: RepKind;
  private cfg: Tuning;
  private ph;
  phase: Phase = 'LOST';
  valid = 0;
  rejected = 0;
  paused = false;

  private smooth: number | null = null;
  private armed = 0;
  private lowSince: number | null = null;
  private inRep = false;
  private startT = 0;
  private minAngle = 180;
  private body: number[] = [];
  private hipXs: number[] = [];
  private shoulderW: number[] = [];
  private chinWarned = false;

  constructor(kind: RepKind, tuning: Partial<Tuning> = {}) {
    this.kind = kind;
    this.cfg = { ...DEFAULT_TUNING[kind], ...tuning };
    this.ph = phasesFor(kind);
  }

  reset(): void { this.valid = 0; this.rejected = 0; this.softReset(); }
  private softReset(): void { this.smooth = null; this.armed = 0; this.lowSince = null; this.inRep = false; this.phase = 'LOST'; }
  pause(): void { this.paused = true; this.softReset(); }
  resume(): void { this.paused = false; this.softReset(); }

  private startRep(t: number, s: number): void {
    this.inRep = true; this.startT = t; this.minAngle = s;
    this.body = []; this.hipXs = []; this.shoulderW = []; this.chinWarned = false;
  }
  private sample(m: Measure): void {
    if (m.body !== undefined) this.body.push(m.body);
    if (m.hipX !== undefined && m.shoulderWidth !== undefined) { this.hipXs.push(m.hipX); this.shoulderW.push(m.shoulderWidth); }
  }
  private abort(): void { this.inRep = false; this.phase = 'LOST'; this.armed = 0; this.smooth = null; }

  /** Feed one video frame. lm = 33 landmarks or null if nobody detected. */
  update(lm: Landmark[] | null, t: number, aspect = 1): FrameResult {
    if (this.paused) return this.out(0, null, null);
    const raw = lm && lm.length >= 29 ? toIsotropic(lm, aspect) : null;
    const meas = raw ? measure(this.kind, raw, this.cfg) : null;
    const m = meas ? meas.m : null;
    const conf = meas ? meas.confidence : 0;
    const c = this.cfg;

    if (!m) {
      if (this.lowSince === null) this.lowSince = t;
      if (t - this.lowSince > c.lostMs && this.phase !== 'LOST') {
        const wasInRep = this.inRep;
        this.abort();
        if (wasInRep) return this.reject('LOST', conf);
      }
      return this.out(conf, this.smooth, this.phase === 'LOST' ? 'fb.lost' : null);
    }
    this.lowSince = null;
    const s = this.smooth === null ? m.primary : c.smoothing * m.primary + (1 - c.smoothing) * this.smooth;
    this.smooth = s;

    if (this.phase === 'LOST') {
      this.armed = s >= c.extended ? this.armed + 1 : 0;
      if (this.armed >= c.armFrames) this.phase = 'READY';
      return this.out(conf, s, this.phase === 'READY' ? 'fb.ready' : 'fb.getInPosition');
    }
    if (this.phase === 'READY') {
      if (s < c.leave) { this.startRep(t, s); this.phase = this.ph.down; this.sample(m); }
      return this.out(conf, s, null);
    }

    this.sample(m);
    this.minAngle = Math.min(this.minAngle, s);
    if (t - this.startT > c.maxRepMs) { this.abort(); return this.out(conf, s, null); }

    if (this.phase === this.ph.down) {
      const needsChin = this.kind === 'pullup';
      const chinOk = !needsChin || (m.chinAbove === true && (!c.chestToBar || m.shouldersAtBar === true));
      if (s <= c.peak && chinOk) this.phase = this.ph.peak;
      else if (s <= c.peak && needsChin && m.chinUnknown && !this.chinWarned) { this.chinWarned = true; return this.out(conf, s, 'fb.chinUnknown'); }
      else if (s >= c.extended) {
        this.inRep = false; this.phase = 'READY';
        if (this.minAngle < c.extended - 30) return this.reject('DEPTH', conf);
      }
    } else if (this.phase === this.ph.peak) {
      if (s >= c.release) this.phase = this.ph.up;
    } else if (this.phase === this.ph.up) {
      if (s <= c.peak) this.phase = this.ph.peak; // bounce: same rep
      else if (s >= c.extended) return this.complete(t, conf, s);
    }
    return this.out(conf, s, null);
  }

  private complete(t: number, conf: number, s: number): FrameResult {
    const c = this.cfg;
    this.inRep = false; this.phase = 'READY';
    if (t - this.startT < c.minRepMs) return this.reject('FAST', conf);
    const warnings: Warning[] = [];
    if (this.kind === 'pushup' && c.bodyRejectDeg > 0 && this.body.length >= 3) {
      const b = median(this.body);
      if (b < c.bodyRejectDeg) return this.reject('BODY', conf);
      if (b < c.bodyWarnDeg) warnings.push('BODY');
    }
    if (this.kind === 'pullup' && this.hipXs.length >= 3) {
      const w = median(this.shoulderW);
      const range = Math.max(...this.hipXs) - Math.min(...this.hipXs);
      if (w > 0.05 && range / w > 1.2) warnings.push('SWING');
    }
    this.valid += 1;
    return {
      phase: 'COMPLETED', confidence: conf, angle: s,
      feedback: warnings.includes('BODY') ? 'fb.validBody' : warnings.includes('SWING') ? 'fb.validSwing' : 'fb.valid',
      event: { type: 'valid', warnings },
    };
  }

  private reject(reason: RejectReason, conf: number): FrameResult {
    this.rejected += 1;
    const depthKey = this.kind === 'pullup' || this.kind === 'situp' ? 'fb.higher' : 'fb.deeper';
    const key: Record<RejectReason, string> = { DEPTH: depthKey, BODY: 'fb.straight', FAST: 'fb.control', LOST: 'fb.abortedLost' };
    return { phase: this.phase, confidence: conf, angle: this.smooth, feedback: key[reason], event: { type: 'rejected', reason } };
  }
  private out(conf: number, s: number | null, fb: string | null): FrameResult {
    return { phase: this.phase, confidence: conf, angle: s, feedback: fb };
  }
}
