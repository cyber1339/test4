import type { GameState, RunRecord, SessionRecord, SessionType, SetRecord } from './types.ts';
import { bestSet, skillStatus, SKILLS, updateStep } from './program.ts';
import { addDays, dayKey, daysBetween, weekStart } from './dates.ts';

export const XP_PER_REP = 2;
export const XP_PER_KM = 12;
/** Volume beyond this per day earns no XP, so the game never rewards overtraining. */
export const DAILY_VOLUME_XP_CAP = 150;
export const DAILY_KM_XP_CAP = 5;
export const COMPLETION_BONUS = 30;

export const xpToReach = (level: number): number => { let t = 0; for (let l = 1; l < level; l++) t += 100 + 40 * (l - 1); return t; };
export const levelFromXp = (xp: number): number => { let l = 1; while (xp >= xpToReach(l + 1)) l++; return l; };
export function levelProgress(xp: number) {
  const level = levelFromXp(xp), a = xpToReach(level), b = xpToReach(level + 1);
  return { level, current: xp - a, needed: b - a, pct: (xp - a) / (b - a) };
}
export const rankKey = (level: number): string =>
  level < 5 ? 'rank.recruit' : level < 10 ? 'rank.athlete' : level < 16 ? 'rank.veteran' : level < 25 ? 'rank.elite' : 'rank.master';

/** Reps count 1 each; hold seconds count 1 per 3 s. */
export const setVolume = (s: SetRecord): number => (s.counter === 'plank' || s.counter === 'hang' || s.counter === 'lsit' ? Math.round(s.value / 3) : s.value);
export const sessionVolume = (h: SessionRecord): number => h.sets.reduce((a, s) => a + setVolume(s), 0);
export const volumeOnDay = (history: SessionRecord[], day: string): number => history.filter((h) => h.day === day).reduce((a, h) => a + sessionVolume(h), 0);
export const kmOnDay = (runs: RunRecord[], day: string): number => runs.filter((r) => r.day === day).reduce((a, r) => a + r.km, 0);

export function activeDays(s: GameState): string[] {
  const d = new Set<string>();
  s.history.forEach((h) => { if (h.kind === 'workout' && sessionVolume(h) > 0) d.add(h.day); });
  s.runs.forEach((r) => d.add(r.day));
  return [...d].sort();
}
/** Streak tolerates one rest day: it breaks only after two consecutive days without activity. */
export function streak(s: GameState, today: string): number {
  const days = activeDays(s).reverse();
  if (!days.length || daysBetween(days[0], today) > 2) return 0;
  let n = 1;
  for (let i = 1; i < days.length; i++) { if (daysBetween(days[i], days[i - 1]) <= 2) n++; else break; }
  return n;
}
export function weekSummary(s: GameState, today: string) {
  const w = weekStart(today);
  const sessions = s.history.filter((h) => h.kind === 'workout' && h.day >= w && sessionVolume(h) > 0).length;
  const runs = s.runs.filter((r) => r.day >= w);
  return { sessions, runs: runs.length, km: runs.reduce((a, r) => a + r.km, 0), goal: 3 };
}

export interface Achievement { id: string; nameKey: string; descKey: string; xp: number; check: (s: GameState, today: string) => boolean }
const workouts = (s: GameState) => s.history.filter((h) => h.kind === 'workout' && sessionVolume(h) > 0).length;
const totalOf = (s: GameState, stepId: string) => s.history.reduce((a, h) => a + h.sets.filter((x) => x.stepId === stepId).reduce((b, x) => b + x.value, 0), 0);
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', nameKey: 'ach.first', descKey: 'ach.first.d', xp: 30, check: (s) => workouts(s) >= 1 },
  { id: 'ten', nameKey: 'ach.ten', descKey: 'ach.ten.d', xp: 100, check: (s) => workouts(s) >= 10 },
  { id: 'push100', nameKey: 'ach.push100', descKey: 'ach.push100.d', xp: 80, check: (s) => totalOf(s, 'push.std') + totalOf(s, 'push.incline') >= 100 },
  { id: 'pull10', nameKey: 'ach.pull10', descKey: 'ach.pull10.d', xp: 120, check: (s) => bestSet(s.history, 'pull.pullup') >= 10 },
  { id: 'firstrun', nameKey: 'ach.firstrun', descKey: 'ach.firstrun.d', xp: 30, check: (s) => s.runs.length >= 1 },
  { id: 'run50', nameKey: 'ach.run50', descKey: 'ach.run50.d', xp: 120, check: (s) => s.runs.reduce((a, r) => a + r.km, 0) >= 50 },
  { id: 'week', nameKey: 'ach.week', descKey: 'ach.week.d', xp: 80, check: (s, d) => weekSummary(s, d).sessions >= 3 },
  { id: 'unlock', nameKey: 'ach.unlock', descKey: 'ach.unlock.d', xp: 150, check: (s) => SKILLS.some((k) => skillStatus(s, k).unlocked) },
];

export interface SessionInput {
  kind: 'workout';
  sessionType: SessionType | null;
  sets: SetRecord[];
  planned: Record<string, number>; // stepId -> planned sets
  adjust: boolean; // false on light / comeback days
  completed: boolean;
  durationSec: number;
  notes: string[];
  comeback?: boolean;
}
export interface SessionSummary { xp: number; volumeXp: number; bonusXp: number; levelBefore: number; levelAfter: number; newAchievements: string[]; promoted: string[] }

function withAchievements(state: GameState, today: string): { state: GameState; ids: string[]; xp: number } {
  let next = state; const ids: string[] = []; let xp = 0;
  for (const a of ACHIEVEMENTS) {
    if (!next.achievements.includes(a.id) && a.check(next, today)) {
      next = { ...next, xp: next.xp + a.xp, achievements: [...next.achievements, a.id] };
      ids.push(a.id); xp += a.xp;
    }
  }
  return { state: next, ids, xp };
}

/** Applies a finished or abandoned workout. Only validated reps / held seconds earn XP. */
export function applySession(state: GameState, input: SessionInput, now: Date): { state: GameState; summary: SessionSummary } {
  const today = dayKey(now);
  const vol = input.sets.reduce((a, s) => a + setVolume(s), 0);
  const room = Math.max(0, DAILY_VOLUME_XP_CAP - volumeOnDay(state.history, today));
  const volumeXp = Math.min(vol, room) * XP_PER_REP;
  const bonusXp = (input.completed ? COMPLETION_BONUS : 0) + (input.comeback && vol > 0 ? 20 : 0);
  let xp = volumeXp + bonusXp;

  const record: SessionRecord = {
    id: `${now.getTime()}`, day: today, at: now.toISOString(), kind: 'workout', sessionType: input.sessionType,
    sets: input.sets, completed: input.completed, xp, durationSec: input.durationSec, notes: input.notes,
  };
  let next: GameState = { ...state, xp: state.xp + xp, history: [...state.history, record] };

  const promoted: string[] = [];
  for (const [stepId, planned] of Object.entries(input.planned)) {
    const sets = input.sets.filter((s) => s.stepId === stepId);
    const before = next.current;
    const upd = updateStep(next, stepId, sets, planned, input.adjust && input.completed);
    next = { ...next, ...upd };
    for (const [line, id] of Object.entries(upd.current)) if (before[line] !== id) promoted.push(id);
  }
  const ach = withAchievements(next, today);
  next = ach.state; xp += ach.xp;
  return {
    state: next,
    summary: { xp, volumeXp, bonusXp, levelBefore: levelFromXp(state.xp), levelAfter: levelFromXp(next.xp), newAchievements: ach.ids, promoted },
  };
}

export function applyRun(state: GameState, run: RunRecord, now: Date): { state: GameState; xp: number; newAchievements: string[] } {
  const today = dayKey(now);
  const room = Math.max(0, DAILY_KM_XP_CAP - kmOnDay(state.runs, today));
  const xp = Math.round(Math.min(run.km, room) * XP_PER_KM);
  let next: GameState = { ...state, xp: state.xp + xp, runs: [...state.runs, run] };
  const ach = withAchievements(next, today);
  next = ach.state;
  return { state: next, xp: xp + ach.xp, newAchievements: ach.ids };
}

export { addDays };
