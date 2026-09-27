'use client';

// ============================================================
// My Season — /my-team
// Every card you've played: score, opponent, result, chip, pool pick.
// (S51 has no roster; this replaces the S50 "My Team" page.)
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/auth/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, PICK_CHIPS, ROSTER_SLOTS } from '@/lib/constants';
import { loadStandings, fmtPts, type Standings } from '@/lib/standings';
import { formatRank } from '@/lib/utils';

interface Row {
  episode: number; locked: boolean; scored: boolean; card: number | null;
  opponent: string | null; oppCard: number | null; h2h: number | null;
  chip: string | null; chipSlot: string | null;
  poolName: string | null; poolKind: 'pool' | 'backdoor' | null; poolOutcome: string | null;
  submitted: boolean;
}

function MySeasonContent() {
  const { manager, managers } = useAuth();
  const [standings, setStandings] = useState<Standings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!manager) return;
    (async () => {
      const [st, { data: eps }, { data: picks }, { data: scores }, { data: fixtures }, { data: survivors }, { data: season }] = await Promise.all([
        loadStandings(),
        supabase.from('episodes').select('number, lock_at, h2h_round, status').eq('season_id', SEASON_ID).order('number'),
        supabase.from('weekly_picks').select('episode, chip, chip_slot, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).eq('manager_id', manager.id),
        supabase.from('manager_scores').select('manager_id, episode, card_total, h2h_points').eq('season_id', SEASON_ID),
        supabase.from('fixtures').select('round, manager_a, manager_b').eq('season_id', SEASON_ID),
        supabase.from('survivors').select('id, name, eliminated_episode').eq('season_id', SEASON_ID),
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
      ]);
      setStandings(st);
      const current = season?.current_episode ?? 2;
      const out: Row[] = (eps || []).filter((e: any) => e.number >= 2 && e.number <= current).map((e: any) => {
        const p: any = (picks || []).find((x: any) => x.episode === e.number);
        const mine: any = (scores || []).find((x: any) => x.episode === e.number && x.manager_id === manager.id);
        const fx: any = e.h2h_round ? (fixtures || []).find((f: any) => f.round === e.h2h_round && (f.manager_a === manager.id || f.manager_b === manager.id)) : null;
        const oppId = fx ? (fx.manager_a === manager.id ? fx.manager_b : fx.manager_a) : null;
        const opp: any = oppId ? (scores || []).find((x: any) => x.episode === e.number && x.manager_id === oppId) : null;
        const poolId = p?.pool_pick_id || p?.pool_backdoor_id || null;
        const surv: any = poolId ? (survivors || []).find((s: any) => s.id === poolId) : null;
        const scored = e.status === 'scored';
        let poolOutcome: string | null = null;
        if (surv && scored) {
          if (p.pool_pick_id) poolOutcome = surv.eliminated_episode === e.number ? 'drowned' : 'safe';
          else poolOutcome = surv.eliminated_episode === e.number ? 'backdoor hit' : 'backdoor missed';
        }
        return {
          episode: e.number,
          locked: Date.now() >= new Date(e.lock_at).getTime(),
          scored,
          card: mine?.card_total ?? null,
          opponent: oppId ? managers.find(m => m.id === oppId)?.name ?? null : null,
          oppCard: opp?.card_total ?? null,
          h2h: mine?.h2h_points ?? null,
          chip: p?.chip ?? null,
          chipSlot: p?.chip_slot ?? null,
          poolName: surv?.name ?? null,
          poolKind: (p?.pool_pick_id ? 'pool' : p?.pool_backdoor_id ? 'backdoor' : null) as Row['poolKind'],
          poolOutcome,
          submitted: !!p,
        };
      }).reverse();
      setRows(out);
      setLoading(false);
    })();
  }, [manager, managers]);

  const me = standings?.rows.find(r => r.managerId === manager?.id);
  const chipsUsed = rows.filter(r => r.chip).map(r => r.chip);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading your season...</div></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-extrabold text-white tracking-wider">📋 My Season</h1>
        <p className="text-white/40 text-xs mt-1 mb-5">Every card you&apos;ve played. Tap a score to see how it was earned.</p>

        {me && (standings?.scoredEpisodes.length ?? 0) > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {[
              { k: 'Championship', v: fmtPts(me.championship), sub: me.rank ? `${formatRank(me.rank)} overall` : '' },
              { k: 'Head to Head', v: `${me.won}-${me.drawn}-${me.lost}`, sub: `${me.h2hPoints} pts` },
              { k: 'Card points', v: `${me.rawCardPoints}`, sub: 'season total' },
              { k: 'Pool', v: `${me.weeksSurvived} wk${me.weeksSurvived === 1 ? '' : 's'}`, sub: me.poolStatus },
            ].map(x => (
              <div key={x.k} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[10px] font-bold tracking-wider text-white/40">{x.k.toUpperCase()}</div>
                <div className="text-xl font-black text-white">{x.v}</div>
                <div className="text-[11px] text-white/45">{x.sub}</div>
              </div>
            ))}
          </div>
        )}

        <div className="text-[11px] text-white/45 mb-3">
          Chips left: {PICK_CHIPS.filter(c => !chipsUsed.includes(c.id)).map(c => `${c.icon} ${c.name}`).join(' · ') || 'none'}
        </div>

        <div className="space-y-2">
          {rows.length === 0 && <div className="text-sm text-white/50">No episodes yet.</div>}
          {rows.map(r => {
            const chipDef = r.chip ? PICK_CHIPS.find(c => c.id === r.chip) : null;
            const result = r.card !== null && r.oppCard !== null ? (r.card > r.oppCard ? 'W' : r.card < r.oppCard ? 'L' : 'D') : null;
            return (
              <div key={r.episode} className="rounded-xl p-3 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-12 text-xs font-bold text-white/45">E{r.episode}</div>
                <div className="w-14">
                  {r.scored && r.card !== null && manager
                    ? <Link href={`/breakdown/${manager.id}/${r.episode}`} className="text-xl font-black hover:underline" style={{ color: r.card < 0 ? '#f87171' : '#fff' }}>{r.card}</Link>
                    : <span className="text-xs text-white/40">{!r.submitted ? (r.locked ? 'no card' : 'not in') : r.locked ? 'locked' : 'submitted'}</span>}
                </div>
                <div className="flex-1 min-w-[160px] text-xs text-white/70">
                  {r.opponent ? <>vs {r.opponent}{r.oppCard !== null && ` (${r.oppCard})`}{result && <b className="ml-1.5" style={{ color: result === 'W' ? '#4ade80' : result === 'L' ? '#f87171' : 'rgba(255,255,255,0.7)' }}>{result} · {r.h2h ?? 0} pts</b>}</> : <span className="text-white/40">No fixture</span>}
                  {chipDef && <div className="text-[#3fc0f0] text-[11px] mt-0.5">{chipDef.icon} {chipDef.name}{r.chipSlot ? ` on ${ROSTER_SLOTS.find(s => s.key === r.chipSlot)?.label}` : ''}</div>}
                </div>
                <div className="text-[11px] text-white/55">
                  {r.poolName ? <>🌊 {r.poolKind === 'backdoor' ? 'Backdoor ' : ''}{r.poolName}{r.poolOutcome && <span style={{ color: r.poolOutcome === 'safe' || r.poolOutcome === 'backdoor hit' ? '#4ade80' : '#f87171' }}> · {r.poolOutcome}</span>}</> : <span className="text-white/30">no pool pick</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function MySeasonPage() {
  return <AuthGuard><MySeasonContent /></AuthGuard>;
}
