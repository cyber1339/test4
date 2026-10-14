import { ro } from './ro.ts';
import { en } from './en.ts';

export type Lang = 'ro' | 'en';
const dicts: Record<Lang, Record<string, string>> = { ro, en: { ...ro, ...en } }; // missing English keys fall back to Romanian
let current: Lang = 'ro';

export const setLang = (l: Lang) => { current = l; };
export const getLang = () => current;

/** t('key', { n: 3 }) replaces {n}. Unknown keys render as the key itself so gaps are visible. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
