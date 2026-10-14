import type { GameState } from './types.ts';
import { levelFromXp } from './progression.ts';
import { STEPS } from './program.ts';

export const bmi = (kg: number, cm: number): number => kg / Math.pow(cm / 100, 2);
export const latestWeight = (s: GameState): number => s.weightLog.length ? s.weightLog[s.weightLog.length - 1].kg : s.profile.weightKg;

/** 0 = lean frame ... 1 = heavy frame. Derived from the user's own height and weight. */
export const frame = (kg: number, cm: number): number => Math.max(0, Math.min(1, (bmi(kg, cm) - 18) / 16));

/** 0..1 development score: grows with rank and with unlocked progressions, never shrinks. */
export function muscleScore(s: GameState): number {
  const lvl = Math.min(1, (levelFromXp(s.xp) - 1) / 24);
  const unlocked = STEPS.filter((st) => (s.steps[st.id]?.target ?? 0) > st.lo || s.current[st.line] === st.id).length;
  const steps = Math.min(1, unlocked / STEPS.length);
  return Math.min(1, lvl * 0.6 + steps * 0.4);
}
