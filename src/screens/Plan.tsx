import type { Feeling, GameState } from '../core/types.ts';
import { recommendToday, volumeLastDays } from '../core/plan.ts';
import { dayKey } from '../core/dates.ts';
import { Button, Card, Chip } from '../components/ui.tsx';
import { getStep } from '../core/program.ts';
import { t } from '../i18n/index.ts';

interface Props { state: GameState; onState: (fn: (s: GameState) => GameState) => void }

export function Plan({ state, onState }: Props) {
  const now = new Date();
  const today = dayKey(now);
  const plan = recommendToday(state, now);
  const feeling: Feeling = state.feeling?.day === today ? state.feeling.value : 'ok';
  const vol = volumeLastDays(state, today, 14);
  const maxV = Math.max(20, ...vol.map((v) => v.volume));
  const setFeeling = (value: Feeling) => onState((s) => ({ ...s, feeling: { day: today, value } }));

  /** Manual difficulty: shifts the rep target of every current step by one increment. */
  const adjust = (dir: 1 | -1) => onState((s) => {
    const steps = { ...s.steps };
    for (const id of Object.values(s.current)) {
      const st = getStep(id); const cur = steps[id];
      if (cur) steps[id] = { ...cur, target: Math.max(st.lo, Math.min(st.hi, cur.target + dir * st.inc)), streak: 0, fails: 0 };
    }
    return { ...s, steps };
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 safe-top">
      <h1 className="font-display text-4xl font-bold uppercase">{t('plan.title')}</h1>
      <Card>
        <div className="mb-2 font-bold">{t('plan.how')}</div>
        <div className="grid grid-cols-2 gap-2">
          {(['ok', 'tired', 'sore', 'pain'] as Feeling[]).map((f) => (
            <button key={f} onClick={() => setFeeling(f)} aria-pressed={feeling === f}
              className={`min-h-[48px] rounded-2xl border px-3 font-semibold ${feeling === f ? (f === 'pain' ? 'border-blood bg-blood/15' : 'border-arcane bg-arcane/15') : 'border-edge bg-raised text-mute'}`}>{t(`feel.${f}`)}</button>
          ))}
        </div>
        {feeling === 'pain' && <p className="mt-3 rounded-2xl border border-blood/40 bg-blood/10 p-3 text-sm text-blood">{t('tip.pain')}</p>}
      </Card>
      <Card>
        <div className="mb-1 flex items-center justify-between"><span className="font-bold">{t('plan.today')}</span><Chip tone={plan.kind === 'rest' ? 'blood' : 'arcane'}>{t(`planKind.${plan.kind}`)}</Chip></div>
        <p className="text-sm text-mute">{t(plan.reasonKey)}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{plan.tipKeys.map((k) => <li key={k}>{t(k)}</li>)}<li>{t('tip.general')}</li><li>{t('tip.protein')}</li></ul>
      </Card>
      <Card>
        <div className="mb-2 font-bold">{t('plan.volume')}</div>
        <div className="flex h-24 items-end gap-1.5" role="img" aria-label={t('plan.volume')}>
          {vol.map((v) => (
            <div key={v.day} className="flex flex-1 flex-col items-center justify-end gap-0.5">
              <div className="w-full rounded-t bg-frost" style={{ height: `${Math.min(30, v.km * 6)}px`, opacity: v.km ? 1 : 0 }} />
              <div className={`w-full rounded-t ${v.day === today ? 'bg-gold' : 'bg-arcane'}`} style={{ height: `${Math.max(3, (v.volume / maxV) * 56)}px`, opacity: v.volume ? 1 : 0.25 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-mute"><span>{vol[0].day.slice(5)}</span><span>{today.slice(5)}</span></div>
        <p className="mt-2 text-xs text-mute">{t('plan.volumeLegend')}</p>
      </Card>
      <Card>
        <div className="mb-1 font-bold">{t('plan.difficulty')}</div>
        <p className="mb-3 text-sm text-mute">{t('plan.difficultyBody')}</p>
        <div className="grid grid-cols-2 gap-2"><Button variant="ghost" onClick={() => adjust(-1)}>{t('plan.easier')}</Button><Button variant="ghost" onClick={() => adjust(1)}>{t('plan.harder')}</Button></div>
      </Card>
    </div>
  );
}
