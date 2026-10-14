import { describe, expect, it } from 'vitest';
import { RepCounter } from './repCounter.ts';
import type { RepKind } from './repCounter.ts';
import { HoldTracker } from './holdTracker.ts';
import type { Landmark } from './geometry.ts';
import { dipPose, hangPose, plankPose, pullupPose, pushupPose, repProfile, situpPose, squatPose } from './testPoses.ts';
import { applyRun, applySession, levelFromXp, streak } from './progression.ts';
import type { SessionInput } from './progression.ts';
import { loadState, newState, saveState, STORAGE_KEY } from './storage.ts';
import type { KeyValueStore } from './storage.ts';
import { checkFraming } from './framing.ts';
import { getStep, initialProgress, skillStatus, SKILLS, STEPS, updateStep } from './program.ts';
import { recommendToday } from './plan.ts';
import { RunTracker, formatPace, haversine, manualRun, metForSpeed } from './run.ts';
import type { RunRecord, SetRecord } from './types.ts';

const dt = 1000 / 30;
type Gen = (a: number) => Landmark[] | null;
const push: Gen = (a) => pushupPose(a);
const pull: Gen = (a) => pullupPose(a, a <= 90);

function feed(c: RepCounter, angles: number[], gen: Gen, clock = { t: 0 }) {
  for (const a of angles) { c.update(gen(a), clock.t); clock.t += dt; }
  return clock;
}

describe('pushup counting', () => {
  it('counts one complete pushup exactly once', () => {
    const c = new RepCounter('pushup'); feed(c, repProfile({ bottom: 70 }), push);
    expect(c.valid).toBe(1); expect(c.rejected).toBe(0);
  });
  it('counts N consecutive pushups', () => {
    const c = new RepCounter('pushup'); const clock = { t: 0 };
    for (let i = 0; i < 5; i++) feed(c, repProfile({ bottom: 75 }), push, clock);
    expect(c.valid).toBe(5);
  });
  it('does not count an incomplete pushup', () => {
    const c = new RepCounter('pushup'); feed(c, repProfile({ bottom: 120 }), push); expect(c.valid).toBe(0);
  });
  it('holding the bottom does not add reps', () => {
    const c = new RepCounter('pushup'); feed(c, repProfile({ bottom: 70, holdMs: 6000 }), push); expect(c.valid).toBe(1);
  });
  it('rejects a rep that is too fast', () => {
    const c = new RepCounter('pushup'); feed(c, repProfile({ bottom: 70, downMs: 150, holdMs: 0, upMs: 150 }), push);
    expect(c.valid).toBe(0); expect(c.rejected).toBe(1);
  });
  it('rejects a badly sagging body, tolerates a slight one', () => {
    const bad = new RepCounter('pushup'); feed(bad, repProfile({ bottom: 70 }), (a) => pushupPose(a, 0.12));
    expect(bad.valid).toBe(0); expect(bad.rejected).toBe(1);
    const ok = new RepCounter('pushup'); feed(ok, repProfile({ bottom: 70 }), (a) => pushupPose(a, 0.015));
    expect(ok.valid).toBe(1);
  });
  it('pike variant does not check the body line', () => {
    const c = new RepCounter('pushup', { bodyRejectDeg: 0, bodyWarnDeg: 0 });
    feed(c, repProfile({ bottom: 70 }), (a) => pushupPose(a, 0.12)); expect(c.valid).toBe(1);
  });
  it('losing detection mid-rep never creates a rep', () => {
    const c = new RepCounter('pushup'); const clock = { t: 0 }; const p = repProfile({ bottom: 70 });
    feed(c, p.slice(0, 25), push, clock);
    for (let i = 0; i < 60; i++) { c.update(null, clock.t); clock.t += dt; }
    feed(c, p.slice(25), push, clock); expect(c.valid).toBe(0);
  });
  it('a short glitch does not break a good rep', () => {
    const c = new RepCounter('pushup'); const clock = { t: 0 }; const p = repProfile({ bottom: 70 });
    feed(c, p.slice(0, 25), push, clock);
    for (let i = 0; i < 5; i++) { c.update(null, clock.t); clock.t += dt; }
    feed(c, p.slice(25), push, clock); expect(c.valid).toBe(1);
  });
  it('reappearing at the bottom does not count (must re-arm at the top)', () => {
    const c = new RepCounter('pushup'); feed(c, [70, 70, 70, 70, 70, 70, 100, 130, 160, 170, 170], push); expect(c.valid).toBe(0);
  });
  it('pause generates no reps and requires re-arming', () => {
    const c = new RepCounter('pushup'); const clock = { t: 0 };
    feed(c, repProfile({ bottom: 70 }).slice(0, 30), push, clock);
    c.pause(); feed(c, repProfile({ bottom: 70 }), push, clock); expect(c.valid).toBe(0);
    c.resume(); feed(c, repProfile({ bottom: 70 }), push, clock); expect(c.valid).toBe(1);
  });
  it('low-visibility landmarks are never counted', () => {
    const c = new RepCounter('pushup'); feed(c, repProfile({ bottom: 70 }), (a) => pushupPose(a).map((p) => ({ ...p, visibility: 0.2 })));
    expect(c.valid).toBe(0);
  });
});

describe('pullup counting', () => {
  const slow = { downMs: 1000, upMs: 1000, holdMs: 300 };
  it('counts one complete pullup once', () => { const c = new RepCounter('pullup'); feed(c, repProfile({ bottom: 60, ...slow }), pull); expect(c.valid).toBe(1); });
  it('does not count chin below the hands', () => { const c = new RepCounter('pullup'); feed(c, repProfile({ bottom: 60, ...slow }), (a) => pullupPose(a, false)); expect(c.valid).toBe(0); });
  it('does not count a short movement', () => { const c = new RepCounter('pullup'); feed(c, repProfile({ bottom: 125, ...slow }), pull); expect(c.valid).toBe(0); });
  it('chest-to-bar needs the shoulders up at the bar', () => {
    const t = { peak: 75, chestToBar: true };
    const no = new RepCounter('pullup', t); feed(no, repProfile({ bottom: 60, ...slow }), (a) => pullupPose(a, a <= 90, 0.5, false)); expect(no.valid).toBe(0);
    const yes = new RepCounter('pullup', t); feed(yes, repProfile({ bottom: 60, ...slow }), (a) => pullupPose(a, a <= 90, 0.5, a <= 90)); expect(yes.valid).toBe(1);
  });
});

describe('squat, situp, dip counting', () => {
  const cases: [RepKind, (a: number) => Landmark[], number, number, number][] = [
    ['squat', squatPose, 165, 80, 1200], ['squat', squatPose, 165, 130, 1200],
    ['situp', situpPose, 140, 60, 1000], ['situp', situpPose, 140, 105, 1000],
    ['dip', dipPose, 170, 80, 900], ['dip', dipPose, 170, 130, 900],
  ];
  for (const [kind, gen, top, bottom, ms] of cases) {
    const full = bottom <= 100;
    it(`${kind} ${full ? 'full rep counts once' : 'partial rep does not count'}`, () => {
      const c = new RepCounter(kind);
      feed(c, repProfile({ top, bottom, downMs: ms, upMs: ms }), gen);
      expect(c.valid).toBe(full ? 1 : 0);
    });
  }
});

describe('holds', () => {
  const run = (h: HoldTracker, gen: () => Landmark[] | null, secs: number, clock = { t: 0 }) => {
    for (let i = 0; i < secs * 30; i++) { h.update(gen(), clock.t); clock.t += dt; }
    return clock;
  };
  it('plank counts time only while the body is straight', () => {
    const h = new HoldTracker('plank');
    const clock = run(h, () => plankPose(0), 5);
    expect(h.seconds).toBeGreaterThan(4); expect(h.seconds).toBeLessThan(5.1);
    run(h, () => plankPose(0.15), 4, clock);
    expect(h.seconds).toBeLessThan(5.6);
  });
  it('no detection adds no time', () => { const h = new HoldTracker('plank'); run(h, () => null, 5); expect(h.seconds).toBe(0); });
  it('hang needs straight arms above the shoulders', () => {
    const ok = new HoldTracker('hang'); run(ok, () => hangPose(175), 3); expect(ok.seconds).toBeGreaterThan(2);
    const bent = new HoldTracker('hang'); run(bent, () => hangPose(90), 3); expect(bent.seconds).toBe(0);
  });
  it('pause stops the clock', () => { const h = new HoldTracker('plank'); h.pause(); run(h, () => plankPose(0), 3); expect(h.seconds).toBe(0); });
});

describe('framing', () => {
  it('asks to reposition when nobody is visible', () => expect(checkFraming(null, 'pushup', 1).ok).toBe(false));
  it('accepts a visible side-view pushup start', () => expect(checkFraming(pushupPose(170), 'pushup', 1).ok).toBe(true));
  it('rejects low confidence', () => expect(checkFraming(pushupPose(170).map((p) => ({ ...p, visibility: 0.2 })), 'pushup', 1).ok).toBe(false));
});

const mkSet = (stepId: string, value: number, target: number): SetRecord => ({ stepId, counter: getStep(stepId).counter, value, target, rejected: 0 });
const baseInput = (sets: SetRecord[], planned: Record<string, number>, completed = true, adjust = true): SessionInput =>
  ({ kind: 'workout', sessionType: 'A', sets, planned, adjust, completed, durationSec: 600, notes: [] });
const now = new Date(2026, 9, 13, 18, 0);

describe('progression program', () => {
  it('raises reps after a fully successful session', () => {
    const s = newState();
    const t = s.steps['push.std'].target;
    const r = applySession({ ...s, current: { ...s.current, push: 'push.std' } }, baseInput([mkSet('push.std', t, t), mkSet('push.std', t, t), mkSet('push.std', t, t)], { 'push.std': 3 }), now);
    expect(r.state.steps['push.std'].target).toBe(t + 1);
  });
  it('unlocks the next variation after two sessions at the top of the range', () => {
    let s = newState(); s = { ...s, current: { ...s.current, push: 'push.std' }, steps: { ...s.steps, 'push.std': { target: 15, streak: 0, fails: 0 } } };
    const sets = [1, 2, 3].map(() => mkSet('push.std', 15, 15));
    s = { ...s, ...updateStep(s, 'push.std', sets, 3, true) }; expect(s.current.push).toBe('push.std');
    s = { ...s, ...updateStep(s, 'push.std', sets, 3, true) }; expect(s.current.push).toBe('push.diamond');
  });
  it('light days and abandoned sessions never promote or punish', () => {
    const s = newState(); const t = s.steps['push.incline'].target;
    const light = updateStep(s, 'push.incline', [mkSet('push.incline', 1, t)], 3, false);
    expect(light.steps['push.incline']).toEqual(s.steps['push.incline']);
  });
  it('two bad sessions lower the target slightly', () => {
    let s = newState(); s = { ...s, steps: { ...s.steps, 'push.incline': { target: 12, streak: 0, fails: 0 } } };
    const bad = [1, 2, 3].map(() => mkSet('push.incline', 3, 12));
    s = { ...s, ...updateStep(s, 'push.incline', bad, 3, true) };
    s = { ...s, ...updateStep(s, 'push.incline', bad, 3, true) };
    expect(s.steps['push.incline'].target).toBe(11);
  });
  it('placement puts beginners on incline pushups and the hang, stronger users higher', () => {
    expect(initialProgress({ push: 2, pull: 0 }, newState().profile).current).toMatchObject({ push: 'push.incline', pull: 'pull.hang' });
    expect(initialProgress({ push: 20, pull: 6 }, newState().profile).current).toMatchObject({ push: 'push.std', pull: 'pull.pullup' });
  });
  it('every step has a sane range', () => { for (const s of STEPS) expect(s.hi > s.lo).toBe(true); });
});

describe('skills unlock from verified stats only', () => {
  const mu = SKILLS.find((k) => k.id === 'muscleup')!;
  it('muscle-up is locked for a new user', () => expect(skillStatus(newState(), mu).unlocked).toBe(false));
  it('unlocks once all prerequisites were reached on camera', () => {
    let s = newState();
    const sets = [mkSet('pull.pullup', 10, 10), mkSet('pull.c2b', 5, 5), mkSet('dips.dip', 10, 10)];
    s = applySession(s, baseInput(sets, {}), now).state;
    expect(skillStatus(s, mu).unlocked).toBe(true);
  });
  it('one missing prerequisite keeps it locked', () => {
    const s = applySession(newState(), baseInput([mkSet('pull.pullup', 12, 10), mkSet('dips.dip', 10, 10)], {}), now).state;
    expect(skillStatus(s, mu).unlocked).toBe(false);
  });
});

describe('sessions, XP, saving', () => {
  it('abandoning pays only for real reps and gives no completion bonus', () => {
    const r = applySession(newState(), baseInput([mkSet('push.incline', 4, 8)], { 'push.incline': 3 }, false), now);
    expect(r.summary.bonusXp).toBe(0); expect(r.summary.volumeXp).toBe(8);
  });
  it('zero valid reps = zero XP', () => expect(applySession(newState(), baseInput([], {}, false), now).summary.volumeXp).toBe(0));
  it('daily XP is capped', () => {
    const big = [mkSet('push.std', 200, 200)];
    expect(applySession(newState(), baseInput(big, {}, false), now).summary.volumeXp).toBe(300);
  });
  it('levels rise with XP', () => { expect(levelFromXp(0)).toBe(1); expect(levelFromXp(100)).toBe(2); expect(levelFromXp(240)).toBe(3); });
  it('streak survives one rest day, breaks after two', () => {
    const mk = (day: string) => ({ id: day, day, at: day, kind: 'workout' as const, sessionType: 'A' as const, sets: [mkSet('push.std', 5, 5)], completed: true, xp: 0, durationSec: 1, notes: [] });
    const s = newState();
    expect(streak({ ...s, history: [mk('2026-10-09'), mk('2026-10-11'), mk('2026-10-13')] }, '2026-10-13')).toBe(3);
    expect(streak({ ...s, history: [mk('2026-10-09'), mk('2026-10-13')] }, '2026-10-13')).toBe(1);
  });
  it('progress survives reload; corrupt saves fall back safely', () => {
    const mem = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
    const r = applySession(newState(), baseInput([mkSet('push.incline', 8, 8)], { 'push.incline': 3 }), now);
    saveState(store, r.state); expect(mem.has(STORAGE_KEY)).toBe(true); expect(loadState(store)).toEqual(r.state);
    expect(loadState({ getItem: () => '{bad', setItem: () => {}, removeItem: () => {} }).xp).toBe(0);
  });
});

describe('daily plan', () => {
  it('pain means rest, no workout', () => {
    const s = { ...newState(), feeling: { day: '2026-10-13', value: 'pain' as const } };
    const p = recommendToday(s, now); expect(p.kind).toBe('rest'); expect(p.blocks).toHaveLength(0);
  });
  it('a normal day offers blocks and alternates A/B', () => {
    const s = newState(); const a = recommendToday(s, now);
    expect(a.kind).toBe('normal'); expect(a.blocks.length).toBeGreaterThanOrEqual(3); expect(a.sessionType).toBe('A');
    const done = applySession(s, baseInput([mkSet('push.incline', 8, 8)], {}), new Date(2026, 9, 10, 18)).state;
    expect(recommendToday(done, now).sessionType).toBe('B');
  });
  it('tired days are lighter and a comeback after a pause is gentle', () => {
    const s = { ...newState(), feeling: { day: '2026-10-13', value: 'tired' as const } };
    expect(recommendToday(s, now).kind).toBe('light');
    const old = applySession(newState(), baseInput([mkSet('push.incline', 8, 8)], {}), new Date(2026, 9, 1, 18)).state;
    expect(recommendToday(old, now).kind).toBe('comeback');
  });
});

describe('running', () => {
  const pt = (i: number, mps: number) => ({ lat: 45 + (i * mps) / 111320, lon: 25, acc: 8, t: i * 1000 });
  it('measures distance, pace, kcal and splits on a steady 3 m/s run', () => {
    const r = new RunTracker(75); r.start(0);
    for (let i = 0; i <= 700; i++) r.addPoint(pt(i, 3));
    const s = r.snapshot(700000);
    expect(Math.abs(s.km - 2.1) < 0.05).toBe(true);
    expect(Math.abs(s.avgPace - 333) < 6).toBe(true); // 5:33 /km
    expect(s.splits).toHaveLength(2);
    expect(s.kcal > 120 && s.kcal < 260).toBe(true);
  });
  it('ignores inaccurate points and GPS jumps', () => {
    const r = new RunTracker(70); r.start(0);
    r.addPoint(pt(0, 3));
    expect(r.addPoint({ ...pt(1, 3), acc: 80 })).toBe(false);
    expect(r.addPoint({ lat: 45.01, lon: 25, acc: 5, t: 2000 })).toBe(false); // ~1 km in 2 s
    expect(r.snapshot(3000).km).toBe(0);
  });
  it('standing still adds no distance; pause adds no time or distance', () => {
    const r = new RunTracker(70); r.start(0);
    for (let i = 0; i < 30; i++) r.addPoint({ lat: 45, lon: 25, acc: 6, t: i * 1000 });
    expect(r.snapshot(30000).km).toBe(0);
    const q = new RunTracker(70); q.start(0);
    for (let i = 0; i <= 10; i++) q.addPoint(pt(i, 3));
    q.pause(10000);
    for (let i = 11; i <= 40; i++) q.addPoint(pt(i, 3));
    q.resume(40000);
    const s = q.snapshot(50000);
    expect(Math.abs(s.seconds - 20) < 0.5).toBe(true);
    expect(s.km < 0.05).toBe(true);
  });
  it('helpers', () => {
    expect(Math.round(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) / 1000)).toBe(111);
    expect(formatPace(330)).toBe('5:30'); expect(formatPace(0)).toBe('--:--');
    expect(metForSpeed(10) > metForSpeed(8)).toBe(true);
    const m = manualRun(5, 1800, 70); expect(m.paceSecPerKm).toBe(360); expect(m.kcal > 300 && m.kcal < 450).toBe(true);
  });
  it('a run grants capped XP and unlocks the first-run achievement', () => {
    const run: RunRecord = { id: 'r', day: '2026-10-13', at: '', km: 12, seconds: 4000, paceSecPerKm: 333, kcal: 800, source: 'gps', splits: [] };
    const r = applyRun(newState(), run, now);
    expect(r.state.runs).toHaveLength(1); expect(r.newAchievements).toContain('firstrun'); expect(r.state.xp >= 60).toBe(true);
  });
});
