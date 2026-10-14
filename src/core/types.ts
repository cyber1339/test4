export type CounterKind = 'pushup' | 'pullup' | 'squat' | 'situp' | 'dip' | 'plank' | 'hang' | 'lsit';
export type LineId = 'push' | 'pull' | 'legs' | 'core' | 'dips';
export type Goal = 'muscle' | 'strength' | 'fitness';
export type Feeling = 'ok' | 'tired' | 'sore' | 'pain';
export type CameraFacing = 'user' | 'environment';
export type SessionType = 'A' | 'B';

export interface Profile {
  name: string;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  hasBar: boolean;
  hasParallel: boolean;
  onboarded: boolean;
  lang: 'ro' | 'en';
  camera: CameraFacing;
}

/** reps for rep exercises, seconds for holds. */
export interface SetRecord {
  stepId: string;
  counter: CounterKind;
  value: number;
  target: number;
  rejected: number;
}

export interface SessionRecord {
  id: string;
  day: string;
  at: string;
  kind: 'workout' | 'test';
  sessionType: SessionType | null;
  sets: SetRecord[];
  completed: boolean;
  xp: number;
  durationSec: number;
  notes: string[];
}

export interface RunRecord {
  id: string;
  day: string;
  at: string;
  km: number;
  seconds: number;
  paceSecPerKm: number;
  kcal: number;
  source: 'gps' | 'manual';
  splits: number[]; // seconds per completed km
}

export interface StepState {
  target: number; // reps per set (or seconds)
  streak: number; // consecutive sessions at the top of the range
  fails: number;
}

export interface ManualLog { id: string; day: string; skillId: string; note: string }

export interface GameState {
  v: 2;
  profile: Profile;
  xp: number;
  steps: Record<string, StepState>;
  current: Record<string, string>; // line -> current step id
  history: SessionRecord[];
  runs: RunRecord[];
  weightLog: { day: string; kg: number }[];
  achievements: string[];
  manualLog: ManualLog[];
  feeling: { day: string; value: Feeling } | null;
}
