import { useState } from 'react';
import type { GameState } from '../core/types.ts';
import { ACHIEVEMENTS, levelProgress, rankKey, sessionVolume, streak } from '../core/progression.ts';
import { STEPS, bestSet, getStep } from '../core/program.ts';
import { bmi, frame, latestWeight, muscleScore } from '../core/body.ts';
import { addDays, dayKey } from '../core/dates.ts';
import { formatDuration, formatPace } from '../core/run.ts';
import { Bar, Button, Card } from '../components/ui.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { t } from '../i18n/index.ts';

interface Props { state: GameState; onState: (fn: (s: GameState) => GameState) => void }

export function Profile({ state, onState }: Props) {
  const today = dayKey(new Date());
  const lp = levelProgress(state.xp);
  const kg = latestWeight(state);
  const [w, setW] = useState(String(kg));
  const workouts = state.history.filter((h) => h.kind === 'workout');
  const active = new Set([...workouts.filter((h) => sessionVolume(h) > 0).map((h) => h.day), ...state.runs.map((r) => r.day)]);
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, -27 + i));
  const totalKm = state.runs.reduce((a, r) => a + r.km, 0);
  const noteCounts: Record<string, number> = {};
  workouts.slice(-10).forEach((s) => s.notes.forEach((n) => { noteCounts[n] = (noteCounts[n] ?? 0) + 1; }));
  const records = STEPS.map((s) => ({ s, best: bestSet(state.history, s.id) })).filter((r) => r.best > 0);
  const bestRun = state.runs.reduce<number>((a, r) => (r.paceSecPerKm > 0 && r.km >= 1 && (a === 0 || r.paceSecPerKm < a) ? r.paceSecPerKm : a), 0);
  const logWeight = () => {
    const n = Number(w.replace(',', '.'));
    if (!(n >= 35 && n <= 250)) return;
    onState((s) => ({ ...s, weightLog: [...s.weightLog.filter((x) => x.day !== today), { day: today, kg: n }] }));
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 safe-top">
      <header className="flex items-center gap-4">
        <Avatar size={110} frame={frame(kg, state.profile.heightCm)} muscle={muscleScore(state)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-3xl font-bold uppercase leading-none">{state.profile.name || t('home.athlete')}</div>
          <div className="text-sm text-gold">{t(rankKey(lp.level))} · {t('lvl', { n: lp.level })}</div>
          <div className="mt-2"><Bar pct={lp.pct} color="bg-gold" height="h-2" /></div>
          <div className="mt-1 text-xs text-mute">{lp.current}/{lp.needed} XP · {t('profile.dev', { n: Math.round(muscleScore(state) * 100) })}</div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {[[t('stat.sessions'), workouts.filter((h) => sessionVolume(h) > 0).length], [t('stat.streak'), streak(state, today)], [t('stat.km'), totalKm.toFixed(1)], [t('stat.bestPace'), bestRun ? `${formatPace(bestRun)}/km` : '–']].map(([k, v]) => (
          <Card key={String(k)} className="!p-3"><div className="text-xs text-mute">{k}</div><div className="font-display text-3xl font-bold">{v}</div></Card>
        ))}
      </div>

      <Card>
        <div className="mb-2 font-bold">{t('profile.body')}</div>
        <p className="mb-3 text-sm text-mute">{t('profile.bodyLine', { h: state.profile.heightCm, kg, bmi: bmi(kg, state.profile.heightCm).toFixed(1) })}</p>
        <div className="flex gap-2">
          <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} className="min-h-[48px] flex-1 rounded-xl border border-edge bg-raised px-3 text-base text-white" aria-label={t('onb.weight')} />
          <Button variant="ghost" className="!min-h-[48px]" onClick={logWeight}>{t('profile.logWeight')}</Button>
        </div>
        <p className="mt-2 text-xs text-mute">{t('profile.avatarNote')}</p>
      </Card>

      {records.length > 0 && (
        <Card>
          <div className="mb-2 font-bold">{t('profile.records')}</div>
          {records.map(({ s, best }) => <div key={s.id} className="flex justify-between text-sm"><span>{t(s.nameKey)}</span><span className="text-gold">{best}{getStep(s.id).hold ? ' s' : ''}</span></div>)}
        </Card>
      )}

      <Card>
        <div className="mb-2 font-bold">{t('profile.calendar')}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => <div key={d} className={`flex aspect-square items-center justify-center rounded-lg text-[10px] ${active.has(d) ? 'bg-arcane text-white' : 'bg-raised text-mute'} ${d === today ? 'ring-2 ring-gold' : ''}`}>{d.slice(8)}</div>)}
        </div>
      </Card>

      {Object.keys(noteCounts).length > 0 && (
        <Card><div className="mb-2 font-bold">{t('profile.technique')}</div>
          <ul className="space-y-1 text-sm text-mute">{Object.entries(noteCounts).map(([k, n]) => <li key={k}>• {t(k)} ({n}×)</li>)}</ul></Card>
      )}

      <Card>
        <div className="mb-2 font-bold">{t('profile.achievements')}</div>
        <div className="flex flex-col gap-2">
          {ACHIEVEMENTS.map((a) => { const got = state.achievements.includes(a.id); return (
            <div key={a.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${got ? 'border-gold/50' : 'border-edge opacity-60'}`}>
              <span className="text-xl">{got ? '🏅' : '🔒'}</span>
              <div className="min-w-0 flex-1"><div className="font-bold">{t(a.nameKey)}</div><div className="text-xs text-mute">{t(a.descKey)}</div></div>
            </div>); })}
        </div>
      </Card>

      <Card>
        <div className="mb-2 font-bold">{t('profile.history')}</div>
        {state.history.length === 0 && state.runs.length === 0 && <p className="text-sm text-mute">{t('profile.noHistory')}</p>}
        <div className="flex flex-col gap-2">
          {[...state.history.map((h) => ({ at: h.at, day: h.day, line: `${h.completed ? '✓' : '✕'} ${t('profile.workout')} · ${h.sets.length} ${t('profile.sets')}`, right: `+${h.xp} XP` })),
            ...state.runs.map((r) => ({ at: r.at, day: r.day, line: `🏃 ${r.km.toFixed(2)} km`, right: `${formatDuration(r.seconds)} · ${r.kcal} kcal` }))]
            .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm"><span>{r.day.slice(5)} · {r.line}</span><span className="text-mute">{r.right}</span></div>))}
        </div>
      </Card>

      <Card>
        <div className="mb-2 font-bold">{t('profile.settings')}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => onState((s) => ({ ...s, profile: { ...s.profile, lang: s.profile.lang === 'ro' ? 'en' : 'ro' } }))}>{state.profile.lang === 'ro' ? 'English' : 'Română'}</Button>
          <Button variant="ghost" onClick={() => onState((s) => ({ ...s, profile: { ...s.profile, camera: s.profile.camera === 'user' ? 'environment' : 'user' } }))}>{state.profile.camera === 'user' ? t('cam.front') : t('cam.back')}</Button>
        </div>
        <Button variant="danger" className="mt-3 w-full" onClick={() => { if (window.confirm(t('profile.resetConfirm'))) { window.localStorage.clear(); window.location.reload(); } }}>{t('profile.reset')}</Button>
      </Card>
    </div>
  );
}
