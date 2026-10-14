/**
 * Body figure driven by two numbers:
 *  frame  0..1  lean -> heavy build, derived from the user's own height and weight
 *  muscle 0..1  development, earned through training progress (never decreases)
 */
interface Props { frame: number; muscle: number; accent?: string; size?: number }

export function Avatar({ frame, muscle, accent = '#4f8cff', size = 160 }: Props) {
  const f = Math.max(0, Math.min(1, frame));
  const m = Math.max(0, Math.min(1, muscle));
  const sw = 30 + 13 * m + 5 * f; // shoulder half-width
  const ww = 17 + 16 * f * (1 - 0.45 * m) + 3 * m; // waist half-width
  const hw = 19 + 9 * f + 3 * m; // hip half-width
  const arm = 6 + 6 * m + 2.5 * f;
  const leg = 9 + 5 * m + 4 * f;
  const cx = 100;
  const skin = '#d3ad8d';
  const shirt = '#1c1c28';
  const torso = `M${cx - sw} 70 Q${cx} 62 ${cx + sw} 70 L${cx + ww + 3} 128 Q${cx + hw + 2} 140 ${cx + hw} 150 L${cx - hw} 150 Q${cx - hw - 2} 140 ${cx - ww - 3} 128 Z`;
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 200 280" role="img" aria-label="avatar">
      <ellipse cx={cx} cy="268" rx="46" ry="7" fill="#000" opacity=".4" />
      {/* legs */}
      <path d={`M${cx - hw * 0.5} 150 L${cx - hw * 0.55 - 2} 258`} stroke="#2a2a3a" strokeWidth={leg * 2} strokeLinecap="round" />
      <path d={`M${cx + hw * 0.5} 150 L${cx + hw * 0.55 + 2} 258`} stroke="#2a2a3a" strokeWidth={leg * 2} strokeLinecap="round" />
      {/* arms */}
      <path d={`M${cx - sw + 3} 76 L${cx - sw - 8} 150`} stroke={skin} strokeWidth={arm * 2} strokeLinecap="round" />
      <path d={`M${cx + sw - 3} 76 L${cx + sw + 8} 150`} stroke={skin} strokeWidth={arm * 2} strokeLinecap="round" />
      {/* torso */}
      <path d={torso} fill={shirt} stroke={accent} strokeWidth="2" />
      {m > 0.35 && <path d={`M${cx} 78 V${112}`} stroke={accent} strokeWidth="1.5" opacity={0.5} />}
      {m > 0.55 && <path d={`M${cx - ww * 0.5} 96 Q${cx - ww * 0.2} 104 ${cx - 2} 98M${cx + ww * 0.5} 96 Q${cx + ww * 0.2} 104 ${cx + 2} 98`} stroke={accent} strokeWidth="1.5" fill="none" opacity={0.5} />}
      {/* head */}
      <rect x={cx - 6 - m * 2} y="52" width={12 + m * 4} height="14" rx="4" fill={skin} />
      <circle cx={cx} cy="38" r={17 + f * 2} fill={skin} />
      <path d={`M${cx - 17} 34 Q${cx} 14 ${cx + 17} 34`} fill="#1a1410" />
    </svg>
  );
}
