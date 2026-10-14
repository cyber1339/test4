import type { GameState } from '../core/types.ts';
import { getStep } from '../core/program.ts';
import { levelProgress, rankKey, streak, weekSummary } from '../core/progression.ts';
import { recommendToday, volumeLastDays } from '../core/plan.ts';
import { frame, latestWeight, muscleScore } from '../core/body.ts';
import { dayKey } from '../core/dates.ts';
import { formatDuration } from '../core/run.ts';
import { Bar, Button, Card, Chip } from '../components/ui.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { t } from '../i18n/index.ts';

interface Props { state: GameState; onStart: () => void; onRun: () => void }

export function Home({ state, onStart, onRun }: Props) {
  const now = new Date();
  const today = dayKey(now);
  const lp = levelProgress(state.xp);
  const plan = recommendToday(state, now);
  const wk = weekSummary(state, today);
  const vol = volumeLastDays(state, today, 7);
  const maxV = Math.max(20, ...vol.map((v) => v.volume));
  const lastRun = state.runs[state.runs.length - 1];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 safe-top">
      <header className="flex items-center gap-4">
        <Avatar size={88} frame={frame(latestWeight(state), state.profile.heightCm)} muscle={muscleScore(state)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-3xl font-bold uppercase leading-none">{state.profile.name || t('home.athlete')}</div>
          <div className="mt-1 text-sm text-gold">{t(rankKey(lp.level))} · {t('lvl', { n: lp.level })}</div>
          <div className="mt-2"><Bar pct={lp.pct} color="bg-gold" height="h-2" /></div>
          <div className="mt-1 text-xs text-mute">{lp.current}/{lp.needed} XP · {t('home.streak', { n: streak(state, today) })}</div>
        </div>
      </header>

      <Card className="bg-gradient-to-b from-[#14233f] to-panel">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xl font-bold uppercase">{t('home.today')}</span>
          <Chip tone={plan.kind === 'rest' ? 'blood' : plan.kind === 'normal' ? 'arcane' : 'frost'}>{t(`planKind.${plan.kind}`)}</Chip>
        </div>
        <p className="mb-3 text-sm text-mute">{t(plan.reasonKey)}</p>
        {plan.blocks.length > 0 ? (
          <>
            <div className="mb-4 flex flex-col gap-2">
              {plan.blocks.map((b) => {
                const s = getStep(b.stepId);
                return (
                  <div key={b.stepId} className="flex items-center justify-between rounded-2xl bg-black/30 px-3 py-2.5">
                    <span className="font-semibold">{t(s.nameKey)} {s.beta && <span className="text-xs text-gold">β</span>}</span>
                    <span className="text-sm text-frost">{b.sets} × {b.target}{s.hold ? ' s' : ''}</span>
                  </div>
                );
              })}
            </div>
            <Button className="w-full" onClick={onStart}>{t('home.start')}</Button>
          </>
        ) : (
          <div className="rounded-2xl bg-black/30 p-3 text-sm text-mute">{plan.tipKeys.map((k) => t(k)).join(' ')}</div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold">{t('home.week')}</span>
          <span className="text-sm text-mute">{t('home.weekLine', { s: wk.sessions, g: wk.goal, km: wk.km.toFixed(1) })}</span>
        </div>
        <div className="mb-2"><Bar pct={wk.sessions / wk.goal} color="bg-frost" height="h-2" /></div>
        <div className="mt-3 flex h-20 items-end gap-2" role="img" aria-label={t('home.week')}>
          {vol.map((v) => (
            <div key={v.day} className="flex flex-1 flex-col items-center gap-1">
              <div className={`w-full rounded-t-md ${v.day === today ? 'bg-gold' : 'bg-arcane'}`} style={{ height: `${Math.max(3, (v.volume / maxV) * 64)}px`, opacity: v.volume ? 1 : 0.25 }} />
              <span className="text-[10px] text-mute">{v.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex items-center justify-between">
        <div>
          <div className="font-bold">{t('home.run')}</div>
          <div className="text-sm text-mute">{lastRun ? t('home.lastRun', { km: lastRun.km.toFixed(2), t: formatDuration(lastRun.seconds) }) : t('home.noRun')}</div>
        </div>
        <Button variant="ghost" className="!min-h-[44px]" onClick={onRun}>{t('home.runBtn')}</Button>
      </Card>
    </div>
  );
}
