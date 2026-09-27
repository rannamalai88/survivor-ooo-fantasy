'use client';

// Top app bar (all sizes) + bottom tab bar (phones).

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme, type ThemePref } from '@/lib/theme';
import { useSeasonContext } from '@/lib/season-context';
import { cn, ManagerAvatar } from '@/components/ui';
import { IconGrid, IconSun, IconMoon, IconMonitor, IconLogout, IconChevronDown } from '@/components/ui/icons';
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from './nav-config';

function useCountdown(lockAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);
  if (!lockAt) return null;
  const ms = new Date(lockAt).getTime() - now;
  if (ms <= 0) return 'locked';
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`;
}

function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { pref, setTheme } = useTheme();
  const opts: { v: ThemePref; icon: JSX.Element; label: string }[] = [
    { v: 'light', icon: <IconSun size={16} />, label: 'Light' },
    { v: 'dark', icon: <IconMoon size={16} />, label: 'Dark' },
    { v: 'system', icon: <IconMonitor size={16} />, label: 'Auto' },
  ];
  return (
    <div className="inline-flex rounded-xl bg-raised p-1 gap-1" role="radiogroup" aria-label="Theme">
      {opts.map(o => (
        <button key={o.v} role="radio" aria-checked={pref === o.v} onClick={() => setTheme(o.v)} title={o.label}
          className={cn('h-8 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold', compact ? 'w-8' : 'px-2.5',
            pref === o.v ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}>
          {o.icon}{!compact && o.label}
        </button>
      ))}
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { manager, isCommissioner, logout } = useAuth();
  const { season, episode } = useSeasonContext();
  const countdown = useCountdown(episode?.lock_at ?? null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const secondary = SECONDARY_NAV.filter(i => !i.adminOnly || isCommissioner);
  useEffect(() => { setMoreOpen(false); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const handleLogout = () => { logout(); router.push('/login'); };
  const moreActive = secondary.some(i => isActive(pathname, i));

  const DesktopLink = ({ item, extra }: { item: NavItem; extra?: string }) => (
    <Link href={item.href} className={cn('h-9 px-3 rounded-lg inline-flex items-center text-sm font-medium whitespace-nowrap transition-colors', extra,
      isActive(pathname, item) ? 'bg-raised text-ink' : 'text-muted hover:text-ink hover:bg-raised/60')}>
      {item.label}
    </Link>
  );

  return (
    <>
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl h-14 px-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg">🔥</span>
            <span className="font-bold tracking-tight text-ink hidden sm:inline">Survivor OOO</span>
          </Link>

          {season && (
            <Link href="/picks" className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 h-7 text-xs font-semibold text-muted hover:text-ink whitespace-nowrap">
              <span className="text-ink">S{season.number} · Ep {season.current_episode}</span>
              {countdown && <span className={countdown === 'locked' ? 'text-muted' : 'text-accent'}>{countdown === 'locked' ? '· locked' : `· ${countdown}`}</span>}
            </Link>
          )}

          <nav className="hidden md:flex items-center gap-1 ml-2">
            {PRIMARY_NAV.map(i => <DesktopLink key={i.href} item={i} />)}
            {secondary.slice(0, 3).map(i => <DesktopLink key={i.href} item={i} extra="hidden xl:inline-flex" />)}
            <div className="relative">
              <button onClick={() => setMoreOpen(v => !v)} className={cn('h-9 px-3 rounded-lg inline-flex items-center gap-1 text-sm font-medium',
                moreActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink hover:bg-raised/60')}>
                More <IconChevronDown size={14} />
              </button>
              {moreOpen && (
                <div className="absolute left-0 top-11 w-48 rounded-xl border border-line bg-surface p-1 shadow-pop">
                  {secondary.map((i, n) => (
                    <Link key={i.href} href={i.href} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-sm', n < 3 && 'xl:hidden', isActive(pathname, i) ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink')}>
                      <i.icon size={16} />{i.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block"><ThemeSwitch compact /></div>
            {manager && (
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen(v => !v)} className="flex items-center gap-2 rounded-full pl-1 pr-2 h-9 hover:bg-raised" aria-label="Account menu">
                  <ManagerAvatar name={manager.name} size={28} me />
                  <span className="text-sm font-medium text-ink hidden sm:inline">{manager.name}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-11 w-56 rounded-xl border border-line bg-surface p-1 shadow-pop">
                    <div className="px-2.5 py-2 text-xs text-muted">Signed in as <b className="text-ink">{manager.name}</b>{isCommissioner && ' · commissioner'}</div>
                    <Link href="/managers/me" className="flex items-center rounded-lg px-2.5 h-9 text-sm text-ink hover:bg-raised">My season</Link>
                    <button onClick={handleLogout} className="w-full flex items-center gap-2 rounded-lg px-2.5 h-9 text-sm text-negative hover:bg-raised"><IconLogout size={16} />Log out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Bottom tab bar (phones) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-canvas/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5 h-[60px]">
          {PRIMARY_NAV.map(i => {
            const on = isActive(pathname, i);
            return (
              <Link key={i.href} href={i.href} className={cn('flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold', on ? 'text-accent' : 'text-muted')}>
                <i.icon size={22} />{i.label}
              </Link>
            );
          })}
          <button onClick={() => setMoreOpen(v => !v)} className={cn('flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold', moreOpen || moreActive ? 'text-accent' : 'text-muted')}>
            <IconGrid size={22} />More
          </button>
        </div>
      </nav>

      {/* ── "More" sheet (phones) ── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-4 shadow-pop" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-4 gap-2 mb-4">
              {secondary.map(i => (
                <Link key={i.href} href={i.href} className={cn('flex flex-col items-center gap-1.5 rounded-xl py-3 text-[11px] font-semibold', isActive(pathname, i) ? 'bg-accent/10 text-accent' : 'bg-raised/60 text-ink')}>
                  <i.icon size={22} />{i.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <ThemeSwitch />
              {manager && <button onClick={handleLogout} className="inline-flex items-center gap-1.5 text-sm font-semibold text-negative"><IconLogout size={16} />Log out</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
