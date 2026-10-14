import type { ReactNode } from 'react';
import { t } from '../i18n/index.ts';

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-3xl border border-edge bg-panel p-4 ${className}`}>{children}</div>
);

type BtnProps = { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'gold'; disabled?: boolean; className?: string };
export const Button = ({ children, onClick, variant = 'primary', disabled, className = '' }: BtnProps) => {
  const v = {
    primary: 'bg-arcane text-white shadow-[0_0_28px_-8px_#4f8cff]',
    gold: 'bg-gold text-black',
    ghost: 'bg-raised text-white border border-edge',
    danger: 'bg-blood/15 text-blood border border-blood/40',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[52px] rounded-2xl px-5 font-extrabold active:scale-[.98] transition disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  );
};

export const Bar = ({ pct, color = 'bg-arcane', ghost, height = 'h-3' }: { pct: number; color?: string; ghost?: boolean; height?: string }) => {
  const p = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-full bg-black/60 border border-edge`}>
      {ghost && <div className="absolute inset-y-0 left-0 bg-white/40 transition-[width] duration-700 delay-300" style={{ width: `${p}%` }} />}
      <div className={`absolute inset-y-0 left-0 ${color} transition-[width] duration-300`} style={{ width: `${p}%` }} />
    </div>
  );
};

export const Chip = ({ children, tone = 'mute' }: { children: ReactNode; tone?: 'mute' | 'gold' | 'frost' | 'blood' | 'arcane' }) => {
  const c = { mute: 'text-mute border-edge', gold: 'text-gold border-gold/40', frost: 'text-frost border-frost/40', blood: 'text-blood border-blood/40', arcane: 'text-arcane border-arcane/40' }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
};

export type Tab = 'home' | 'progress' | 'run' | 'plan' | 'profile';
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; d: string }[] = [
    { id: 'home', label: t('tab.home'), d: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z' },
    { id: 'progress', label: t('tab.progress'), d: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
    { id: 'run', label: t('tab.run'), d: 'M13 4a2 2 0 1 0 0 .01M6 21l4-6 3 2 3-5-3-3-4 2-2 3M13 14l1 7' },
    { id: 'plan', label: t('tab.plan'), d: 'M12 21s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 11c0 5.500-7 10-7 10z' },
    { id: 'profile', label: t('tab.profile'), d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.500 3.500-7 8-7s8 2.500 8 7' },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-void/95 backdrop-blur safe-bottom">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((i) => (
          <button key={i.id} onClick={() => onTab(i.id)} aria-current={tab === i.id} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${tab === i.id ? 'text-gold' : 'text-mute'}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={i.d} /></svg>
            {i.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
