import { useState } from 'react';
import { useGame } from './store.tsx';
import { applyRun, applySession } from './core/progression.ts';
import type { SessionSummary } from './core/progression.ts';
import { recommendToday } from './core/plan.ts';
import type { DayPlan } from './core/plan.ts';
import { dayKey } from './core/dates.ts';
import type { RunRecord } from './core/types.ts';
import { TabBar } from './components/ui.tsx';
import type { Tab } from './components/ui.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { Home } from './screens/Home.tsx';
import { Progress } from './screens/Progress.tsx';
import { Run } from './screens/Run.tsx';
import { Plan } from './screens/Plan.tsx';
import { Profile } from './screens/Profile.tsx';
import { Training } from './screens/Training.tsx';
import type { TrainingResult } from './screens/Training.tsx';
import { Summary } from './screens/Summary.tsx';
import { t } from './i18n/index.ts';

type Route =
  | { name: 'tabs' }
  | { name: 'training'; plan: DayPlan }
  | { name: 'summary'; result: TrainingResult; summary: SessionSummary; xpAfter: number };

export function App() {
  const { state, update } = useGame();
  const [tab, setTab] = useState<Tab>('home');
  const [route, setRoute] = useState<Route>({ name: 'tabs' });

  if (!state.profile.onboarded) {
    return <Onboarding initial={state.profile} onFinish={(patch) => update((s) => ({ ...s, ...patch }))} />;
  }

  if (route.name === 'training') {
    const plan = route.plan;
    const done = (result: TrainingResult) => {
      const planned: Record<string, number> = {};
      plan.blocks.forEach((b) => { planned[b.stepId] = b.sets; });
      const { state: next, summary } = applySession(
        state,
        { kind: 'workout', sessionType: plan.sessionType, sets: result.sets, planned, adjust: plan.multiplier >= 1, completed: result.completed, durationSec: result.durationSec, notes: result.notes, comeback: plan.kind === 'comeback' },
        new Date()
      );
      update(() => (result.pain ? { ...next, feeling: { day: dayKey(new Date()), value: 'pain' } } : next));
      setRoute({ name: 'summary', result, summary, xpAfter: next.xp });
    };
    return <Training mode="workout" title={t('home.today')} blocks={plan.blocks} camera={state.profile.camera} onDone={done} onExit={() => setRoute({ name: 'tabs' })} />;
  }

  if (route.name === 'summary') {
    return <Summary result={route.result} summary={route.summary} xpAfter={route.xpAfter} onHome={() => { setTab('home'); setRoute({ name: 'tabs' }); }} />;
  }

  const startToday = () => {
    const plan = recommendToday(state, new Date()); // always recomputed from the latest state
    if (plan.blocks.length === 0) { setTab('plan'); return; }
    setRoute({ name: 'training', plan });
  };
  const saveRun = (run: RunRecord) => update((s) => applyRun(s, run, new Date()).state);

  return (
    <>
      {tab === 'home' && <Home state={state} onStart={startToday} onRun={() => setTab('run')} />}
      {tab === 'progress' && <Progress state={state} onState={update} />}
      {tab === 'run' && <Run state={state} onSave={saveRun} />}
      {tab === 'plan' && <Plan state={state} onState={update} />}
      {tab === 'profile' && <Profile state={state} onState={update} />}
      <TabBar tab={tab} onTab={setTab} />
    </>
  );
}
