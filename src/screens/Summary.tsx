import { useEffect, useState } from 'react';
import type { SessionSummary } from '../core/progression.ts';
import { ACHIEVEMENTS, levelProgress, rankKey } from '../core/progression.ts';
import { getStep } from '../core/program.ts';
import type { TrainingResult } from './Training.tsx';
import { Bar, Button, Card } from '../components/ui.tsx';
import { t } from '../i18n/index.ts';

interface Props { result: TrainingResult; summary: SessionSummary; xpAfter: number; onHome: () => void }

export function Summary({ result, summary, xpAfter, onHome }: Props) {
  const before = xpAfter - summary.xp;
  const [xp, setXp] = useState(before);
  useEffect(() => { const id = setTimeout(() => setXp(xpAfter), 400); return () => clearTimeout(id); }, [xpAfter]);
  const lp = levelProgress(xp);
  const attempts = result.sets.reduce((a, s) => a + s.rejected, 0);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-8 safe-top">
      <h1 className="font-display text-5xl font-extrabold uppercase text-gold">{result.completed ? t('sum.done') : t('sum.partial')}</h1>
      <p className="text-mute">{result.completed ? t('sum.doneBody') : t('sum.partialBody')}</p>

      <Card>
        <div className="mb-3 flex items-end justify-between"><span className="text-xs text-mute">{t(rankKey(lp.level))} · {t('lvl', { n: lp.level })}</span><span className="font-display text-3xl font-extrabold text-gold">+{summary.xp} XP</span></div>
        <Bar pct={lp.pct} color="bg-gold" height="h-3" />
        {summary.levelAfter > summary.levelBefore && <p className="mt-2 font-bold text-frost">{t('sum.levelUp', { n: summary.levelAfter })}</p>}
      </Card>

      <Card>
        <div className="mb-2 font-bold">{t('sum.sets')}</div>
        {result.sets.length === 0 && <p className="text-sm text-mute">{t('sum.noSets')}</p>}
        <div className="flex flex-col gap-1.5">
          {result.sets.map((s, i) => {
            const st = getStep(s.stepId);
            return <div key={i} className="flex justify-between text-sm"><span>{t(st.nameKey)}</span><span className={s.value >= s.target ? 'text-frost' : 'text-mute'}>{s.value}/{s.target}{st.hold ? ' s' : ''}</span></div>;
          })}
        </div>
        {attempts > 0 && <p className="mt-2 text-xs text-mute">{t('sum.rejected', { n: attempts })}</p>}
      </Card>

      {summary.promoted.length > 0 && (
        <Card className="border-gold/50">
          <div className="mb-1 font-bold text-gold">{t('sum.promoted')}</div>
          {summary.promoted.map((id) => <div key={id}>▲ {t(getStep(id).nameKey)}</div>)}
        </Card>
      )}

      <Card>
        <div className="mb-1 font-bold">{t('sum.technique')}</div>
        {result.notes.length === 0 ? <p className="text-sm text-mute">{t('sum.noNotes')}</p> : <ul className="space-y-1 text-sm">{result.notes.map((n) => <li key={n}>• {t(n)}</li>)}</ul>}
      </Card>

      {summary.newAchievements.length > 0 && (
        <Card>
          <div className="mb-1 font-bold">{t('sum.achievements')}</div>
          {summary.newAchievements.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id)!; return <div key={id}>🏅 {t(a.nameKey)} <span className="text-gold">+{a.xp} XP</span></div>; })}
        </Card>
      )}
      {result.pain && <Card className="border-blood/50 text-sm text-blood">{t('tip.pain')}</Card>}
      <Button onClick={onHome} className="mt-auto">{t('btn.home')}</Button>
    </div>
  );
}
