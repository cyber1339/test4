/** GPS run tracking: pure logic (distance, pace, calories, splits). The browser only feeds points. */
export interface GpsPoint { lat: number; lon: number; acc: number; t: number }

export const MAX_ACCURACY_M = 30;
export const MAX_SPEED_MS = 12; // above this a jump is GPS noise, not running
export const MIN_STEP_M = 3;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** MET by speed (km/h), interpolated from the Compendium of Physical Activities (walking and running). Estimate only. */
const MET_TABLE: [number, number][] = [[3.2, 2.5], [4.8, 3.3], [5.6, 4.3], [6.4, 5.0], [8.0, 8.3], [9.7, 9.8], [11.3, 11.0], [12.9, 11.8], [14.5, 12.8], [16.1, 14.5]];
export function metForSpeed(kmh: number): number {
  if (kmh <= MET_TABLE[0][0]) return MET_TABLE[0][1];
  for (let i = 1; i < MET_TABLE.length; i++) {
    const [x1, y1] = MET_TABLE[i - 1], [x2, y2] = MET_TABLE[i];
    if (kmh <= x2) return y1 + ((y2 - y1) * (kmh - x1)) / (x2 - x1);
  }
  return MET_TABLE[MET_TABLE.length - 1][1];
}
export const kcalFor = (kmh: number, kg: number, seconds: number): number => metForSpeed(kmh) * kg * (seconds / 3600);
export const paceSecPerKm = (km: number, seconds: number): number => (km > 0.01 ? seconds / km : 0);
export function formatPace(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm > 3600) return '--:--';
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
export function manualRun(km: number, seconds: number, kg: number) {
  const kmh = seconds > 0 ? (km / seconds) * 3600 : 0;
  return { paceSecPerKm: paceSecPerKm(km, seconds), kcal: Math.round(kcalFor(kmh, kg, seconds)) };
}

export interface RunSnapshot { km: number; seconds: number; avgPace: number; currentPace: number; kcal: number; splits: number[]; gpsOk: boolean }

export class RunTracker {
  private anchor: GpsPoint | null = null;
  private distM = 0;
  private kcal = 0;
  private startT: number | null = null;
  private pausedMs = 0;
  private pausedAt: number | null = null;
  private recent: { t: number; d: number }[] = [];
  private splitMarks: number[] = [];
  private lastAcc = 0;
  private weightKg: number;
  constructor(weightKg: number) { this.weightKg = weightKg; }

  start(now: number): void { this.startT = now; }
  pause(now: number): void { if (this.pausedAt === null) { this.pausedAt = now; this.anchor = null; } }
  resume(now: number): void { if (this.pausedAt !== null) { this.pausedMs += now - this.pausedAt; this.pausedAt = null; } }
  get paused(): boolean { return this.pausedAt !== null; }

  /** Returns true if the point was used. Bad/noisy points are ignored, never invented. */
  addPoint(p: GpsPoint): boolean {
    if (this.startT === null || this.pausedAt !== null) return false;
    this.lastAcc = p.acc;
    if (p.acc > MAX_ACCURACY_M) return false;
    if (!this.anchor) { this.anchor = p; return true; }
    const dt = (p.t - this.anchor.t) / 1000;
    if (dt <= 0) return false;
    const d = haversine(this.anchor, p);
    if (d < Math.max(MIN_STEP_M, p.acc * 0.25)) return false; // jitter: wait until we truly moved
    if (d / dt > MAX_SPEED_MS) return false;
    const before = this.distM;
    this.distM += d;
    this.kcal += kcalFor((d / dt) * 3.6, this.weightKg, dt);
    this.recent.push({ t: p.t, d });
    this.recent = this.recent.filter((r) => p.t - r.t <= 30000);
    const elapsedAt = ((p.t - this.startT - this.pausedMs) / 1000);
    for (let k = Math.floor(before / 1000) + 1; k <= Math.floor(this.distM / 1000); k++) {
      const frac = (k * 1000 - before) / d; // interpolate the moment the km was crossed
      this.splitMarks.push(elapsedAt - dt * (1 - frac));
    }
    this.anchor = p;
    return true;
  }

  snapshot(now: number): RunSnapshot {
    const end = this.pausedAt ?? now;
    const seconds = this.startT === null ? 0 : Math.max(0, (end - this.startT - this.pausedMs) / 1000);
    const km = this.distM / 1000;
    const win = this.recent.reduce((a, r) => a + r.d, 0);
    const winT = this.recent.length > 1 ? (this.recent[this.recent.length - 1].t - this.recent[0].t) / 1000 : 0;
    const splits = this.splitMarks.map((m, i) => Math.round(m - (i > 0 ? this.splitMarks[i - 1] : 0)));
    return {
      km, seconds, avgPace: paceSecPerKm(km, seconds), currentPace: win > 10 && winT > 5 ? winT / (win / 1000) : 0,
      kcal: Math.round(this.kcal), splits, gpsOk: this.lastAcc > 0 && this.lastAcc <= MAX_ACCURACY_M,
    };
  }
}
