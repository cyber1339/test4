import type { GameState, SessionType } from './types.ts';
import { getStep, lineSteps } from './program.ts';
import { addDays, dayKey, daysBetween } from './dates.ts';
import { DAILY_VOLUME_XP_CAP, sessionVolume, volumeOnDay } from './progression.ts';

export type PlanKind = 'rest' | 'light' | 'normal' | 'comeback';
export interface Block { stepId: string; sets: number; target: number; restSec: number }
export interface DayPlan {
  kind: PlanKind;
  sessionType: SessionType | null;
  /** multiplier < 1: progression is not adjusted that day */
  multiplier: number;
  reasonKey: string;
  tipKeys: string[];
  blocks: Block[];
}

export const volumeLastDays = (s: GameState, today: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const day = addDays(today, -(n - 1 - i));
    return { day, volume: volumeOnDay(s.history, day), km: s.runs.filter((r) => r.day === day).reduce((a, r) => a + r.km, 0) };
  });

function buildBlocks(s: GameState, type: SessionType, mult: number): Block[] {
  const want: [string, number][] = type === 'A'
    ? [['push', 3], [s.profile.hasParallel ? 'dips' : 'core', 3], ['legs', 3], ['core', 3]]
    : [[s.profile.hasBar ? 'pull' : 'push', 3], ['push', 2], ['legs', 3], ['core', 3]];
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const [line, sets] of want) {
    const id = s.current[line];
    if (!id || (line === 'pull' && !s.profile.hasBar)) continue;
    const key = `${line}:${out.length}`;
    if (seen.has(id) && line !== 'core') continue;
    seen.add(id); void key;
    const step = getStep(id);
    const base = s.steps[id]?.target ?? step.lo;
    const target = Math.max(step.hold ? 5 : 1, Math.round(base * mult));
    out.push({ stepId: id, sets: mult < 1 ? Math.max(2, sets - 1) : sets, target, restSec: step.restSec });
  }
  // The second core slot of session A/B alternates between the line's steps so abs get variety without skipping progression.
  if (out.length >= 4 && out[2].stepId === out[3].stepId) out.pop();
  void lineSteps;
  return out;
}

/** "Today's workout": conservative, alternates A/B, never doubles missed days, never pushes through pain. */
export function recommendToday(s: GameState, now: Date): DayPlan {
  const today = dayKey(now);
  const feeling = s.feeling && s.feeling.day === today ? s.feeling.value : 'ok';
  const workoutDays = [...new Set(s.history.filter((h) => h.kind === 'workout' && sessionVolume(h) > 0).map((h) => h.day))].sort();
  const last = workoutDays[workoutDays.length - 1];
  const gap = last ? daysBetween(last, today) : 99;
  const lastRec = [...s.history].reverse().find((h) => h.kind === 'workout' && h.sessionType);
  const type: SessionType = lastRec?.sessionType === 'A' ? 'B' : 'A';
  const todayVol = volumeOnDay(s.history, today);
  const y1 = volumeOnDay(s.history, addDays(today, -1));
  const y2 = volumeOnDay(s.history, addDays(today, -2));
  const base = { sessionType: type as SessionType | null, tipKeys: [] as string[], blocks: [] as Block[] };

  if (feeling === 'pain') return { ...base, kind: 'rest', sessionType: null, multiplier: 0, reasonKey: 'plan.pain', tipKeys: ['tip.pain', 'tip.rest'] };
  if (todayVol >= DAILY_VOLUME_XP_CAP) return { ...base, kind: 'rest', sessionType: null, multiplier: 0, reasonKey: 'plan.enoughToday', tipKeys: ['tip.rest', 'tip.sleep'] };
  if (y1 > 0 && y2 > 0 && todayVol === 0 && workoutDays.length >= 3) {
    return { ...base, kind: 'rest', sessionType: null, multiplier: 0, reasonKey: 'plan.twoInRow', tipKeys: ['tip.easyRun', 'tip.mobility'] };
  }

  let kind: PlanKind = 'normal', mult = 1, reasonKey = 'plan.normal';
  const tips: string[] = [];
  if (feeling === 'tired' || feeling === 'sore') { kind = 'light'; mult = 0.7; reasonKey = 'plan.tired'; tips.push('tip.mobility', 'tip.sleep'); }
  else if (gap >= 3 && gap < 99) { kind = 'comeback'; mult = 0.6; reasonKey = 'plan.comeback'; tips.push('tip.easyBack'); }
  else if (todayVol > 0) { kind = 'light'; mult = 0.8; reasonKey = 'plan.second'; }
  else tips.push('tip.warmup');

  return { kind, sessionType: type, multiplier: mult, reasonKey, tipKeys: tips, blocks: buildBlocks(s, type, mult) };
}
