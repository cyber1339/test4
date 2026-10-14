import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Goal, Profile } from '../core/types.ts';
import { initialProgress } from '../core/program.ts';
import { dayKey } from '../core/dates.ts';
import { Button, Card, Chip } from '../components/ui.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { frame } from '../core/body.ts';
import { Training } from './Training.tsx';
import type { TrainingResult } from './Training.tsx';
import { t } from '../i18n/index.ts';
import type { GameState } from '../core/types.ts';

type TestId = 'push' | 'pull' | 'legs';
const TESTS: Record<TestId, { stepId: string; nameKey: string }> = {
  push: { stepId: 'push.std', nameKey: 'ex.push' },
  pull: { stepId: 'pull.pullup', nameKey: 'ex.pull' },
  legs: { stepId: 'legs.squat', nameKey: 'ex.legs' },
};

const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} aria-pressed={on} className={`min-h-[52px] rounded-2xl border px-4 text-left font-semibold ${on ? 'border-arcane bg-arcane/15 text-white' : 'border-edge bg-raised text-mute'}`}>{children}</button>
);
const Num = ({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) => (
  <label className="flex flex-col gap-2 text-sm text-mute">{label}
    <input type="number" inputMode="decimal" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} className="min-h-[52px] rounded-2xl border border-edge bg-raised px-4 text-base text-white" />
  </label>
);

export function Onboarding({ initial, onFinish }: { initial: Profile; onFinish: (s: Partial<GameState>) => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(initial);
  const [testing, setTesting] = useState<TestId | null>(null);
  const [maxes, setMaxes] = useState<Partial<Record<TestId, number>>>({});

  const finalize = () => {
    const prog = initialProgress(maxes, p);
    onFinish({ profile: { ...p, onboarded: true }, ...prog, weightLog: [{ day: dayKey(new Date()), kg: p.weightKg }] });
  };

  if (testing) {
    const tst = TESTS[testing];
    return (
      <Training
        mode="test" title={t(tst.nameKey)} camera={p.camera}
        blocks={[{ stepId: tst.stepId, sets: 1, target: 999, restSec: 0 }]}
        onDone={(r: TrainingResult) => { if (!r.pain) setMaxes((m) => ({ ...m, [testing]: r.sets[0]?.value ?? 0 })); setTesting(null); }}
        onExit={() => setTesting(null)}
      />
    );
  }

  const tests = (Object.keys(TESTS) as TestId[]).filter((k) => k !== 'pull' || p.hasBar);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-5 py-8 safe-top">
      {step === 0 && (
        <>
          <div className="mx-auto"><Avatar frame={0.4} muscle={0.5} size={150} /></div>
          <h1 className="text-center font-display text-5xl font-extrabold uppercase tracking-wide">REPQUEST</h1>
          <p className="text-center font-display text-xl uppercase tracking-widest text-gold">{t('app.tagline')}</p>
          <p className="text-center text-mute">{t('onb.intro')}</p>
          <Button onClick={() => setStep(1)}>{t('btn.next')}</Button>
        </>
      )}
      {step === 1 && (
        <>
          <h2 className="font-display text-3xl font-bold uppercase">{t('onb.profile')}</h2>
          <label className="flex flex-col gap-2 text-sm text-mute">{t('onb.name')}
            <input value={p.name} maxLength={20} onChange={(e) => setP({ ...p, name: e.target.value })} className="min-h-[52px] rounded-2xl border border-edge bg-raised px-4 text-base text-white" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Num label={t('onb.height')} value={p.heightCm} min={120} max={230} onChange={(n) => setP({ ...p, heightCm: n })} />
            <Num label={t('onb.weight')} value={p.weightKg} min={35} max={250} onChange={(n) => setP({ ...p, weightKg: n })} />
          </div>
          <div className="mx-auto"><Avatar frame={frame(p.weightKg, p.heightCm)} muscle={0} size={120} /></div>
          <p className="text-center text-xs text-mute">{t('onb.avatarNote')}</p>
          <div className="text-sm text-mute">{t('onb.goal')}</div>
          {(['muscle', 'strength', 'fitness'] as Goal[]).map((g) => <Choice key={g} on={p.goal === g} onClick={() => setP({ ...p, goal: g })}>{t(`goal.${g}`)}</Choice>)}
          <Button onClick={() => setStep(2)} disabled={!p.heightCm || !p.weightKg}>{t('btn.next')}</Button>
        </>
      )}
      {step === 2 && (
        <>
          <h2 className="font-display text-3xl font-bold uppercase">{t('onb.equipment')}</h2>
          <Card><div className="mb-2 font-bold">{t('onb.bar')}</div>
            <div className="grid grid-cols-2 gap-2"><Choice on={p.hasBar} onClick={() => setP({ ...p, hasBar: true })}>{t('yes')}</Choice><Choice on={!p.hasBar} onClick={() => setP({ ...p, hasBar: false })}>{t('no')}</Choice></div></Card>
          <Card><div className="mb-2 font-bold">{t('onb.parallel')}</div>
            <div className="grid grid-cols-2 gap-2"><Choice on={p.hasParallel} onClick={() => setP({ ...p, hasParallel: true })}>{t('yes')}</Choice><Choice on={!p.hasParallel} onClick={() => setP({ ...p, hasParallel: false })}>{t('no')}</Choice></div></Card>
          <p className="text-sm text-mute">{t('onb.safety')}</p>
          <Button onClick={() => setStep(3)}>{t('btn.next')}</Button>
        </>
      )}
      {step === 3 && (
        <>
          <h2 className="font-display text-3xl font-bold uppercase">{t('onb.testTitle')}</h2>
          <p className="text-mute">{t('onb.testBody')}</p>
          <Card className="text-sm text-mute">{t('onb.testRule')}</Card>
          {tests.map((k) => (
            <Card key={k}>
              <div className="mb-2 flex items-center justify-between"><span className="font-bold">{t(TESTS[k].nameKey)}</span>{maxes[k] !== undefined && <Chip tone="gold">{maxes[k]}</Chip>}</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setTesting(k)}>{t('onb.testCam')}</Button>
                <Button variant="ghost" onClick={() => setMaxes((m) => ({ ...m, [k]: 0 }))}>{t('onb.cannot')}</Button>
              </div>
            </Card>
          ))}
          <Button onClick={finalize}>{t('onb.finish')}</Button>
          <p className="text-center text-xs text-mute">{t('onb.skipNote')}</p>
        </>
      )}
    </div>
  );
}
