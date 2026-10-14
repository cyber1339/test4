import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from './core/types.ts';
import { loadState, saveState } from './core/storage.ts';
import { setLang } from './i18n/index.ts';

interface Ctx {
  state: GameState;
  /** Functional update; every change is persisted to localStorage. */
  update: (fn: (s: GameState) => GameState) => void;
}
const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => {
    const s = loadState(window.localStorage);
    setLang(s.profile.lang);
    return s;
  });
  useEffect(() => {
    saveState(window.localStorage, state);
    setLang(state.profile.lang);
  }, [state]);
  const update = useCallback((fn: (s: GameState) => GameState) => setState(fn), []);
  const value = useMemo(() => ({ state, update }), [state, update]);
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('useGame outside GameProvider');
  return c;
}
