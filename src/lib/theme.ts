'use client';

import { useEffect, useState } from 'react';

import { THEME_STORAGE_KEY } from './theme-key';
export { THEME_STORAGE_KEY };
export type ThemePref = 'system' | 'light' | 'dark';

function readPref(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', pref);
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch { /* storage unavailable — the choice lasts for this page view */ }
}

/** Current theme preference plus the resolved light/dark value. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPref(readPref());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  return {
    pref,
    resolved,
    setTheme: (next: ThemePref) => { setPref(next); apply(next); },
  };
}
