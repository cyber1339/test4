// Runs after `npm install`. Copies the MediaPipe WASM runtime and downloads the
// pose model into /public so the app runs fully on-device (and offline later).
// If it fails (no network), the app falls back to CDN URLs at runtime.
import { cp, mkdir, writeFile, access } from 'node:fs/promises';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

try {
  await mkdir('public/mediapipe', { recursive: true });
  await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm', { recursive: true });
  console.log('[repquest] WASM copied to public/mediapipe/wasm');
} catch (e) {
  console.warn('[repquest] could not copy WASM (CDN fallback will be used):', e.message);
}

try {
  await access('public/mediapipe/pose_landmarker_lite.task');
  console.log('[repquest] model already present');
} catch {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await writeFile('public/mediapipe/pose_landmarker_lite.task', Buffer.from(await res.arrayBuffer()));
    console.log('[repquest] pose model downloaded');
  } catch (e) {
    console.warn('[repquest] could not download model (CDN fallback will be used):', e.message);
  }
}
