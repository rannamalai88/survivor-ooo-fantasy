'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';

export default function Nav() {
  const pathname = usePathname();
  const { isCommissioner } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleLinks = NAV_LINKS.filter(
    (link) => link.href !== '/admin' || isCommissioner
  );

  return (
    <nav
      className="sticky top-0 z-50 border-b border-white/[0.06]"
      style={{ background: 'rgba(13, 13, 21, 0.95)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-xl">🔥</span>
            <span className="text-base font-extrabold tracking-tight">
              <span className="text-white group-hover:text-orange-400 transition-colors">Survivor OOO</span>
              <span className="text-orange-500 ml-1">Fantasy</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {visibleLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    isActive
                      ? 'px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide uppercase bg-orange-500/10 text-orange-400'
                      : 'px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide uppercase text-white/30 hover:text-white/60 hover:bg-white/[0.03]'
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <button
            className="md:hidden p-2 text-white/50 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? '\u2715' : '\u2630'}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-white/[0.06] pt-2">
            {visibleLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={
                    isActive
                      ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-orange-500/10 text-orange-400'
                      : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                  }
                >
                  <span className="text-base">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
