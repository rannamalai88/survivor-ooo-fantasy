'use client';

// ============================================================
// Chips — who has played which S51 chip, and when.
// A chip is only shown once its episode has locked.
// ============================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useSeason } from '@/hooks/useSeason';
import { SEASON_ID, PICK_CHIPS, ROSTER_SLOTS, CHIP_FIRST_EP, CHIP_LAST_EP } from '@/lib/constants';

interface Played { manager_id: string; episode: number; chip: string; chip_slot: string | null }

export default function ChipsPage() {
  const { manager, managers } = useAuth();
  const { season } = useSeason();
  const [played, setPlayed] = useState<Played[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: eps }, { data: picks }] = await Promise.all([
        supabase.from('episodes').select('number, lock_at').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('manager_id, episode, chip, chip_slot').eq('season_id', SEASON_ID).not('chip', 'is', null),
      ]);
      const lockedEps = new Set((eps || []).filter((e: any) => Date.now() >= new Date(e.lock_at).getTime()).map((e: any) => e.number));
      setPlayed(((picks || []) as Played[]).filter(p => lockedEps.has(p.episode)));
      setLoading(false);
    })();
  }, []);

  const slotLabel = (k: string | null) => ROSTER_SLOTS.find(s => s.key === k)?.label;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading chips...</div></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-extrabold text-white tracking-wider">🎰 Chips</h1>
        <p className="text-white/40 text-xs mt-1 mb-5">{season?.name ?? ''} · Episodes {CHIP_FIRST_EP}–{CHIP_LAST_EP} · one chip per episode, each chip once per season · shown after picks lock</p>

        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          {PICK_CHIPS.map(c => (
            <div key={c.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-sm font-bold text-white">{c.icon} {c.name}</div>
              <div className="text-xs text-white/50 mt-1">{c.desc}</div>
              <div className="text-[10px] text-white/35 mt-2">Played {played.filter(p => p.chip === c.id).length} time{played.filter(p => p.chip === c.id).length === 1 ? '' : 's'} so far</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-white/[0.03]">
                <th className="text-left p-2.5 text-white/45 font-bold tracking-wider text-[10px]">MANAGER</th>
                {PICK_CHIPS.map(c => <th key={c.id} className="text-left p-2.5 text-white/45 font-bold tracking-wider text-[10px] whitespace-nowrap">{c.icon} {c.name.toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {managers.map(m => (
                <tr key={m.id} className="border-t border-white/[0.04]" style={{ background: m.id === manager?.id ? 'rgba(255,107,53,0.08)' : undefined }}>
                  <td className="p-2.5 font-semibold text-white/90 whitespace-nowrap">{m.name}</td>
                  {PICK_CHIPS.map(c => {
                    const p = played.find(x => x.manager_id === m.id && x.chip === c.id);
                    return (
                      <td key={c.id} className="p-2.5 whitespace-nowrap">
                        {p ? <span className="text-white/85">E{p.episode}{p.chip_slot ? <span className="text-white/45"> · {slotLabel(p.chip_slot)}</span> : ''}</span> : <span className="text-white/25">available</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
