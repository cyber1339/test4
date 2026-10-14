import type { CounterKind, GameState, LineId, Profile, SessionRecord, SetRecord, StepState } from './types.ts';
import type { Tuning } from './repCounter.ts';

/**
 * Progression program. Double progression: reps per set rise inside [lo, hi]; after the top of the range
 * is reached cleanly in two sessions, the next variation of the line unlocks.
 * Rep ranges and the muscle-up prerequisites follow common coaching guidelines (see SKILLS), not clinical norms.
 */
export interface Step {
  id: string;
  line: LineId;
  nameKey: string;
  counter: CounterKind;
  tuning?: Partial<Tuning>;
  sets: number;
  lo: number;
  hi: number;
  inc: number; // increase per successful session (reps or seconds)
  hold: boolean;
  beta: boolean; // camera validation is approximate
  restSec: number;
  guideKey: string;
}

const rep = (id: string, line: LineId, counter: CounterKind, lo: number, hi: number, o: Partial<Step> = {}): Step => ({
  id, line, nameKey: `step.${id}`, counter, sets: 3, lo, hi, inc: 1, hold: false, beta: false, restSec: 75, guideKey: `guide.${counter}`, ...o,
});
const hold = (id: string, line: LineId, counter: CounterKind, lo: number, hi: number, o: Partial<Step> = {}): Step =>
  rep(id, line, counter, lo, hi, { hold: true, inc: 5, ...o });

export const STEPS: Step[] = [
  rep('push.incline', 'push', 'pushup', 8, 15),
  rep('push.std', 'push', 'pushup', 6, 15),
  rep('push.diamond', 'push', 'pushup', 6, 12, { tuning: { peak: 105 } }),
  rep('push.pike', 'push', 'pushup', 5, 12, { tuning: { bodyRejectDeg: 0, bodyWarnDeg: 0 }, beta: true }),
  hold('pull.hang', 'pull', 'hang', 15, 45),
  rep('pull.pullup', 'pull', 'pullup', 3, 10, { restSec: 120 }),
  rep('pull.c2b', 'pull', 'pullup', 3, 8, { tuning: { peak: 75, chestToBar: true }, restSec: 120, beta: true }),
  rep('legs.squat', 'legs', 'squat', 10, 25, { inc: 2 }),
  rep('legs.pistol', 'legs', 'squat', 3, 8, { tuning: { peak: 90, minRepMs: 1800 }, beta: true }),
  rep('core.situp', 'core', 'situp', 10, 25, { inc: 2, restSec: 60 }),
  hold('core.plank', 'core', 'plank', 20, 60, { restSec: 60 }),
  hold('core.lsit', 'core', 'lsit', 5, 30, { inc: 2, beta: true, restSec: 90 }),
  rep('dips.dip', 'dips', 'dip', 5, 12, { restSec: 120 }),
];
export const getStep = (id: string): Step => STEPS.find((s) => s.id === id)!;
export const lineSteps = (line: LineId): Step[] => STEPS.filter((s) => s.line === line);
export const nextStep = (id: string): Step | undefined => {
  const s = getStep(id);
  const l = lineSteps(s.line);
  return l[l.indexOf(s) + 1];
};

/** Skills the camera cannot validate. They unlock from camera-verified prerequisites and are logged by hand (no XP). */
export interface Requirement { stepId: string; min: number }
export interface Skill { id: string; nameKey: string; descKey: string; req: Requirement[]; drills: string[]; needs?: 'bar' | 'parallel' }
export const SKILLS: Skill[] = [
  {
    id: 'muscleup', nameKey: 'skill.muscleup', descKey: 'skill.muscleup.d',
    req: [{ stepId: 'pull.pullup', min: 10 }, { stepId: 'pull.c2b', min: 5 }, { stepId: 'dips.dip', min: 10 }],
    drills: ['drill.explosivePull', 'drill.negativeMU', 'drill.transition', 'drill.highDips'], needs: 'bar',
  },
  {
    id: 'frontlever', nameKey: 'skill.frontlever', descKey: 'skill.frontlever.d',
    req: [{ stepId: 'pull.pullup', min: 10 }, { stepId: 'pull.hang', min: 45 }, { stepId: 'core.lsit', min: 15 }],
    drills: ['drill.tuckFL', 'drill.advTuckFL', 'drill.hollow'], needs: 'bar',
  },
  {
    id: 'hspu', nameKey: 'skill.hspu', descKey: 'skill.hspu.d',
    req: [{ stepId: 'push.pike', min: 10 }, { stepId: 'core.plank', min: 60 }],
    drills: ['drill.wallHold', 'drill.pikeElev', 'drill.negHSPU'],
  },
  {
    id: 'planche', nameKey: 'skill.planche', descKey: 'skill.planche.d',
    req: [{ stepId: 'push.std', min: 15 }, { stepId: 'dips.dip', min: 12 }, { stepId: 'core.plank', min: 60 }],
    drills: ['drill.lean', 'drill.tuckPlanche', 'drill.hollow'], needs: 'parallel',
  },
];

// ---------- stats from camera-verified history
export function bestSet(history: SessionRecord[], stepId: string): number {
  let best = 0;
  for (const h of history) for (const s of h.sets) if (s.stepId === stepId && s.value > best) best = s.value;
  return best;
}
export interface ReqStatus { req: Requirement; best: number; met: boolean }
export function skillStatus(state: GameState, skill: Skill) {
  const reqs: ReqStatus[] = skill.req.map((r) => {
    const best = bestSet(state.history, r.stepId);
    return { req: r, best, met: best >= r.min };
  });
  return { reqs, unlocked: reqs.every((r) => r.met), pct: reqs.reduce((a, r) => a + Math.min(1, r.best / r.req.min), 0) / reqs.length };
}

// ---------- placement & double progression
export const defaultStepState = (s: Step): StepState => ({ target: s.lo, streak: 0, fails: 0 });

export function initialProgress(maxes: Partial<Record<string, number>>, profile: Profile): Pick<GameState, 'steps' | 'current'> {
  const pushMax = maxes.push ?? 0;
  const pullMax = maxes.pull ?? 0;
  const current: Record<string, string> = {
    push: pushMax < 5 ? 'push.incline' : 'push.std',
    pull: pullMax < 1 ? 'pull.hang' : 'pull.pullup',
    legs: 'legs.squat',
    core: 'core.situp',
    dips: 'dips.dip',
  };
  const steps: Record<string, StepState> = {};
  for (const s of STEPS) steps[s.id] = defaultStepState(s);
  // Start below the measured maximum (leave reps in reserve): ~60% of max, inside the range.
  const seed = (id: string, max: number | undefined) => {
    if (!max) return;
    const s = getStep(id);
    steps[id] = { ...steps[id], target: Math.max(s.lo, Math.min(s.hi, Math.round(max * 0.6))) };
  };
  seed(current.push, pushMax);
  seed(current.pull, pullMax);
  seed('legs.squat', maxes.legs);
  void profile;
  return { steps, current };
}

/** Update one step after a workout. `adjust` is false on light/comeback days: no promotion, no penalty. */
export function updateStep(
  state: GameState, stepId: string, sets: SetRecord[], plannedSets: number, adjust: boolean
): Pick<GameState, 'steps' | 'current'> {
  const step = getStep(stepId);
  const st = state.steps[stepId] ?? defaultStepState(step);
  const out = { steps: { ...state.steps }, current: { ...state.current } };
  if (!adjust || !sets.length) return out;
  const target = sets[0].target;
  const doneAll = sets.length >= plannedSets && sets.every((s) => s.value >= target);
  const total = sets.reduce((a, s) => a + s.value, 0);
  let next: StepState = { ...st };
  if (doneAll) {
    next.fails = 0;
    if (target >= step.hi) {
      next.streak = st.streak + 1;
      next.target = step.hi;
      const nx = nextStep(stepId);
      if (next.streak >= 2 && nx) {
        out.current[step.line] = nx.id;
        out.steps[nx.id] = { ...(state.steps[nx.id] ?? defaultStepState(nx)), target: nx.lo, streak: 0, fails: 0 };
        next = { ...next, streak: 0 };
      }
    } else {
      next.streak = 0;
      next.target = Math.min(step.hi, target + step.inc);
    }
  } else if (total < 0.8 * plannedSets * target) {
    next.fails = st.fails + 1;
    next.streak = 0;
    if (next.fails >= 2) { next.target = Math.max(step.lo, target - step.inc); next.fails = 0; }
  }
  out.steps[stepId] = next;
  return out;
}
