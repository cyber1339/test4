export const dayKey = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const toDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (a: string, b: string): number => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
export const addDays = (k: string, n: number): string => { const d = toDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const weekStart = (k: string): string => addDays(k, -((toDate(k).getDay() + 6) % 7));
