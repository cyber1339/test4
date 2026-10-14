import { useState } from 'react';
import type { GameState, LineId } from '../core/types.ts';
import { STEPS, SKILLS, bestSet, getStep, lineSteps, skillStatus } from '../core/program.ts';
import { dayKey } from '../core/dates.ts';
import { Bar, Button, Card, Chip } from '../components/ui.tsx';
import { t } from '../i18n/index.ts';

interface Props { state: GameState; onState: (fn: (s: GameState) => GameState) => void }
const LINES: LineId[] = ['push', 'pull', 'legs', 'core', 'dips'];

export function Progress({ state, onState }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const today = dayKey(new Date());
  const unit = (stepId: string) => (getStep(stepId).hold ? ' s' : '');

  const logManual = (skillId: string) => onState((s) => ({ ...s, manualLog: [...s.manualLog, { id: String(Date.now()), day: today, skillId, note: 'session' }] }));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 safe-top">
      <h1 className="font-display text-4xl font-bold uppercase">{t('progress.title')}</h1>
      <p className="text-sm text-mute">{t('progress.intro')}</p>

      {LINES.filter((l) => (l !== 'pull' || state.profile.hasBar) && (l !== 'dips' || state.profile.hasParallel)).map((line) => {
        const steps = lineSteps(line);
        const cur = state.current[line];
        const idx = steps.findIndex((s) => s.id === cur);
        return (
          <Card key={line}>
            <div className="mb-3 font-display text-2xl font-bold uppercase">{t(`line.${line}`)}</div>
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => {
                const done = i < idx, now = i === idx;
                const st = state.steps[s.id];
                return (
                  <div key={s.id} className={`rounded-2xl border p-3 ${now ? 'border-arcane bg-arcane/10' : done ? 'border-gold/40' : 'border-edge opacity-60'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{done ? '✓ ' : now ? '▶ ' : '🔒 '}{t(s.nameKey)}</span>
                      <span className="flex gap-1">{s.beta && <Chip tone="gold">β</Chip>}<Chip>{s.sets}×{s.lo}–{s.hi}{unit(s.id)}</Chip></span>
                    </div>
                    {now && st && (
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-xs text-mute"><span>{t('progress.target', { n: st.target })}{unit(s.id)}</span><span>{t('progress.best', { n: bestSet(state.history, s.id) })}{unit(s.id)}</span></div>
                        <Bar pct={(st.target - s.lo) / (s.hi - s.lo)} color="bg-frost" height="h-2" />
                        <div className="mt-1 text-xs text-mute">{t('progress.rule', { hi: s.hi })}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <h2 className="mt-2 font-display text-3xl font-bold uppercase">{t('skills.title')}</h2>
      <p className="text-sm text-mute">{t('skills.intro')}</p>
      {SKILLS.map((k) => {
        const st = skillStatus(state, k);
        const isOpen = open === k.id;
        const logs = state.manualLog.filter((m) => m.skillId === k.id);
        return (
          <Card key={k.id}>
            <button className="w-full text-left" onClick={() => setOpen(isOpen ? null : k.id)} aria-expanded={isOpen}>
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl font-bold uppercase">{st.unlocked ? '🔓 ' : '🔒 '}{t(k.nameKey)}</span>
                <Chip tone={st.unlocked ? 'gold' : 'mute'}>{Math.round(st.pct * 100)}%</Chip>
              </div>
              <div className="mt-2"><Bar pct={st.pct} color={st.unlocked ? 'bg-gold' : 'bg-arcane'} height="h-2" /></div>
            </button>
            {isOpen && (
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-sm text-mute">{t(k.descKey)}</p>
                <div className="flex flex-col gap-2">
                  {st.reqs.map((r) => (
                    <div key={r.req.stepId} className="flex items-center justify-between text-sm">
                      <span>{r.met ? '✓' : '○'} {t(getStep(r.req.stepId).nameKey)}</span>
                      <span className={r.met ? 'text-gold' : 'text-mute'}>{r.best}/{r.req.min}{unit(r.req.stepId)}</span>
                    </div>
                  ))}
                </div>
                {st.unlocked ? (
                  <>
                    <div className="font-bold">{t('skills.drills')}</div>
                    <ul className="list-disc space-y-1 pl-5 text-sm">{k.drills.map((d) => <li key={d}>{t(d)}</li>)}</ul>
                    <p className="rounded-2xl border border-gold/40 p-3 text-xs text-gold">{t('skills.manualNote')}</p>
                    <Button variant="ghost" onClick={() => logManual(k.id)}>{t('skills.log', { n: logs.length })}</Button>
                  </>
                ) : <p className="text-xs text-mute">{t('skills.locked')}</p>}
              </div>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-mute">{t('skills.source', { n: STEPS.length })}</p>
    </div>
  );
}
