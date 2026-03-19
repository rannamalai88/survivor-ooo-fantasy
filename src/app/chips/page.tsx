'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, CHIPS as CHIP_DEFS } from '@/lib/constants';

interface Manager { id: string; name: string; draft_position: number; }
interface ChipsUsedRow { manager_id: string; chip_id: number; episode: number; target: string | null; }
interface ManagerScoreRow { manager_id: string; episode: number; chip_bonus: number; chip_played: number | null; }

export default function ChipsPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [chipsUsed, setChipsUsed] = useState<ChipsUsedRow[]>([]);
  const [managerScores, setManagerScores] = useState<ManagerScoreRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [seasonRes, managersRes, chipsRes, scoresRes] = await Promise.all([
      supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
      supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
      supabase.from('chips_used').select('manager_id, chip_id, episode, target').eq('season_id', SEASON_ID),
      supabase.from('manager_scores').select('manager_id, episode, chip_bonus, chip_played').eq('season_id', SEASON_ID).not('chip_played', 'is', null),
    ]);
    setCurrentEpisode(seasonRes.data?.current_episode || 2);
    setManagers(managersRes.data || []);
    setChipsUsed(chipsRes.data || []);
    setManagerScores(scoresRes.data || []);
    setLoading(false);
  }

  // League-wide chip usage summary
  const usageSummary = useMemo(() => {
    return CHIP_DEFS.map(chip => {
      const used = chipsUsed.filter(c => c.chip_id === chip.id);
      const totalPts = managerScores
        .filter(ms => ms.chip_played === chip.id)
        .reduce((sum, ms) => sum + (ms.chip_bonus || 0), 0);
      return { ...chip, timesUsed: used.length, totalPts };
    });
  }, [chipsUsed, managerScores]);

  // Per-manager chip data
  const managerChipData = useMemo(() => {
    return managers.map(m => {
      const chips = CHIP_DEFS.map(chip => {
        const used = chipsUsed.find(c => c.manager_id === m.id && c.chip_id === chip.id);
        const score = used
          ? managerScores.find(ms => ms.manager_id === m.id && ms.chip_played === chip.id)
          : null;
        const [wStart, wEnd] = chip.window.replace('Week ', '').split('-').map(Number);
        const isAvailable = !used && currentEpisode >= wStart && currentEpisode <= wEnd;
        const isUpcoming = !used && currentEpisode < wStart;
        return {
          chip,
          used: !!used,
          episode: used?.episode || null,
          target: used?.target || null,
          ptsEarned: score?.chip_bonus || 0,
          isAvailable,
          isUpcoming,
        };
      });
      const totalChipPts = chips.reduce((sum, c) => sum + c.ptsEarned, 0);
      const usedCount = chips.filter(c => c.used).length;
      return { ...m, chips, totalChipPts, usedCount };
    });
  }, [managers, chipsUsed, managerScores, currentEpisode]);

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4 animate-pulse">🎰</div>
      <p className="text-white/30 text-sm">Loading chips...</p>
    </div>
  );

  const STATUS_COLORS = {
    used:      { color: '#95a5a6', bg: 'rgba(149,165,166,0.08)' },
    available: { color: '#1ABC9C', bg: 'rgba(26,188,156,0.08)'  },
    upcoming:  { color: 'rgba(255,255,255,0.2)', bg: 'rgba(255,255,255,0.02)' },
    unused:    { color: 'rgba(255,255,255,0.1)', bg: 'transparent' },
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-white tracking-wider">🎰 Game Chips</h1>
        <p className="text-white/25 text-xs mt-1">Season 50 · Chip usage across all managers</p>
      </div>

      {/* League Summary Strip */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {usageSummary.map(chip => (
          <div key={chip.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 text-center">
            <div className="text-xl mb-1">{chip.icon}</div>
            <div className="text-[11px] font-bold text-white leading-tight mb-1">{chip.name}</div>
            <div className="text-[9px] font-semibold text-white/30 mb-2">{chip.window}</div>
            <div className="text-lg font-extrabold" style={{ color: chip.timesUsed > 0 ? '#FF6B35' : 'rgba(255,255,255,0.2)' }}>
              {chip.timesUsed}<span className="text-[10px] font-normal text-white/20">/12</span>
            </div>
            <div className="text-[9px] text-white/20 mt-0.5">used</div>
            {chip.totalPts > 0 && (
              <div className="text-[10px] font-bold text-purple-400 mt-1">+{chip.totalPts} pts total</div>
            )}
          </div>
        ))}
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[120px]">MANAGER</th>
              {CHIP_DEFS.map(chip => (
                <th key={chip.id} className="text-center p-2 text-white/35 font-bold text-[10px] tracking-wider min-w-[120px]">
                  <div>{chip.icon} {chip.name}</div>
                  <div className="text-[8px] font-normal text-white/20 mt-0.5">{chip.window}</div>
                </th>
              ))}
              <th className="text-center p-3 text-white/50 font-extrabold text-[10px] tracking-wider w-20">CHIP PTS</th>
            </tr>
          </thead>
          <tbody>
            {managerChipData.map(m => (
              <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                <td className="p-3 sticky left-0 bg-[#0d0d15] z-10">
                  <span className="font-bold text-white text-[13px]">{m.name}</span>
                </td>
                {m.chips.map(c => {
                  if (c.used) {
                    return (
                      <td key={c.chip.id} className="p-2 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg"
                          style={{ background: 'rgba(149,165,166,0.06)', border: '1px solid rgba(149,165,166,0.15)' }}>
                          <div className="text-[10px] font-bold text-white/50">E{c.episode}</div>
                          {c.target && <div className="text-[9px] text-white/30 max-w-[80px] truncate">{c.target}</div>}
                          {c.ptsEarned > 0
                            ? <div className="text-[11px] font-extrabold text-purple-400">+{c.ptsEarned} pts</div>
                            : <div className="text-[9px] text-white/20">0 pts</div>}
                        </div>
                      </td>
                    );
                  }
                  if (c.isAvailable) {
                    return (
                      <td key={c.chip.id} className="p-2 text-center">
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full"
                          style={{ background: 'rgba(26,188,156,0.08)', color: '#1ABC9C', border: '1px solid rgba(26,188,156,0.2)' }}>
                          AVAILABLE
                        </span>
                      </td>
                    );
                  }
                  if (c.isUpcoming) {
                    return (
                      <td key={c.chip.id} className="p-2 text-center">
                        <span className="text-[9px] text-white/15">upcoming</span>
                      </td>
                    );
                  }
                  // Window passed, not used
                  return (
                    <td key={c.chip.id} className="p-2 text-center">
                      <span className="text-[9px] text-red-400/30">unused</span>
                    </td>
                  );
                })}
                <td className="p-3 text-center">
                  {m.totalChipPts > 0
                    ? <span className="text-[14px] font-extrabold text-purple-400">{m.totalChipPts}</span>
                    : <span className="text-white/15">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chip descriptions */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {CHIP_DEFS.map(chip => (
          <div key={chip.id} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">{chip.icon}</span>
            <div>
              <div className="text-[12px] font-bold text-white">{chip.name}
                <span className="text-[9px] font-normal text-white/30 ml-2">{chip.window}</span>
              </div>
              <div className="text-[10px] text-white/30 mt-0.5">{chip.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
