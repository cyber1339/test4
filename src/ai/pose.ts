import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// Everything runs on-device. Local files (copied by scripts/fetch-assets.mjs) are tried first,
// then the public CDN as a fallback. No video ever leaves the phone.
const LOCAL_WASM = '/mediapipe/wasm';
const LOCAL_MODEL = '/mediapipe/pose_landmarker_lite.task';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

async function create(wasm: string, model: string, delegate: 'GPU' | 'CPU') {
  const fileset = await FilesetResolver.forVisionTasks(wasm);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

let cached: Promise<PoseLandmarker> | null = null;

export function loadPose(): Promise<PoseLandmarker> {
  if (!cached) {
    cached = (async () => {
      const attempts: [string, string, 'GPU' | 'CPU'][] = [
        [LOCAL_WASM, LOCAL_MODEL, 'GPU'],
        [LOCAL_WASM, LOCAL_MODEL, 'CPU'],
        [CDN_WASM, CDN_MODEL, 'GPU'],
        [CDN_WASM, CDN_MODEL, 'CPU'],
      ];
      let last: unknown;
      for (const [w, m, d] of attempts) {
        try {
          return await create(w, m, d);
        } catch (e) {
          last = e;
        }
      }
      throw last;
    })();
    cached.catch(() => { cached = null; }); // allow retry
  }
  return cached;
}

export { PoseLandmarker };
