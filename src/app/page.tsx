'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID } from '@/lib/constants';
import Link from 'next/link';

interface Season {
  id: string;
  number: number;
  name: string;
  status: string;
  current_episode: number;
}

export default function HomePage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [survivorCount, setSurvivorCount] = useState(0);
  const [managerCount, setManagerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [seasonRes, survivorsRes, managersRes] = await Promise.all([
        supabase.from('seasons').select('*').eq('id', SEASON_ID).single(),
        supabase.from('survivors').select('id', { count: 'exact' }).eq('season_id', SEASON_ID),
        supabase.from('managers').select('id', { count: 'exact' }).eq('season_id', SEASON_ID),
      ]);

      if (seasonRes.data) setSeason(seasonRes.data);
      if (survivorsRes.count) setSurvivorCount(survivorsRes.count);
      if (managersRes.count) setManagerCount(managersRes.count);
      setLoading(false);
    }
    loadData();
  }, []);

  const statusLabel: Record<string, { text: string; color: string }> = {
    setup: { text: '⚙️ Setup', color: '#95a5a6' },
    drafting: { text: '📋 Draft Day', color: '#FF6B35' },
    active: { text: '🔥 Season Active', color: '#1ABC9C' },
    completed: { text: '🏆 Season Complete', color: '#FFD700' },
  };

  const quickLinks = [
    { href: '/draft', label: 'Draft Board', icon: '📋', desc: 'Live draft room' },
    { href: '/leaderboard', label: 'Leaderboard', icon: '🏆', desc: 'Current standings' },
    { href: '/picks', label: 'Weekly Picks', icon: '✅', desc: 'Submit your picks' },
    { href: '/pool', label: 'Survivor Pool', icon: '🌊', desc: 'Pool status board' },
    { href: '/scoreboard', label: 'Scoreboard', icon: '📊', desc: 'Episode scoring' },
    { href: '/dynasty', label: 'Dynasty', icon: '👑', desc: 'Historical rankings' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 torch-flicker">🔥</div>
          <div className="text-white/30 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  const st = season ? statusLabel[season.status] || statusLabel.setup : statusLabel.setup;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="text-5xl mb-3 torch-flicker">🔥</div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">
          <span className="text-white">Survivor OOO</span>{' '}
          <span className="text-survivor-flame">Fantasy</span>
        </h1>
        <p className="text-white/30 text-sm tracking-widest uppercase font-semibold">
          Outwit · Outplay · Outlast
        </p>
      </div>

      {/* Season Status Card */}
      <div className="card mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xl font-bold text-white">
              {season?.name || 'Survivor 50'}
            </div>
            <div className="text-sm text-white/40 mt-1">
              {survivorCount} survivors · {managerCount} managers
            </div>
          </div>
          <div
            className="text-sm font-bold px-4 py-2 rounded-lg"
            style={{
              background: `${st.color}15`,
              color: st.color,
            }}
          >
            {st.text}
          </div>
        </div>
        {season?.status === 'active' && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <span className="text-white/30 text-xs uppercase tracking-wider font-bold">
              Current Episode:
            </span>{' '}
            <span className="text-white font-bold">{season.current_episode}</span>
          </div>
        )}
      </div>

      {/* Quick Links Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="card group hover:border-survivor-flame/30 transition-all duration-200"
          >
            <div className="text-2xl mb-2">{link.icon}</div>
            <div className="text-sm font-bold text-white group-hover:text-survivor-flame transition-colors">
              {link.label}
            </div>
            <div className="text-xs text-white/25 mt-1">{link.desc}</div>
          </Link>
        ))}
      </div>

      {/* Admin link */}
      <div className="mt-6 text-center">
        <Link
          href="/admin"
          className="text-xs text-white/15 hover:text-white/40 transition-colors"
        >
          🛠 Commissioner Panel
        </Link>
      </div>
    </div>
  );
}
