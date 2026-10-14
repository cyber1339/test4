import { useEffect, useRef, useState } from 'react';
import type { GameState, RunRecord } from '../core/types.ts';
import { RunTracker, formatDuration, formatPace, manualRun } from '../core/run.ts';
import type { RunSnapshot } from '../core/run.ts';
import { latestWeight } from '../core/body.ts';
import { dayKey, weekStart } from '../core/dates.ts';
import { Button, Card } from '../components/ui.tsx';
import { t } from '../i18n/index.ts';

interface Props { state: GameState; onSave: (r: RunRecord) => void }
type Mode = 'idle' | 'running' | 'done';

const EMPTY: RunSnapshot = { km: 0, seconds: 0, avgPace: 0, currentPace: 0, kcal: 0, splits: [], gpsOk: false };

const Metric = ({ label, value, big }: { label: string; value: string; big?: boolean }) => (
  <div className="text-center">
    <div className={`font-display font-extrabold leading-none ${big ? 'text-7xl text-gold' : 'text-4xl'}`}>{value}</div>
    <div className="mt-1 text-xs text-mute">{label}</div>
  </div>
);

export function Run({ state, onSave }: Props) {
  const weight = latestWeight(state);
  const [mode, setMode] = useState<Mode>('idle');
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<RunSnapshot>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState({ km: '', min: '', sec: '' });
  const [saved, setSaved] = useState<RunRecord | null>(null);
  const trackerRef = useRef<RunTracker | null>(null);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  const cleanup = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  };
  useEffect(() => cleanup, []);

  useEffect(() => {
    if (mode !== 'running') return;
    const id = setInterval(() => trackerRef.current && setSnap(trackerRef.current.snapshot(Date.now())), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const start = async () => {
    setErr(null);
    if (!navigator.geolocation) { setErr('run.err.unsupported'); return; }
    const tr = new RunTracker(weight);
    tr.start(Date.now());
    trackerRef.current = tr;
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      wakeRef.current = (await wl?.request('screen')) ?? null;
    } catch { /* optional */ }
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => { tr.addPoint({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp }); },
      (e) => setErr(e.code === 1 ? 'run.err.denied' : 'run.err.gps'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    setSnap(EMPTY); setPaused(false); setMode('running');
  };

  const togglePause = () => {
    const tr = trackerRef.current; if (!tr) return;
    if (tr.paused) { tr.resume(Date.now()); setPaused(false); } else { tr.pause(Date.now()); setPaused(true); }
  };

  const stop = () => {
    const tr = trackerRef.current; if (!tr) return;
    const s = tr.snapshot(Date.now());
    cleanup(); setSnap(s);
    if (s.km < 0.05) { setErr('run.err.short'); setMode('idle'); return; }
    const now = new Date();
    const rec: RunRecord = { id: String(now.getTime()), day: dayKey(now), at: now.toISOString(), km: Math.round(s.km * 1000) / 1000, seconds: Math.round(s.seconds), paceSecPerKm: s.avgPace, kcal: s.kcal, source: 'gps', splits: s.splits };
    onSave(rec); setSaved(rec); setMode('done');
  };

  const saveManual = () => {
    const km = Number(manual.km.replace(',', '.')), sec = Number(manual.min || 0) * 60 + Number(manual.sec || 0);
    if (!(km > 0) || !(sec > 0)) { setErr('run.err.manual'); return; }
    const m = manualRun(km, sec, weight); const now = new Date();
    const rec: RunRecord = { id: String(now.getTime()), day: dayKey(now), at: now.toISOString(), km, seconds: sec, paceSecPerKm: m.paceSecPerKm, kcal: m.kcal, source: 'manual', splits: [] };
    onSave(rec); setSaved(rec); setMode('done'); setErr(null); setManual({ km: '', min: '', sec: '' });
  };

  const wk = weekStart(dayKey(new Date()));
  const weekKm = state.runs.filter((r) => r.day >= wk).reduce((a, r) => a + r.km, 0);

  if (mode === 'running') {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-28 pt-6 safe-top">
        <div className="flex items-center justify-between text-sm">
          <span className={snap.gpsOk ? 'text-frost' : 'text-gold'}>{snap.gpsOk ? t('run.gpsOk') : t('run.gpsWait')}</span>
          {paused && <span className="font-bold text-gold">{t('run.paused')}</span>}
        </div>
        <Metric big label={t('run.km')} value={snap.km.toFixed(2)} />
        <div className="grid grid-cols-3 gap-2">
          <Metric label={t('run.time')} value={formatDuration(snap.seconds)} />
          <Metric label={t('run.pace')} value={formatPace(snap.avgPace)} />
          <Metric label={t('run.kcal')} value={String(snap.kcal)} />
        </div>
        <Metric label={t('run.paceNow')} value={formatPace(snap.currentPace)} />
        {err && <p className="text-center text-sm text-blood">{t(err)}</p>}
        <p className="text-center text-xs text-mute">{t('run.keepOpen')}</p>
        <div className="mt-auto grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={togglePause}>{paused ? t('btn.resume') : t('btn.pause')}</Button>
          <Button variant="danger" onClick={stop}>{t('run.stop')}</Button>
        </div>
      </div>
    );
  }

  if (mode === 'done' && saved) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-6 safe-top">
        <h1 className="font-display text-4xl font-bold uppercase">{t('run.done')}</h1>
        <Card>
          <div className="grid grid-cols-2 gap-5">
            <Metric label={t('run.km')} value={saved.km.toFixed(2)} />
            <Metric label={t('run.time')} value={formatDuration(saved.seconds)} />
            <Metric label={t('run.pace')} value={formatPace(saved.paceSecPerKm)} />
            <Metric label={t('run.kcal')} value={String(saved.kcal)} />
          </div>
        </Card>
        {saved.splits.length > 0 && (
          <Card>
            <div className="mb-2 font-bold">{t('run.splits')}</div>
            {saved.splits.map((s, i) => <div key={i} className="flex justify-between text-sm"><span>km {i + 1}</span><span className="text-frost">{formatPace(s)} /km</span></div>)}
          </Card>
        )}
        <p className="text-xs text-mute">{t('run.kcalNote', { kg: weight })}</p>
        <Button onClick={() => { setMode('idle'); setSaved(null); }}>{t('btn.ok')}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 safe-top">
      <h1 className="font-display text-4xl font-bold uppercase">{t('run.title')}</h1>
      <Card className="bg-gradient-to-b from-[#14233f] to-panel">
        <p className="mb-3 text-sm text-mute">{t('run.intro')}</p>
        {err && <p className="mb-3 text-sm text-blood">{t(err)}</p>}
        <Button className="w-full" onClick={start}>{t('run.start')}</Button>
        <p className="mt-2 text-xs text-mute">{t('run.limit')}</p>
      </Card>
      <Card>
        <div className="mb-2 font-bold">{t('run.manual')}</div>
        <div className="grid grid-cols-3 gap-2">
          {([['km', t('run.km')], ['min', t('unit.min')], ['sec', t('unit.sec')]] as const).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1 text-xs text-mute">{label}
              <input inputMode="decimal" value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} className="min-h-[48px] rounded-xl border border-edge bg-raised px-3 text-base text-white" />
            </label>
          ))}
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={saveManual}>{t('run.saveManual')}</Button>
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between"><span className="font-bold">{t('run.history')}</span><span className="text-sm text-mute">{t('run.weekKm', { km: weekKm.toFixed(1) })}</span></div>
        {state.runs.length === 0 && <p className="text-sm text-mute">{t('run.none')}</p>}
        <div className="flex flex-col gap-2">
          {[...state.runs].reverse().slice(0, 12).map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span>{r.day.slice(5)} · {r.km.toFixed(2)} km</span>
              <span className="text-mute">{formatDuration(r.seconds)} · {formatPace(r.paceSecPerKm)}/km · {r.kcal} kcal</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
