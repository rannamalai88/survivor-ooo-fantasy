'use client';

// ============================================================
// Survivor Points — /scoreboard
// FSG points per survivor per episode, from episode_events.
// Marks challenge wins, Most Other Points and departures, which are
// exactly what the four roster slots score on.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSeason } from '@/hooks/useSeason';
import { SEASON_ID, SEASON_NUMBER, TRIBE_COLORS } from '@/lib/constants';

interface Survivor { id: string; name: string; tribe: string; original_tribe: string | null; is_active: boolean; eliminated_episode: number | null; photo_url: string | null }
interface Event { survivor_id: string; episode: number; action: string; points: number; category: string }
interface Outcome { episode: number; mop_winners: string[] }

const tc = (t: string) => TRIBE_COLORS[t] || '#9aa0a8';

export default function SurvivorPointsPage() {
  const { season } = useSeason();
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [tribe, setTribe] = useState('All');
  const [selected, setSelected] = useState<{ survivorId: string; episode: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: e }, { data: o }] = await Promise.all([
        supabase.from('survivors').select('id, name, tribe, original_tribe, is_active, eliminated_episode, photo_url').eq('season_id', SEASON_ID).eq('is_playable', true).order('name'),
        supabase.from('episode_events').select('survivor_id, episode, action, points, category').eq('season_id', SEASON_ID),
        supabase.from('episode_outcomes').select('episode, mop_winners').eq('season_id', SEASON_ID),
      ]);
      setSurvivors((s || []) as Survivor[]);
      setEvents((e || []) as Event[]);
      setOutcomes((o || []) as Outcome[]);
      setLoading(false);
    })();
  }, []);

  const episodes = useMemo(() => [...new Set(events.map(e => e.episode))].sort((a, b) => a - b), [events]);
  const tribes = useMemo(() => [...new Set(survivors.map(s => s.original_tribe || s.tribe))].sort(), [survivors]);
  const cell = (sid: string, ep: number) => events.filter(e => e.survivor_id === sid && e.episode === ep);
  const total = (sid: string) => events.filter(e => e.survivor_id === sid).reduce((s, e) => s + e.points, 0);

  const rows = useMemo(() => survivors
    .filter(s => tribe === 'All' || (s.original_tribe || s.tribe) === tribe)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || total(b.id) - total(a.id)), [survivors, tribe, events]);

  const sel = selected ? { s: survivors.find(x => x.id === selected.survivorId), acts: cell(selected.survivorId, selected.episode) } : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading survivor points...</div></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-xl font-extrabold text-white tracking-wider">📊 Survivor Points</h1>
        <p className="text-white/40 text-xs mt-1 mb-4">
          {season?.name ?? ''} · FSG points each episode · tap a cell for the itemized actions ·{' '}
          <a href={`https://www.fantasysurvivorgame.com/episode-recap/season/${SEASON_NUMBER}`} target="_blank" rel="noreferrer" className="text-[#3fc0f0] underline">FSG recap ↗</a>
        </p>

        <div className="flex gap-1 mb-3">
          {['All', ...tribes].map(t => (
            <button key={t} onClick={() => setTribe(t)} className="px-3 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase border-none cursor-pointer"
              style={{ background: tribe === t ? `${t === 'All' ? '#FF6B35' : tc(t)}22` : 'rgba(255,255,255,0.03)', color: tribe === t ? (t === 'All' ? '#FF6B35' : tc(t)) : 'rgba(255,255,255,0.4)' }}>{t}</button>
          ))}
        </div>

        {sel?.s && (
          <div className="rounded-xl p-3 mb-3 text-xs" style={{ background: 'rgba(5,169,230,0.06)', border: '1px solid rgba(5,169,230,0.25)' }}>
            <div className="flex justify-between mb-1">
              <b className="text-white">{sel.s.name} · Episode {selected!.episode}</b>
              <button onClick={() => setSelected(null)} className="text-white/50 bg-transparent border-none cursor-pointer">✕</button>
            </div>
            {sel.acts.length === 0 ? <div className="text-white/50">No FSG actions — 0 points.</div> : sel.acts.map((a, i) => (
              <div key={i} className="flex justify-between text-white/75"><span>{a.action}{a.category !== 'other' && <span className="text-white/40"> · {a.category === 'departure' ? 'left the game' : `${a.category} win`}</span>}</span><b>{a.category === 'departure' ? '—' : a.points}</b></div>
            ))}
          </div>
        )}

        {episodes.length === 0 ? <div className="text-sm text-white/50">No episodes pulled from FSG yet.</div> : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-2.5 text-white/45 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10">SURVIVOR</th>
                  {episodes.map(ep => <th key={ep} className="text-center p-2 text-white/45 font-bold text-[10px]">E{ep}</th>)}
                  <th className="text-center p-2.5 text-white/45 font-bold text-[10px]">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} className="border-t border-white/[0.04]">
                    <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10 whitespace-nowrap">
                      <span className="font-semibold" style={{ color: s.is_active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}>{s.name}</span>
                      <span className="ml-1.5 text-[9px] font-bold" style={{ color: tc(s.tribe) }}>{s.tribe.toUpperCase()}</span>
                    </td>
                    {episodes.map(ep => {
                      const acts = cell(s.id, ep);
                      const pts = acts.reduce((sum, a) => sum + a.points, 0);
                      const left = acts.some(a => a.category === 'departure');
                      const won = acts.filter(a => a.category === 'reward' || a.category === 'immunity');
                      const mop = outcomes.find(o => o.episode === ep)?.mop_winners.includes(s.id);
                      const gone = s.eliminated_episode !== null && ep > s.eliminated_episode;
                      return (
                        <td key={ep} onClick={() => !gone && setSelected({ survivorId: s.id, episode: ep })}
                          className="text-center p-2" style={{ cursor: gone ? 'default' : 'pointer', background: left ? 'rgba(248,113,113,0.1)' : undefined }}>
                          {gone ? <span className="text-white/15">·</span> : <>
                            <span className="font-bold" style={{ color: pts > 0 ? '#fff' : 'rgba(255,255,255,0.3)' }}>{pts}</span>
                            <span className="ml-0.5 text-[9px]">
                              {won.some(a => a.category === 'immunity') && '🗿'}{won.some(a => a.category === 'reward') && '🍖'}{mop && '📈'}{left && '🔥'}
                            </span>
                          </>}
                        </td>
                      );
                    })}
                    <td className="text-center p-2.5 font-black text-white">{total(s.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-[11px] text-white/40">🗿 immunity win · 🍖 reward win · 📈 most Other points · 🔥 left the game</div>
      </div>
    </div>
  );
}
