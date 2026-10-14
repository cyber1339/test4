import type { CameraFacing } from '../core/types.ts';

export type CameraError = 'denied' | 'none' | 'insecure' | 'unsupported' | 'failed';

export class CameraFailure extends Error {
  kind: CameraError;
  constructor(kind: CameraError) {
    super(kind);
    this.kind = kind;
  }
}

export async function startCamera(video: HTMLVideoElement, facing: CameraFacing): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraFailure('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraFailure('unsupported');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    return stream;
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraFailure('denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraFailure('none');
    throw new CameraFailure('failed');
  }
}

export function stopCamera(stream: MediaStream | null, video: HTMLVideoElement | null) {
  stream?.getTracks().forEach((tr) => tr.stop());
  if (video) video.srcObject = null;
}
