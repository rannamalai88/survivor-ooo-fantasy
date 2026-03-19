'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID } from '@/lib/constants';

interface Manager { id: string; name: string; draft_position: number; }
interface WeeklyPickRow { manager_id: string; episode: number; net_pick_id: string | null; }
interface NetAnswerRow { episode: number; correct_survivor_id: string; episode_title: string | null; }
interface SurvivorRow { id: string; name: string; }

export default function NetPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [netAnswers, setNetAnswers] = useState<NetAnswerRow[]>([]);
  const [survivors, setSurvivors] = useState<SurvivorRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [seasonRes, managersRes, picksRes, netRes, survivorsRes] = await Promise.all([
      supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
      supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
      supabase.from('weekly_picks').select('manager_id, episode, net_pick_id').eq('season_id', SEASON_ID).order('episode'),
      supabase.from('net_answers').select('episode, correct_survivor_id, episode_title').eq('season_id', SEASON_ID).order('episode'),
      supabase.from('survivors').select('id, name').eq('season_id', SEASON_ID),
    ]);
    setCurrentEpisode(seasonRes.data?.current_episode || 2);
    setManagers(managersRes.data || []);
    setWeeklyPicks(picksRes.data || []);
    setNetAnswers(netRes.data || []);
    setSurvivors(survivorsRes.data || []);
    setLoading(false);
  }

  const survivorMap = useMemo(() => {
    const m = new Map<string, string>();
    survivors.forEach(s => m.set(s.id, s.name));
    return m;
  }, [survivors]);

  // Episodes that have a scored NET answer
  const scoredEpisodes = useMemo(() =>
    netAnswers.map(a => a.episode).sort((a, b) => a - b),
  [netAnswers]);

  // Per-manager NET data
  const managerNetData = useMemo(() => {
    return managers.map(m => {
      const epResults: Record<number, { guess: string | null; correct: boolean | null }> = {};
      let correctCount = 0;

      scoredEpisodes.forEach(ep => {
        const pick = weeklyPicks.find(p => p.manager_id === m.id && p.episode === ep);
        const answer = netAnswers.find(a => a.episode === ep);
        if (!answer) { epResults[ep] = { guess: null, correct: null }; return; }

        const guessName = pick?.net_pick_id ? (survivorMap.get(pick.net_pick_id) || '?') : null;
        const correct = pick?.net_pick_id
          ? pick.net_pick_id === answer.correct_survivor_id
          : false;
        if (correct) correctCount++;
        epResults[ep] = { guess: guessName, correct };
      });

      // Also include current episode pick (not yet answered)
      const currentPick = weeklyPicks.find(p => p.manager_id === m.id && p.episode === currentEpisode);
      const hasCurrentPick = !!currentPick?.net_pick_id;

      return {
        ...m,
        epResults,
        correctCount,
        totalPts: correctCount * 3,
        hasCurrentPick,
        currentGuess: currentPick?.net_pick_id ? survivorMap.get(currentPick.net_pick_id) || null : null,
      };
    }).sort((a, b) => b.totalPts - a.totalPts);
  }, [managers, weeklyPicks, netAnswers, survivorMap, scoredEpisodes, currentEpisode]);

  // Per-episode correct answer and pick distribution
  const episodeStats = useMemo(() => {
    return scoredEpisodes.map(ep => {
      const answer = netAnswers.find(a => a.episode === ep)!;
      const correctName = survivorMap.get(answer.correct_survivor_id) || '?';
      const correctCount = managerNetData.filter(m => m.epResults[ep]?.correct === true).length;
      const totalPicked = managerNetData.filter(m => m.epResults[ep]?.guess !== null).length;
      return { ep, correctName, title: answer.episode_title, correctCount, totalPicked };
    });
  }, [scoredEpisodes, netAnswers, survivorMap, managerNetData]);

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4 animate-pulse">💬</div>
      <p className="text-white/30 text-sm">Loading NET...</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-white tracking-wider">💬 Name Episode Title (NET)</h1>
        <p className="text-white/25 text-xs mt-1">Season 50 · Guess which survivor says the episode title · 3 pts per correct answer</p>
      </div>

      {/* Episode answer cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
        {episodeStats.map(ep => (
          <div key={ep.ep} className="flex-shrink-0 rounded-xl border border-white/[0.06] overflow-hidden"
            style={{ minWidth: '160px', background: 'rgba(255,255,255,0.02)' }}>
            <div className="px-3 py-2 border-b border-white/[0.06]" style={{ background: 'rgba(26,188,156,0.05)' }}>
              <div className="text-[10px] font-extrabold text-teal-400">E{ep.ep}</div>
              {ep.title && (
                <div className="text-[10px] font-semibold text-white/50 mt-0.5 italic leading-tight">
                  &ldquo;{ep.title}&rdquo;
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="text-[9px] font-bold text-white/25 uppercase tracking-wider mb-1">Said by</div>
              <div className="text-[13px] font-extrabold text-white">{ep.correctName}</div>
              <div className="mt-2 text-[9px] text-white/25">
                <span className="text-teal-400 font-bold">{ep.correctCount}</span>/{ep.totalPicked} correct
              </div>
            </div>
          </div>
        ))}

        {/* Current episode — picks hidden until scored */}
        <div className="flex-shrink-0 rounded-xl border border-yellow-500/20 overflow-hidden"
          style={{ minWidth: '160px', background: 'rgba(255,215,0,0.02)' }}>
          <div className="px-3 py-2 border-b border-yellow-500/10" style={{ background: 'rgba(255,215,0,0.04)' }}>
            <div className="text-[10px] font-extrabold text-yellow-400">E{currentEpisode}</div>
            <div className="text-[10px] text-yellow-400/40 mt-0.5">Current</div>
          </div>
          <div className="p-3">
            <div className="text-[9px] font-bold text-white/20 uppercase tracking-wider mb-1">Picks submitted</div>
            <div className="text-[13px] font-extrabold text-white/30">
              {managerNetData.filter(m => m.hasCurrentPick).length}/{managers.length}
            </div>
            <div className="text-[9px] text-white/20 mt-1">Answer revealed after scoring</div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[120px]">#&nbsp;&nbsp;MANAGER</th>
              {scoredEpisodes.map(ep => {
                const stat = episodeStats.find(s => s.ep === ep)!;
                return (
                  <th key={ep} className="text-center p-2 text-white/25 font-bold text-[9px] tracking-wider min-w-[90px]">
                    <div className="text-white/40">E{ep}</div>
                    <div className="text-[8px] font-semibold text-teal-400/70 mt-0.5">{stat.correctName}</div>
                  </th>
                );
              })}
              {/* Current episode column */}
              <th className="text-center p-2 text-yellow-400/40 font-bold text-[9px] tracking-wider min-w-[80px]">
                <div>E{currentEpisode}</div>
                <div className="text-[8px] font-normal text-yellow-400/30 mt-0.5">pending</div>
              </th>
              <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider w-16">CORRECT</th>
              <th className="text-center p-3 text-white/50 font-extrabold text-[10px] tracking-wider w-16">NET PTS</th>
            </tr>
          </thead>
          <tbody>
            {managerNetData.map((m, i) => (
              <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                {/* Manager */}
                <td className="p-3 sticky left-0 bg-[#0d0d15] z-10">
                  <div className="flex items-center gap-2">
                    <span className="text-white/20 text-[10px] font-bold w-4 text-center flex-shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className="font-bold text-white text-[13px]">{m.name}</span>
                  </div>
                </td>

                {/* Scored episodes */}
                {scoredEpisodes.map(ep => {
                  const r = m.epResults[ep];
                  if (!r || r.guess === null) {
                    return <td key={ep} className="p-2 text-center"><span className="text-white/[0.08]">—</span></td>;
                  }
                  return (
                    <td key={ep} className="p-2 text-center">
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <span className="text-[11px] font-semibold"
                          style={{ color: r.correct ? '#1ABC9C' : 'rgba(255,255,255,0.35)' }}>
                          {r.guess}
                        </span>
                        <span className="text-[10px]">
                          {r.correct
                            ? <span className="text-teal-400 font-bold">✓ +3</span>
                            : <span className="text-white/20">✗</span>}
                        </span>
                      </div>
                    </td>
                  );
                })}

                {/* Current episode — show pick if submitted, else dash */}
                <td className="p-2 text-center">
                  {m.hasCurrentPick
                    ? <span className="text-[10px] font-semibold text-yellow-300/60">✓ picked</span>
                    : <span className="text-white/[0.08]">—</span>}
                </td>

                {/* Correct count */}
                <td className="p-3 text-center">
                  <span className="text-[13px] font-bold" style={{ color: m.correctCount > 0 ? '#1ABC9C' : 'rgba(255,255,255,0.2)' }}>
                    {m.correctCount}/{scoredEpisodes.length}
                  </span>
                </td>

                {/* NET pts */}
                <td className="p-3 text-center">
                  <span className="text-[15px] font-extrabold px-2 py-0.5 rounded-md"
                    style={{ color: m.totalPts > 0 ? '#fff' : 'rgba(255,255,255,0.2)', background: m.totalPts > 0 ? 'rgba(26,188,156,0.1)' : 'transparent' }}>
                    {m.totalPts || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Footer: correct % per episode */}
          <tfoot>
            <tr className="border-t border-white/[0.08]" style={{ background: 'rgba(26,188,156,0.02)' }}>
              <td className="p-3 sticky left-0 bg-[#0a0a0f] z-10">
                <span className="text-[10px] font-extrabold text-teal-400/50 tracking-wider">CORRECT</span>
              </td>
              {scoredEpisodes.map(ep => {
                const stat = episodeStats.find(s => s.ep === ep)!;
                return (
                  <td key={ep} className="p-2 text-center">
                    <span className="text-[10px] font-bold text-teal-400">
                      {stat.correctCount}/{stat.totalPicked}
                    </span>
                  </td>
                );
              })}
              <td />
              <td />
              <td className="p-3 text-center">
                <span className="text-[11px] font-bold text-teal-400">
                  {managerNetData.reduce((s, m) => s + m.totalPts, 0)} pts
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
