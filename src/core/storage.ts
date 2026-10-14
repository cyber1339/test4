import type { GameState, Profile } from './types.ts';
import { initialProgress } from './program.ts';

export const STORAGE_KEY = 'repquest.save';
export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const defaultProfile = (): Profile => ({
  name: '', heightCm: 175, weightKg: 75, goal: 'muscle', hasBar: true, hasParallel: false, onboarded: false, lang: 'ro', camera: 'user',
});

export function newState(): GameState {
  const profile = defaultProfile();
  return {
    v: 2, profile, xp: 0, ...initialProgress({}, profile), history: [], runs: [], weightLog: [],
    achievements: [], manualLog: [], feeling: null,
  };
}

/** Future: swap this adapter for a cloud one (auth + sync) without touching the game logic. */
export function loadState(store: KeyValueStore): GameState {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return newState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 2) return newState(); // v1 (prototype) saves are discarded
    const base = newState();
    return { ...base, ...parsed, profile: { ...base.profile, ...parsed.profile }, steps: { ...base.steps, ...parsed.steps }, current: { ...base.current, ...parsed.current } };
  } catch { return newState(); }
}
export function saveState(store: KeyValueStore, state: GameState): void {
  try { store.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* keep playing in memory */ }
}
