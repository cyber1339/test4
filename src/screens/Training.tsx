import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CameraFacing, CounterKind, SetRecord } from '../core/types.ts';
import type { Block } from '../core/plan.ts';
import { getStep } from '../core/program.ts';
import { RepCounter, isRepKind } from '../core/repCounter.ts';
import { HoldTracker, isHoldKind } from '../core/holdTracker.ts';
import { checkFraming } from '../core/framing.ts';
import { loadPose } from '../ai/pose.ts';
import type { PoseLandmarker } from '../ai/pose.ts';
import { CameraFailure, startCamera, stopCamera } from '../ai/camera.ts';
import { drawPose } from '../ai/draw.ts';
import { Bar, Button, Chip } from '../components/ui.tsx';
import { t } from '../i18n/index.ts';

export interface TrainingResult { sets: SetRecord[]; completed: boolean; durationSec: number; notes: string[]; pain: boolean }

interface Props {
  mode: 'workout' | 'test';
  title: string;
  blocks: Block[];
  camera: CameraFacing;
  onDone: (r: TrainingResult) => void;
  onExit: () => void;
}

interface QItem { stepId: string; counter: CounterKind; target: number; restSec: number; setNo: number; setsInBlock: number; hold: boolean }
type Stage = 'intro' | 'loading' | 'calibrating' | 'active' | 'paused' | 'rest' | 'error';
interface Ui { phase: string; conf: number; fb: string | null; ok: boolean }

const CALIBRATION_MS = 1500;

function flatten(blocks: Block[]): QItem[] {
  const q: QItem[] = [];
  for (const b of blocks) {
    const s = getStep(b.stepId);
    for (let i = 1; i <= b.sets; i++) q.push({ stepId: b.stepId, counter: s.counter, target: b.target, restSec: b.restSec, setNo: i, setsInBlock: b.sets, hold: s.hold });
  }
  return q;
}

export function Training(props: Props) {
  const test = props.mode === 'test';
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lmkRef = useRef<PoseLandmarker | null>(null);
  const repRef = useRef<RepCounter | null>(null);
  const holdRef = useRef<HoldTracker | null>(null);
  const rafRef = useRef(0);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const queueRef = useRef<QItem[]>(flatten(props.blocks));
  const qiRef = useRef(0);
  const stageRef = useRef<Stage>('intro');
  const setsRef = useRef<SetRecord[]>([]);
  const notesRef = useRef<Set<string>>(new Set());
  const startedAt = useRef(0);
  const lastVideoTime = useRef(-1);
  const lastDetect = useRef(0);
  const calibMs = useRef(0);
  const lastCalibT = useRef<number | null>(null);
  const fbRef = useRef<{ key: string; until: number } | null>(null);
  const uiKey = useRef('');
  const valRef = useRef(0);
  const doneRef = useRef(false);

  const [stage, setStageState] = useState<Stage>('intro');
  const [err, setErr] = useState<string | null>(null);
  const [qi, setQi] = useState(0);
  const [val, setVal] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [calib, setCalib] = useState(0);
  const [rest, setRest] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ui, setUi] = useState<Ui>({ phase: 'LOST', conf: 0, fb: null, ok: false });

  const setStage = (s: Stage) => { stageRef.current = s; setStageState(s); };
  const item = (): QItem => queueRef.current[qiRef.current];

  const shutdown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  /** Records the current set (even a partial one) into the result. */
  const recordCurrent = () => {
    const it = item();
    const rc = repRef.current, hc = holdRef.current;
    const value = it.hold ? Math.floor(hc?.seconds ?? 0) : rc?.valid ?? 0;
    if (value > 0 || (rc?.rejected ?? 0) > 0) {
      setsRef.current.push({ stepId: it.stepId, counter: it.counter, value, target: it.target, rejected: rc?.rejected ?? 0 });
    }
  };

  const finish = useCallback((completed: boolean, pain = false) => {
    if (doneRef.current) return;
    doneRef.current = true;
    shutdown();
    propsRef.current.onDone({
      sets: [...setsRef.current], completed, pain, notes: [...notesRef.current],
      durationSec: startedAt.current ? Math.round((performance.now() - startedAt.current) / 1000) : 0,
    });
  }, [shutdown]);

  useEffect(() => () => { shutdown(); }, [shutdown]);

  const makeCounters = () => {
    const it = item();
    repRef.current = null; holdRef.current = null;
    if (isHoldKind(it.counter)) holdRef.current = new HoldTracker(it.counter);
    else if (isRepKind(it.counter)) repRef.current = new RepCounter(it.counter, getStep(it.stepId).tuning);
    valRef.current = 0; setVal(0); setRejected(0); uiKey.current = '';
  };
  const beginCalibration = () => {
    calibMs.current = 0; lastCalibT.current = null; setCalib(0);
    setUi({ phase: 'LOST', conf: 0, fb: 'cal.noBody', ok: false });
    setQi(qiRef.current);
    setStage('calibrating');
  };
  const beginSet = () => { makeCounters(); setQi(qiRef.current); setStage('active'); };

  const completeSet = () => {
    recordCurrent();
    repRef.current = null; holdRef.current = null; // the finished set must never be recorded twice
    navigator.vibrate?.([40, 40, 40]);
    const prev = item();
    qiRef.current += 1;
    if (qiRef.current >= queueRef.current.length) { finish(true); return; }
    setQi(qiRef.current);
    setRest(prev.restSec);
    setStage('rest');
  };

  const afterRest = () => {
    const prevKind = queueRef.current[qiRef.current - 1].counter;
    if (prevKind !== item().counter) beginCalibration();
    else beginSet();
  };

  useEffect(() => {
    if (stage !== 'rest') return;
    const id = setInterval(() => setRest((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [stage]);
  useEffect(() => { if (stage === 'rest' && rest <= 0) afterRest(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rest, stage]);

  const pushUi = (next: Ui, now: number) => {
    const fb = next.fb ?? (fbRef.current && now < fbRef.current.until ? fbRef.current.key : null);
    const key = `${next.phase}|${fb}|${Math.round(next.conf * 20)}|${next.ok}`;
    if (key === uiKey.current) return;
    uiKey.current = key;
    setUi({ ...next, fb });
  };

  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    const v = videoRef.current, lmk = lmkRef.current, canvas = canvasRef.current, stg = stageRef.current;
    if (!v || !lmk || !canvas || v.readyState < 2 || (stg !== 'calibrating' && stg !== 'active')) return;
    if (v.currentTime === lastVideoTime.current) return;
    const now = performance.now();
    if (now - lastDetect.current < 33) return; // ~30 detections/s at most
    lastVideoTime.current = v.currentTime;
    lastDetect.current = now;
    if (canvas.width !== v.videoWidth) { canvas.width = v.videoWidth; canvas.height = v.videoHeight; }
    const lm = lmk.detectForVideo(v, now).landmarks[0] ?? null;
    const aspect = v.videoWidth / v.videoHeight;
    const it = item();
    const ctx = canvas.getContext('2d');

    if (stg === 'calibrating') {
      const f = checkFraming(lm, it.counter, aspect);
      if (ctx) drawPose(ctx, lm, canvas.width, canvas.height, f.ok);
      const dtMs = lastCalibT.current === null ? 0 : now - lastCalibT.current;
      lastCalibT.current = now;
      calibMs.current = f.ok ? calibMs.current + dtMs : 0;
      setCalib(Math.min(1, calibMs.current / CALIBRATION_MS));
      pushUi({ phase: 'LOST', conf: f.confidence, fb: f.message, ok: f.ok }, now);
      if (calibMs.current >= CALIBRATION_MS) { if (!startedAt.current) startedAt.current = now; beginSet(); }
      return;
    }

    if (it.hold) {
      const h = holdRef.current;
      if (!h) return;
      const r = h.update(lm, now, aspect);
      if (ctx) drawPose(ctx, lm, canvas.width, canvas.height, r.holding);
      const secs = Math.floor(r.seconds);
      if (secs !== valRef.current) { valRef.current = secs; setVal(secs); }
      pushUi({ phase: r.holding ? 'HOLD' : 'LOST', conf: r.confidence, fb: r.feedback, ok: r.confidence >= 0.5 }, now);
      if (!test && r.seconds >= it.target) completeSet();
      return;
    }

    const c = repRef.current;
    if (!c) return;
    const r = c.update(lm, now, aspect);
    if (ctx) drawPose(ctx, lm, canvas.width, canvas.height, r.confidence >= 0.5);
    if (r.event?.type === 'valid') {
      for (const w of r.event.warnings) notesRef.current.add(w === 'BODY' ? 'fb.straight' : 'fb.swing');
      fbRef.current = { key: r.feedback ?? 'fb.valid', until: now + 1600 };
      navigator.vibrate?.(25);
      valRef.current = c.valid; setVal(c.valid);
    } else if (r.event?.type === 'rejected') {
      setRejected(c.rejected);
      if (r.feedback) { notesRef.current.add(r.feedback); fbRef.current = { key: r.feedback, until: now + 1800 }; }
    }
    pushUi({ phase: r.phase, conf: r.confidence, fb: r.feedback, ok: r.confidence >= 0.5 }, now);
    if (!test && c.valid >= it.target) completeSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  const start = async () => {
    setErr(null); setStage('loading');
    try {
      const v = videoRef.current;
      if (!v) throw new Error('no video');
      streamRef.current = await startCamera(v, props.camera);
      lmkRef.current = await loadPose();
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        wakeRef.current = (await wl?.request('screen')) ?? null;
      } catch { /* optional */ }
      beginCalibration();
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      shutdown();
      setErr(e instanceof CameraFailure ? `err.${e.kind}` : 'err.model');
      setStage('error');
    }
  };

  const pause = () => { repRef.current?.pause(); holdRef.current?.pause(); setStage('paused'); };
  const resume = () => { repRef.current?.resume(); holdRef.current?.resume(); uiKey.current = ''; setStage('active'); };
  const endSet = () => { if (test) { recordCurrent(); finish(true); } else completeSet(); };
  const abandon = (pain: boolean) => { recordCurrent(); finish(false, pain); };

  const cur = queueRef.current[Math.min(qi, queueRef.current.length - 1)];
  const step = getStep(cur.stepId);
  const mirror = props.camera === 'user' ? '-scale-x-100' : '';
  const showHud = stage === 'calibrating' || stage === 'active' || stage === 'paused';
  const unit = cur.hold ? t('unit.sec') : t('unit.reps');

  return (
    <div className="fixed inset-0 z-30 bg-black text-white">
      <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-contain ${mirror}`} />
      <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-contain ${mirror}`} />

      {showHud && (
        <div className="absolute inset-x-0 top-0 safe-top bg-gradient-to-b from-black/85 to-transparent px-4 pb-8">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-2xl font-bold uppercase tracking-wide">{t(step.nameKey)}</div>
              <div className="flex items-center gap-2 text-xs text-mute">
                {!test && <span>{t('hud.set', { n: cur.setNo, of: cur.setsInBlock })}</span>}
                {step.beta && <Chip tone="gold">{t('beta')}</Chip>}
              </div>
            </div>
            <div className="text-right">
              <span className="font-display text-6xl font-extrabold leading-none text-gold">{val}</span>
              {!test && <span className="font-display text-2xl text-mute">/{cur.target}</span>}
              <div className="text-xs text-mute">{unit}</div>
            </div>
          </div>
          {!test && <div className="mt-2"><Bar pct={val / cur.target} color="bg-frost" height="h-2" /></div>}
          {!test && (
            <div className="mt-2 flex gap-1">
              {queueRef.current.map((q, i) => <div key={i} className={`h-1 flex-1 rounded ${i < qi ? 'bg-gold' : i === qi ? 'bg-frost' : 'bg-edge'}`} title={q.stepId} />)}
            </div>
          )}
        </div>
      )}

      {(stage === 'calibrating' || stage === 'active') && (
        <div className="absolute inset-x-0 bottom-0 safe-bottom bg-gradient-to-t from-black/90 to-transparent px-3 pt-10">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className={ui.ok ? 'text-frost' : 'text-gold'}>{t('hud.confidence', { n: Math.round(ui.conf * 100) })}</span>
            <span className="text-mute">{stage === 'active' ? t(`phase.${ui.phase}`) : t('hud.calibrating')}</span>
            <span className="text-mute">{t('hud.rejected', { n: rejected })}</span>
          </div>
          <div className={`mb-3 rounded-2xl px-4 py-3 text-center text-lg font-extrabold ${ui.fb === 'fb.valid' ? 'bg-frost/20 text-frost' : 'bg-black/60'}`} aria-live="polite">
            {ui.fb ? t(ui.fb) : stage === 'active' ? t(`cue.${cur.counter}`) : ''}
          </div>
          {stage === 'calibrating' && <div className="mb-3"><Bar pct={calib} color="bg-frost" /></div>}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Button variant="ghost" onClick={pause} disabled={stage !== 'active'}>{t('btn.pause')}</Button>
            <Button variant={test ? 'gold' : 'ghost'} onClick={() => (test ? endSet() : setConfirmEnd(true))}>{test ? t('btn.endTest') : t('btn.end')}</Button>
            <Button variant="danger" onClick={() => abandon(true)}>{t('btn.pain')}</Button>
          </div>
          {!test && stage === 'active' && <button onClick={endSet} className="mx-auto mt-2 block min-h-[44px] text-sm text-mute underline">{t('btn.endSet')}</button>}
        </div>
      )}

      {stage === 'rest' && (
        <Overlay>
          <p className="text-sm text-mute">{t('rest.title')}</p>
          <div className="font-display text-8xl font-extrabold text-gold">{Math.max(0, rest)}</div>
          <p className="text-mute">{t('rest.next', { name: t(getStep(item().stepId).nameKey), n: item().setNo, of: item().setsInBlock, target: item().target })}</p>
          <Button onClick={() => setRest(0)}>{t('btn.skipRest')}</Button>
          <Button variant="ghost" onClick={() => setConfirmEnd(true)}>{t('btn.end')}</Button>
        </Overlay>
      )}

      {stage === 'paused' && (
        <Overlay>
          <h2 className="font-display text-3xl font-bold uppercase">{t('paused.title')}</h2>
          <p className="text-mute">{t('paused.body')}</p>
          <Button onClick={resume}>{t('btn.resume')}</Button>
        </Overlay>
      )}

      {stage === 'intro' && (
        <Overlay solid>
          <h2 className="font-display text-3xl font-bold uppercase">{props.title}</h2>
          <p className="font-bold text-gold">{t(`${step.guideKey}.title`)}</p>
          <p className="text-mute">{t(step.guideKey)}</p>
          {step.beta && <p className="rounded-2xl border border-gold/40 p-3 text-sm text-gold">{t('beta.note')}</p>}
          <p className="rounded-2xl border border-edge bg-panel p-3 text-sm text-mute">{t('guide.privacy')}</p>
          <Button onClick={start}>{t('btn.startCamera')}</Button>
          <Button variant="ghost" onClick={props.onExit}>{t('btn.back')}</Button>
        </Overlay>
      )}

      {stage === 'loading' && (
        <Overlay solid>
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-edge border-t-arcane" />
          <p className="text-mute">{t('loading.model')}</p>
        </Overlay>
      )}

      {stage === 'error' && (
        <Overlay solid>
          <h2 className="font-display text-2xl font-bold uppercase text-blood">{t('err.title')}</h2>
          <p className="text-mute">{t(err ?? 'err.model')}</p>
          <Button onClick={start}>{t('btn.retry')}</Button>
          <Button variant="ghost" onClick={props.onExit}>{t('btn.back')}</Button>
        </Overlay>
      )}

      {confirmEnd && (
        <Overlay>
          <h2 className="font-display text-2xl font-bold uppercase">{t('end.title')}</h2>
          <p className="text-mute">{t('end.body')}</p>
          <Button variant="danger" onClick={() => abandon(false)}>{t('end.confirm')}</Button>
          <Button variant="ghost" onClick={() => setConfirmEnd(false)}>{t('end.continue')}</Button>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children, solid }: { children: ReactNode; solid?: boolean }) {
  return (
    <div className={`absolute inset-0 z-10 flex items-center justify-center p-6 ${solid ? 'bg-void' : 'bg-black/80 backdrop-blur-sm'}`}>
      <div className="flex w-full max-w-sm flex-col gap-4 text-center">{children}</div>
    </div>
  );
}
