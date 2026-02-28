'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface DynastyRow {
  manager_id: string;
  season_label: string;
  rank: number;
}

interface Manager {
  id: string;
  name: string;
}

// ============================================================
// Helpers
// ============================================================
const MANAGER_COLORS: Record<string, string> = {
  Alan: '#4FC3F7', Hari: '#81C784', Veena: '#BA68C8', Ramu: '#FF8A65',
  Stephanie: '#FFD54F', Alli: '#F06292', Amy: '#90A4AE', Alec: '#AED581',
  Cassie: '#4DD0E1', Michael: '#DCE775', Gisele: '#FFB74D', Samin: '#A1887F',
};

function rankHeat(rank: number | null): string {
  if (!rank) return 'transparent';
  if (rank <= 1) return 'rgba(255,215,0,0.2)';
  if (rank <= 3) return 'rgba(26,188,156,0.15)';
  if (rank <= 5) return 'rgba(26,188,156,0.06)';
  if (rank <= 7) return 'rgba(255,255,255,0.03)';
  if (rank <= 9) return 'rgba(255,107,53,0.08)';
  return 'rgba(231,76,60,0.15)';
}

function rankColor(rank: number | null): string {
  if (!rank) return 'rgba(255,255,255,0.1)';
  if (rank <= 1) return '#FFD700';
  if (rank <= 3) return '#1ABC9C';
  if (rank <= 5) return 'rgba(255,255,255,0.6)';
  if (rank <= 7) return 'rgba(255,255,255,0.35)';
  if (rank <= 9) return '#FF6B35';
  return '#E74C3C';
}

function avgHeat(avg: number | null): string {
  if (avg === null) return 'transparent';
  if (avg <= 3) return 'rgba(26,188,156,0.15)';
  if (avg <= 5) return 'rgba(26,188,156,0.06)';
  if (avg <= 7) return 'rgba(255,255,255,0.03)';
  return 'rgba(231,76,60,0.1)';
}

// ============================================================
// Component
// ============================================================
export default function DynastyPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [dynastyData, setDynastyData] = useState<DynastyRow[]>([]);
  const [showChart, setShowChart] = useState(true);
  const [hoveredManager, setHoveredManager] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [managersRes, dynastyRes] = await Promise.all([
        supabase.from('managers').select('id, name').eq('season_id', SEASON_ID).order('name'),
        supabase.from('dynasty_rankings').select('manager_id, season_label, rank').order('season_label'),
      ]);
      setManagers(managersRes.data || []);
      setDynastyData(dynastyRes.data || []);
    } catch (err) {
      console.error('Failed to load dynasty:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Computed ----
  const seasons = useMemo(() => {
    const s = [...new Set(dynastyData.map(d => d.season_label))].sort();
    return s;
  }, [dynastyData]);

  const managerStats = useMemo(() => {
    return managers.map(m => {
      const ranks: Record<string, number> = {};
      dynastyData.filter(d => d.manager_id === m.id).forEach(d => {
        ranks[d.season_label] = d.rank;
      });
      const rankValues = Object.values(ranks);
      const avg = rankValues.length > 0
        ? Math.round((rankValues.reduce((s, r) => s + r, 0) / rankValues.length) * 10) / 10
        : null;
      const wins = rankValues.filter(r => r === 1).length;
      return { ...m, ranks, avg, wins, seasonsPlayed: rankValues.length };
    }).sort((a, b) => {
      if (a.avg === null && b.avg === null) return 0;
      if (a.avg === null) return 1;
      if (b.avg === null) return -1;
      return a.avg - b.avg;
    });
  }, [managers, dynastyData]);

  // Chart dimensions
  const chartW = 600;
  const chartH = 280;
  const chartPad = { top: 30, right: 20, bottom: 30, left: 35 };
  const plotW = chartW - chartPad.left - chartPad.right;
  const plotH = chartH - chartPad.top - chartPad.bottom;

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">👑</div>
        <p className="text-white/30 text-sm">Loading dynasty data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">👑 Dynasty</h1>
          <p className="text-white/25 text-xs mt-1">Historical rankings across {seasons.length} seasons</p>
        </div>
        {seasons.length > 1 && (
          <button
            onClick={() => setShowChart(!showChart)}
            className="text-[10px] font-semibold px-3 py-1.5 rounded cursor-pointer border-none transition-all"
            style={{
              background: showChart ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.03)',
              color: showChart ? '#FF6B35' : 'rgba(255,255,255,0.3)',
            }}
          >
            {showChart ? 'Hide' : 'Show'} Chart
          </button>
        )}
      </div>

      {/* Line Chart */}
      {showChart && seasons.length > 1 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 mb-5 overflow-x-auto">
          <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} className="mx-auto block">
            {/* Grid lines */}
            {Array.from({ length: 12 }, (_, i) => i + 1).map(rank => {
              const y = chartPad.top + ((rank - 1) / 11) * plotH;
              return (
                <g key={rank}>
                  <line x1={chartPad.left} y1={y} x2={chartW - chartPad.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                  <text x={chartPad.left - 8} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.2)" fontSize={9} fontWeight={600}>
                    {rank}
                  </text>
                </g>
              );
            })}

            {/* Season labels */}
            {seasons.map((s, i) => {
              const x = chartPad.left + (seasons.length > 1 ? (i / (seasons.length - 1)) * plotW : plotW / 2);
              return (
                <text key={s} x={x} y={chartH - 8} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={10} fontWeight={700}>
                  {s}
                </text>
              );
            })}

            {/* Lines for each manager */}
            {managerStats.filter(m => m.seasonsPlayed > 0).map(m => {
              const color = MANAGER_COLORS[m.name] || '#fff';
              const isHovered = hoveredManager === m.name;
              const opacity = hoveredManager ? (isHovered ? 1 : 0.15) : 0.6;

              const points = seasons
                .map((s, i) => {
                  const rank = m.ranks[s];
                  if (!rank) return null;
                  const x = chartPad.left + (seasons.length > 1 ? (i / (seasons.length - 1)) * plotW : plotW / 2);
                  const y = chartPad.top + ((rank - 1) / 11) * plotH;
                  return { x, y, rank };
                })
                .filter(Boolean) as { x: number; y: number; rank: number }[];

              if (points.length < 2) return null;

              const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

              return (
                <g
                  key={m.id}
                  onMouseEnter={() => setHoveredManager(m.name)}
                  onMouseLeave={() => setHoveredManager(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <path d={pathD} fill="none" stroke={color} strokeWidth={isHovered ? 3 : 1.5} opacity={opacity} strokeLinejoin="round" />
                  {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={isHovered ? 5 : 3} fill={color} opacity={opacity} stroke="#0a0a0f" strokeWidth={1.5} />
                  ))}
                  {isHovered && points.length > 0 && (
                    <text x={points[points.length - 1].x + 8} y={points[points.length - 1].y + 4} fill={color} fontSize={10} fontWeight={700}>
                      {m.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {managerStats.filter(m => m.seasonsPlayed > 0).map(m => (
              <span
                key={m.id}
                className="text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer transition-all"
                style={{
                  background: hoveredManager === m.name ? `${MANAGER_COLORS[m.name] || '#fff'}22` : 'transparent',
                  color: MANAGER_COLORS[m.name] || '#fff',
                  opacity: hoveredManager ? (hoveredManager === m.name ? 1 : 0.3) : 0.7,
                }}
                onMouseEnter={() => setHoveredManager(m.name)}
                onMouseLeave={() => setHoveredManager(null)}
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rankings Table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[100px]">MANAGER</th>
              {seasons.map(s => (
                <th key={s} className="text-center p-2.5 text-white/25 font-bold text-[10px] tracking-wider min-w-[52px]">{s}</th>
              ))}
              <th className="text-center p-2.5 text-white/50 font-extrabold text-[10px] tracking-wider w-16">AVG</th>
              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-14">🏆</th>
            </tr>
          </thead>
          <tbody>
            {managerStats.map((m, mi) => (
              <tr
                key={m.id}
                className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-all cursor-pointer"
                onMouseEnter={() => setHoveredManager(m.name)}
                onMouseLeave={() => setHoveredManager(null)}
                style={{
                  background: hoveredManager === m.name ? `${MANAGER_COLORS[m.name] || '#fff'}08` : undefined,
                }}
              >
                <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: MANAGER_COLORS[m.name] || '#fff' }}
                    />
                    <span className="font-bold text-white text-[13px]">{m.name}</span>
                    {m.seasonsPlayed === 0 && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">NEW</span>
                    )}
                  </div>
                </td>
                {seasons.map(s => {
                  const rank = m.ranks[s];
                  return (
                    <td key={s} className="p-2 text-center">
                      {rank ? (
                        <span
                          className="text-[12px] font-bold px-2 py-0.5 rounded"
                          style={{ background: rankHeat(rank), color: rankColor(rank) }}
                        >
                          {rank === 1 ? '🥇' : rank}
                        </span>
                      ) : (
                        <span className="text-white/[0.06]">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="p-2.5 text-center">
                  {m.avg !== null ? (
                    <span
                      className="text-[13px] font-extrabold px-2 py-0.5 rounded"
                      style={{ background: avgHeat(m.avg), color: m.avg <= 3 ? '#1ABC9C' : m.avg <= 5 ? '#fff' : m.avg <= 7 ? 'rgba(255,255,255,0.5)' : '#E74C3C' }}
                    >
                      {m.avg}
                    </span>
                  ) : (
                    <span className="text-white/15">—</span>
                  )}
                </td>
                <td className="p-2.5 text-center">
                  {m.wins > 0 ? (
                    <span className="text-yellow-300 font-bold">{m.wins}</span>
                  ) : (
                    <span className="text-white/[0.06]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-white/20">
        Rankings based on final individual standings each season. Lower is better. Hover over names to highlight. S50 will update when the season concludes.
      </div>
    </div>
  );
}
