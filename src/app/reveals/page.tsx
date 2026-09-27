'use client';

// ============================================================
// Reveals — /reveals
// Before an episode locks: who has submitted (never what they picked).
// After lock (episodes.lock_at): every card, grouped by H2H fixture.
// Once scored: card totals and fixture results, linked to breakdowns.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { SEASON_ID, TRIBE_COLORS, ROSTER_SLOTS, PICK_CHIPS, type RosterSlot } from '@/lib/constants';

interface Survivor { id: string; name: string; tribe: string; photo_url: string | null; eliminated_episode: number | null }
interface EpisodeRow { number: number; lock_at: string; h2h_round: number | null; status: string; is_couples_week: boolean; is_rivalry_week: boolean }
interface Pick {
  manager_id: string; reward_pick_id: string | null; immunity_pick_id: string | null; going_home_pick_id: string | null;
  mop_pick_id: string | null; title_pick_id: string | null; chip: string | null; chip_slot: string | null; hedge_alt_id: string | null;
  pool_pick_id: string | null; pool_backdoor_id: string | null;
}
interface Fixture { id: string; manager_a: string; manager_b: string }
interface Score { manager_id: string; card_total: number | null; h2h_points: number | null }

const tc = (t: string) => TRIBE_COLORS[t] || '#9aa0a8';
const SLOT_COL: Record<RosterSlot, keyof Pick> = { reward: 'reward_pick_id', immunity: 'immunity_pick_id', going_home: 'going_home_pick_id', mop: 'mop_pick_id' };

export default function RevealsPage() {
  const { manager, managers } = useAuth();
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    (async () => {
      const [{ data: season }, { data: eps }, { data: surv }] = await Promise.all([
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
        supabase.from('episodes').select('number, lock_at, h2h_round, status, is_couples_week, is_rivalry_week').eq('season_id', SEASON_ID).order('number'),
        supabase.from('survivors').select('id, name, tribe, photo_url, eliminated_episode').eq('season_id', SEASON_ID),
      ]);
      setEpisodes((eps || []) as EpisodeRow[]);
      setSurvivors((surv || []) as Survivor[]);
      setSelected(season?.current_episode ?? 2);
    })();
  }, []);

  const ep = episodes.find(e => e.number === selected) || null;
  const isLocked = !!ep && now >= new Date(ep.lock_at).getTime();

  useEffect(() => {
    if (!ep) return;
    (async () => {
      // Before lock only fetch who submitted — never the picks themselves.
      if (!isLocked) {
        const { data } = await supabase.from('weekly_picks').select('manager_id').eq('season_id', SEASON_ID).eq('episode', ep.number);
        setSubmittedIds((data || []).map((r: any) => r.manager_id));
        setPicks([]); setScores([]);
      } else {
        const [{ data: p }, { data: s }] = await Promise.all([
          supabase.from('weekly_picks')
            .select('manager_id, reward_pick_id, immunity_pick_id, going_home_pick_id, mop_pick_id, title_pick_id, chip, chip_slot, hedge_alt_id, pool_pick_id, pool_backdoor_id')
            .eq('season_id', SEASON_ID).eq('episode', ep.number),
          supabase.from('manager_scores').select('manager_id, card_total, h2h_points').eq('season_id', SEASON_ID).eq('episode', ep.number),
        ]);
        setPicks((p || []) as Pick[]);
        setSubmittedIds((p || []).map((r: any) => r.manager_id));
        setScores((s || []) as Score[]);
      }
      if (ep.h2h_round) {
        const { data: fx } = await supabase.from('fixtures').select('id, manager_a, manager_b').eq('season_id', SEASON_ID).eq('round', ep.h2h_round);
        setFixtures((fx || []) as Fixture[]);
      } else setFixtures([]);
    })();
  }, [ep?.number, isLocked]);

  const byId = useMemo(() => new Map(survivors.map(s => [s.id, s])), [survivors]);
  const nameOfMgr = (id: string) => managers.find(m => m.id === id)?.name || '?';
  const scored = ep?.status === 'scored';

  // Fixture groups (mine first); episodes without fixtures list everyone
  const groups: string[][] = useMemo(() => {
    if (fixtures.length) {
      const g = fixtures.map(f => [f.manager_a, f.manager_b]);
      return g.sort((a, b) => Number(b.includes(manager?.id || '')) - Number(a.includes(manager?.id || '')));
    }
    return managers.map(m => [m.id]);
  }, [fixtures, managers, manager]);

  const Chip = ({ s, dim }: { s: Survivor | undefined; dim?: boolean }) => !s ? <span className="text-white/30">—</span> : (
    <span className="inline-flex items-center gap-1.5" style={{ opacity: dim ? 0.55 : 1 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${tc(s.tribe)}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${tc(s.tribe)}33`, flexShrink: 0 }}>
        {s.photo_url ? <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>{s.name[0]}</span>}
      </span>
      <span className="text-white/85">{s.name}</span>
    </span>
  );

  const CardView = ({ managerId }: { managerId: string }) => {
    const p = picks.find(x => x.manager_id === managerId);
    const sc = scores.find(x => x.manager_id === managerId);
    const chipDef = p?.chip ? PICK_CHIPS.find(c => c.id === p.chip) : null;
    const isMe = managerId === manager?.id;
    return (
      <div className="flex-1 min-w-[240px] rounded-xl p-3" style={{ background: isMe ? 'rgba(255,107,53,0.07)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isMe ? 'rgba(255,107,53,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-extrabold text-white">{nameOfMgr(managerId)}{isMe && <span className="ml-1.5 text-[9px] text-[#FF6B35]">YOU</span>}</span>
          {scored && sc?.card_total !== null && sc?.card_total !== undefined && (
            <Link href={`/breakdown/${managerId}/${ep!.number}`} className="text-lg font-black hover:underline" style={{ color: sc.card_total < 0 ? '#f87171' : '#fff' }}>{sc.card_total}</Link>
          )}
        </div>
        {!p ? <div className="text-xs text-white/40">No card submitted.</div> : (
          <div className="space-y-1.5 text-xs">
            {ROSTER_SLOTS.map(slot => (
              <div key={slot.key} className="flex items-center justify-between gap-2">
                <span className="text-white/45 w-24 shrink-0">{slot.icon} {slot.label.replace(' Winner', '')}</span>
                <span className="flex-1 flex items-center gap-1.5 flex-wrap justify-end">
                  <Chip s={byId.get(p[SLOT_COL[slot.key]] as string)} />
                  {p.chip === 'hedge' && p.chip_slot === slot.key && p.hedge_alt_id && <><span className="text-white/35">/</span><Chip s={byId.get(p.hedge_alt_id)} dim /></>}
                  {p.chip_slot === slot.key && chipDef && <span className="text-[9px] font-bold text-[#3fc0f0]">{chipDef.icon}</span>}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/45 w-24 shrink-0">💬 Title</span>
              <span className="flex-1 flex justify-end"><Chip s={byId.get(p.title_pick_id || '')} /></span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.05]">
              <span className="text-white/45 w-24 shrink-0">🌊 {p.pool_backdoor_id ? 'Backdoor' : 'Pool'}</span>
              <span className="flex-1 flex justify-end"><Chip s={byId.get(p.pool_pick_id || p.pool_backdoor_id || '')} /></span>
            </div>
            {chipDef && <div className="text-[10px] text-[#3fc0f0] pt-1">{chipDef.icon} {chipDef.name}{p.chip_slot ? ` on ${ROSTER_SLOTS.find(s => s.key === p.chip_slot)?.label}` : ''}</div>}
          </div>
        )}
      </div>
    );
  };

  if (!ep) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading reveals...</div></div>;

  const lockLabel = new Date(ep.lock_at).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h1 className="text-xl font-extrabold text-white tracking-wider">🔓 Reveals</h1>
          <select value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white font-semibold">
            {episodes.filter(e => e.number >= 2).map(e => <option key={e.number} value={e.number} className="bg-[#1a1a2e]">Episode {e.number}</option>)}
          </select>
        </div>
        <p className="text-white/40 text-xs mb-5">
          {isLocked ? (scored ? `Episode ${ep.number} is scored — tap a total for the breakdown.` : `Episode ${ep.number} picks locked ${lockLabel}. Scores land after the FSG pull.`) : `Cards are revealed when picks lock: ${lockLabel}.`}
          {ep.is_couples_week && ' · 💞 Couples Week'}{ep.is_rivalry_week && ' · ⚔️ Rivalry Week'}
        </p>

        {!isLocked ? (
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-sm font-bold text-white mb-3">{submittedIds.length} of {managers.length} cards in</div>
            <div className="flex flex-wrap gap-2">
              {managers.map(m => {
                const inn = submittedIds.includes(m.id);
                return <span key={m.id} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: inn ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)', color: inn ? '#4ade80' : 'rgba(255,255,255,0.45)', border: `1px solid ${inn ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}` }}>{inn ? '✓' : '…'} {m.name}</span>;
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(g => {
              const [a, b] = g;
              const sa = scores.find(s => s.manager_id === a), sb = b ? scores.find(s => s.manager_id === b) : undefined;
              return (
                <div key={g.join('-')} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {b && (
                    <div className="text-[10px] font-bold tracking-widest text-white/40 mb-2 px-1">
                      {nameOfMgr(a).toUpperCase()} VS {nameOfMgr(b).toUpperCase()}
                      {scored && sa && sb && sa.card_total !== null && sb.card_total !== null && (
                        <span className="ml-2 text-white/70">{sa.card_total}–{sb.card_total} · {sa.card_total > sb.card_total ? `${nameOfMgr(a)} wins` : sa.card_total < sb.card_total ? `${nameOfMgr(b)} wins` : 'Draw'}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <CardView managerId={a} />
                    {b && <CardView managerId={b} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
