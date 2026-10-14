import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../core/geometry.ts';

/** Draws the skeleton. Landmarks with low visibility are skipped so the overlay never pretends to see more than it does. */
export function drawPose(ctx: CanvasRenderingContext2D, lm: Landmark[] | null, w: number, h: number, ok: boolean) {
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const color = ok ? '#22d3ee' : '#f5c451';
  ctx.lineWidth = Math.max(3, w / 160);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const c of PoseLandmarker.POSE_CONNECTIONS) {
    const a = lm[c.start], b = lm[c.end];
    if (!a || !b || (a.visibility ?? 0) < 0.4 || (b.visibility ?? 0) < 0.4) continue;
    if (c.start < 11 || c.end < 11) continue; // skip face mesh lines
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }
  for (let i = 11; i < lm.length; i++) {
    const p = lm[i];
    if ((p.visibility ?? 0) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(4, w / 120), 0, Math.PI * 2);
    ctx.fill();
  }
}
