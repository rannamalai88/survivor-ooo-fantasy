'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, CHIPS } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Survivor {
  id: string;
  name: string;
  tribe: string;
  is_active: boolean;
  elimination_order: number | null;
  eliminated_episode: number | null;
  has_idol: boolean;
}

interface Manager {
  id: string;
  name: string;
  draft_position: number;
}

interface ManagerScoreResult {
  managerId: string;
  fantasyPoints: number;
  captainBonus: number;
  chipBonus: number;
  votedOutBonus: number;
  captainLost: boolean;
  netCorrect: boolean;
}

// ============================================================
// Helper: write a human-readable entry to activity_log
// ============================================================
async function logActivity(type: string, message: string) {
  try {
    await supabase.from('activity_log').insert({
      season_id: SEASON_ID,
      type,
      message,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — never block the main action
  }
}

// ============================================================
// Main Component
// ============================================================
export default function AdminScoresPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [selectedEpisode, setSelectedEpisode] = useState(2);
  const [totalEpisodes, setTotalEpisodes] = useState(13);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);

  // Score entry
  const [fsgScores, setFsgScores] = useState<Record<string, number>>({});
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [votedOutBonuses, setVotedOutBonuses] = useState<Record<string, number>>({});
  const [existingScores, setExistingScores] = useState<boolean>(false);

  // NET answer
  const [netAnswerId, setNetAnswerId] = useState<string | null>(null);
  const [netTitle, setNetTitle] = useState('');

  // Calculated results
  const [calcResults, setCalcResults] = useState<ManagerScoreResult[] | null>(null);

  // FSG pull results
  const [pullStatus, setPullStatus] = useState<'idle' | 'pulling' | 'done' | 'error'>('idle');
  const [pullMessage, setPullMessage] = useState('');

  // Episode advancing
  const [advancing, setAdvancing] = useState(false);

  // Tab
  const [tab, setTab] = useState<'scores' | 'results' | 'net' | 'overrides' | 'season'>('scores');

  // ---- Load ----
  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadEpisodeData(selectedEpisode); }, [selectedEpisode]);

  async function loadData() {
    try {
      setLoading(true);

      const [seasonRes, survivorsRes, managersRes] = await Promise.all([
        supabase.from('seasons').select('current_episode, total_episodes').eq('id', SEASON_ID).single(),
        supabase.from('survivors').select('*').eq('season_id', SEASON_ID).order('name'),
        supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
      ]);

      const ep = seasonRes.data?.current_episode || 2;
      setCurrentEpisode(ep);
      setSelectedEpisode(ep);
      setTotalEpisodes(seasonRes.data?.total_episodes || 13);
      setSurvivors(survivorsRes.data || []);
      setManagers(managersRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadEpisodeData(episode: number) {
    const { data: scores } = await supabase
      .from('survivor_scores')
      .select('*')
      .eq('season_id', SEASON_ID)
      .eq('episode', episode);

    if (scores && scores.length > 0) {
      const fsg: Record<string, number> = {};
      const adj: Record<string, number> = {};
      const vo: Record<string, number> = {};
      scores.forEach((s: any) => {
        fsg[s.survivor_id] = s.fsg_points;
        adj[s.survivor_id] = s.manual_adjustment || 0;
        vo[s.survivor_id] = s.voted_out_bonus || 0;
      });
      setFsgScores(fsg);
      setAdjustments(adj);
      setVotedOutBonuses(vo);
      setExistingScores(true);
    } else {
      setFsgScores({});
      setAdjustments({});
      setVotedOutBonuses({});
      setExistingScores(false);
    }

    const { data: netAns } = await supabase
      .from('net_answers')
      .select('*')
      .eq('season_id', SEASON_ID)
      .eq('episode', episode)
      .maybeSingle();

    if (netAns) {
      setNetAnswerId(netAns.correct_survivor_id);
      setNetTitle(netAns.episode_title || '');
    } else {
      setNetAnswerId(null);
      setNetTitle('');
    }

    setCalcResults(null);
    setPullStatus('idle');
    setPullMessage('');
  }

  // ---- Pull Scores from FSG ----
  async function pullFromFSG() {
    try {
      setPullStatus('pulling');
      setError(null);
      const res = await fetch('/api/scoring/scrape-fsg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode: selectedEpisode, seasonId: SEASON_ID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPullStatus('done');
      const scoredCount = data.survivorsWithPoints || data.survivorsScored || 0;
      const elimCount = data.eliminations?.length || 0;
      const msg = `${scoredCount} survivors scored` +
        (elimCount ? `, ${elimCount} new elimination(s)` : '') +
        (data.warnings?.length ? ` | ${data.warnings.length} warning(s)` : '');
      setPullMessage(msg);

      await loadEpisodeData(selectedEpisode);
      setExistingScores(true);

      await logActivity('score', `FSG scores pulled for Episode ${selectedEpisode} — ${msg}`);

      setSuccess(`FSG scores pulled for Episode ${selectedEpisode}!`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setPullStatus('error');
      setError(err.message);
    }
  }

  // ---- Save manual adjustments ----
  async function saveAdjustments() {
    try {
      setSaving(true);
      setError(null);

      const changed: string[] = [];

      for (const survivorId of Object.keys(adjustments)) {
        const adj = adjustments[survivorId] || 0;
        const fsg = fsgScores[survivorId] || 0;
        const vo = votedOutBonuses[survivorId] || 0;

        await supabase
          .from('survivor_scores')
          .update({
            manual_adjustment: adj,
            final_points: fsg + adj + vo,
            updated_at: new Date().toISOString(),
          })
          .eq('season_id', SEASON_ID)
          .eq('survivor_id', survivorId)
          .eq('episode', selectedEpisode);

        if (adj !== 0) {
          const name = survivors.find(s => s.id === survivorId)?.name || survivorId;
          changed.push(`${name} ${adj > 0 ? '+' : ''}${adj}`);
        }
      }

      if (changed.length > 0) {
        await logActivity('score', `Manual adjustments for Episode ${selectedEpisode}: ${changed.join(', ')}`);
      }

      setSuccess('Adjustments saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Save NET answer ----
  async function saveNetAnswer() {
    if (!netAnswerId) return;
    try {
      setSaving(true);
      const res = await fetch('/api/scoring/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_net_answer',
          seasonId: SEASON_ID,
          episode: selectedEpisode,
          correctSurvivorId: netAnswerId,
          episodeTitle: netTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const survivorName = survivors.find(s => s.id === netAnswerId)?.name || '?';
      const titlePart = netTitle ? ` ("${netTitle}")` : '';
      await logActivity('net', `NET answer set for Episode ${selectedEpisode}${titlePart}: ${survivorName}`);

      setSuccess('NET answer saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Calculate & Save Manager Scores ----
  async function calculateManagerScores() {
    try {
      setSaving(true);
      setError(null);

      const res = await fetch('/api/scoring/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode: selectedEpisode, seasonId: SEASON_ID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCalcResults(data.results);
      setTab('results');

      if (data.results?.length > 0) {
        const top = [...data.results].sort((a: ManagerScoreResult, b: ManagerScoreResult) => b.fantasyPoints - a.fantasyPoints)[0];
        const topName = managers.find(m => m.id === top.managerId)?.name || '?';
        await logActivity('score', `Episode ${selectedEpisode} scores calculated — top scorer: ${topName} (${top.fantasyPoints} pts)`);
      } else {
        await logActivity('score', `Episode ${selectedEpisode} scores calculated`);
      }

      setSuccess(`Manager scores calculated for Episode ${selectedEpisode}! Totals and rankings updated.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Advance Episode ----
  async function advanceEpisode() {
    if (currentEpisode >= totalEpisodes) return;
    try {
      setAdvancing(true);
      setError(null);

      const nextEpisode = currentEpisode + 1;

      const { error: updateError } = await supabase
        .from('seasons')
        .update({ current_episode: nextEpisode })
        .eq('id', SEASON_ID);

      if (updateError) throw updateError;

      await logActivity('pick', `Season advanced to Episode ${nextEpisode} — picks now open`);

      setCurrentEpisode(nextEpisode);
      setSelectedEpisode(nextEpisode);
      setSuccess(`✅ Season advanced to Episode ${nextEpisode}! Managers can now submit picks for Ep. ${nextEpisode}.`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdvancing(false);
    }
  }

  // ---- Override: Idol Penalty ----
  const [idolSurvivorId, setIdolSurvivorId] = useState('');
  async function applyIdolPenalty() {
    if (!idolSurvivorId) return;
    try {
      setSaving(true);
      const res = await fetch('/api/scoring/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'idol_penalty',
          seasonId: SEASON_ID,
          survivorId: idolSurvivorId,
          episode: selectedEpisode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const survivorName = survivors.find(s => s.id === idolSurvivorId)?.name || '?';
      await logActivity('score', `Idol-in-pocket penalty (-5) applied to ${survivorName} for Episode ${selectedEpisode}`);

      setSuccess('Idol penalty (-5) applied!');
      setIdolSurvivorId('');
      await loadEpisodeData(selectedEpisode);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Override: Manager Score ----
  const [overrideMgrId, setOverrideMgrId] = useState('');
  const [overrideEp, setOverrideEp] = useState(2);
  const [overrideScore, setOverrideScore] = useState(0);
  async function applyManagerOverride() {
    if (!overrideMgrId) return;
    try {
      setSaving(true);
      const res = await fetch('/api/scoring/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'override_manager_score',
          seasonId: SEASON_ID,
          managerId: overrideMgrId,
          episode: overrideEp,
          newScore: overrideScore,
          reason: 'manual commissioner override',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const mgrName = managers.find(m => m.id === overrideMgrId)?.name || '?';
      await logActivity('score', `Score override: ${mgrName} Ep ${overrideEp} set to ${overrideScore} pts`);

      setSuccess('Manager score overridden!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔥</div>
        <p className="text-white/30 text-sm">Loading admin panel...</p>
      </div>
    );
  }

  const isFinale = currentEpisode >= totalEpisodes;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">⚙️ Score Management</h1>
          <p className="text-white/25 text-xs mt-1">Commissioner Panel — Pull FSG scores, review calculations, manage overrides</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30">Episode:</span>
          <select
            value={selectedEpisode}
            onChange={(e) => setSelectedEpisode(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white font-semibold"
          >
            {Array.from({ length: totalEpisodes - 1 }, (_, i) => i + 2).map((ep) => (
              <option key={ep} value={ep} className="bg-[#1a1a2e]">
                Episode {ep} {ep === currentEpisode ? '(current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-xs">
          ❌ {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 underline cursor-pointer bg-transparent border-none">dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-green-400 text-xs">
          ✅ {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-6 w-fit overflow-x-auto">
        {[
          { key: 'scores' as const,   label: '📊 Scores'   },
          { key: 'net' as const,      label: '💬 NET'       },
          { key: 'results' as const,  label: '🧮 Calculate' },
          { key: 'overrides' as const,label: '🔧 Overrides' },
          { key: 'season' as const,   label: '📅 Season'   },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer border-none whitespace-nowrap"
            style={{
              background: tab === t.key ? 'rgba(255,107,53,0.15)' : 'transparent',
              color: tab === t.key ? '#FF6B35' : 'rgba(255,255,255,0.35)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- TAB: Scores ---- */}
      {tab === 'scores' && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-sm font-bold text-white tracking-wider">
              Episode {selectedEpisode} — Survivor Scores
            </h2>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${existingScores ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'}`}>
                {existingScores ? 'SCORES LOADED' : 'NO SCORES YET'}
              </span>
            </div>
          </div>

          {/* Pull from FSG button */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              onClick={pullFromFSG}
              disabled={pullStatus === 'pulling'}
              className="px-5 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all cursor-pointer border-none"
              style={{
                background: pullStatus === 'done' ? 'rgba(26,188,156,0.15)' :
                  'linear-gradient(135deg, #FF6B35, #FF8F00)',
                color: pullStatus === 'done' ? '#1ABC9C' : '#fff',
                opacity: pullStatus === 'pulling' ? 0.5 : 1,
              }}
            >
              {pullStatus === 'pulling' ? '⏳ Pulling from FSG...' :
               pullStatus === 'done' ? '✓ Scores Pulled' :
               '🔄 Pull Scores from FSG'}
            </button>
            {pullMessage && <span className="text-xs text-emerald-400">{pullMessage}</span>}
          </div>

          <p className="text-xs text-white/30 mb-4">
            Pull auto-fills FSG points from episode recap. Use Adj column for manual corrections (e.g., -5 idol penalty).
          </p>

          {/* Score table */}
          <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-2.5 text-white/35 font-bold tracking-wider text-[10px]">SURVIVOR</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-16">TRIBE</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-16">STATUS</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-20">FSG PTS</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-16">V.O.</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-20">ADJ</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-16">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {survivors.map((s) => {
                  const fsg = fsgScores[s.id] || 0;
                  const adj = adjustments[s.id] || 0;
                  const vo = votedOutBonuses[s.id] || 0;
                  const total = fsg + adj + vo;
                  const isEliminated = !s.is_active || (s.eliminated_episode !== null && s.eliminated_episode <= selectedEpisode);
                  return (
                    <tr key={s.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-2.5">
                        <span className={`font-semibold ${isEliminated ? 'text-white/30 line-through' : 'text-white/70'}`}>{s.name}</span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[10px] font-bold" style={{ color: TRIBE_COLORS[s.tribe] || '#888' }}>
                          {s.tribe?.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        {isEliminated ? (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400">OUT</span>
                        ) : (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">ACTIVE</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-white/50 font-semibold">{fsg}</span>
                      </td>
                      <td className="p-2.5 text-center">
                        {vo > 0 ? (
                          <span className="text-emerald-400 font-bold">+{vo}</span>
                        ) : (
                          <span className="text-white/15">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          value={adj || ''}
                          onChange={(e) => setAdjustments({ ...adjustments, [s.id]: parseInt(e.target.value) || 0 })}
                          className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-center font-semibold text-xs"
                          style={{ color: adj < 0 ? '#E74C3C' : adj > 0 ? '#FFD54F' : 'rgba(255,255,255,0.3)' }}
                          placeholder="0"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="font-bold text-white">{total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={saveAdjustments}
              disabled={saving || !existingScores}
              className="px-5 py-2.5 rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer border-none"
              style={{
                background: existingScores ? 'linear-gradient(135deg, #FF6B35, #FF8F00)' : 'rgba(255,255,255,0.04)',
                color: existingScores ? '#fff' : 'rgba(255,255,255,0.15)',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? '⏳ Saving...' : '💾 Save Adjustments'}
            </button>
          </div>
        </div>
      )}

      {/* ---- TAB: NET Answer ---- */}
      {tab === 'net' && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-bold text-white tracking-wider mb-4">
            💬 Episode {selectedEpisode} — NET Answer
          </h2>
          <p className="text-xs text-white/30 mb-4">
            Set which survivor said the episode title. This auto-scores all managers&apos; NET picks when you Calculate.
          </p>

          <div className="mb-4">
            <label className="text-[10px] font-bold text-white/25 tracking-wider block mb-1.5">EPISODE TITLE</label>
            <input
              type="text"
              value={netTitle}
              onChange={(e) => setNetTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Enter the episode title..."
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/25 tracking-wider block mb-1.5">WHO SAID IT?</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-80 overflow-y-auto">
              {survivors.filter(s => s.is_active).map((s) => (
                <div
                  key={s.id}
                  onClick={() => setNetAnswerId(netAnswerId === s.id ? null : s.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: netAnswerId === s.id ? `${TRIBE_COLORS[s.tribe]}12` : 'rgba(255,255,255,0.02)',
                    border: netAnswerId === s.id ? `1px solid ${TRIBE_COLORS[s.tribe]}50` : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span className={`text-xs font-semibold ${netAnswerId === s.id ? 'text-white' : 'text-white/50'}`}>{s.name}</span>
                  {netAnswerId === s.id && <span className="text-xs">✓</span>}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={saveNetAnswer}
            disabled={!netAnswerId || saving}
            className="mt-4 px-6 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all cursor-pointer border-none"
            style={{
              background: netAnswerId ? 'linear-gradient(135deg, #9B59B6, #8E44AD)' : 'rgba(255,255,255,0.04)',
              color: netAnswerId ? '#fff' : 'rgba(255,255,255,0.15)',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? '⏳ Saving...' : '💾 Save NET Answer'}
          </button>
        </div>
      )}

      {/* ---- TAB: Calculate & Review ---- */}
      {tab === 'results' && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-bold text-white tracking-wider mb-4">
            🧮 Episode {selectedEpisode} — Calculate Manager Scores
          </h2>

          <p className="text-xs text-white/30 mb-4">
            Calculates: survivor FSG scores + captain 2x + chip effects + voted out bonus + NET.
            Also recalculates season totals and rankings. Make sure scores and NET answer are saved first.
          </p>

          <button
            onClick={calculateManagerScores}
            disabled={saving || !existingScores}
            className="px-6 py-3 rounded-lg font-bold text-sm tracking-wider transition-all cursor-pointer border-none mb-6"
            style={{
              background: existingScores ? 'linear-gradient(135deg, #FF6B35, #FF8F00)' : 'rgba(255,255,255,0.04)',
              color: existingScores ? '#fff' : 'rgba(255,255,255,0.15)',
              opacity: saving ? 0.5 : 1,
              boxShadow: existingScores ? '0 4px 20px rgba(255,107,53,0.3)' : 'none',
            }}
          >
            {saving ? '⏳ Calculating...' : '🔥 Calculate & Save Manager Scores'}
          </button>

          {!existingScores && (
            <p className="text-xs text-yellow-400/60 mb-4">Pull survivor scores first before calculating.</p>
          )}

          {calcResults && (
            <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="text-left p-2.5 text-white/35 font-bold text-[10px]">MANAGER</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">👑 CAPT</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">🎰 CHIP</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">V.O.</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">💬 NET</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">FANTASY</th>
                  </tr>
                </thead>
                <tbody>
                  {calcResults
                    .sort((a, b) => b.fantasyPoints - a.fantasyPoints)
                    .map((r) => {
                      const mgr = managers.find(m => m.id === r.managerId);
                      return (
                        <tr key={r.managerId} className="border-t border-white/[0.03]">
                          <td className="p-2.5 font-bold text-white">{mgr?.name || '?'}</td>
                          <td className="p-2.5 text-center">
                            <span className={r.captainBonus > 0 ? 'text-yellow-300 font-bold' : 'text-white/20'}>
                              {r.captainBonus > 0 ? `+${r.captainBonus}` : '—'}
                            </span>
                            {r.captainLost && <span className="text-red-400 text-[9px] ml-1">LOST</span>}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.chipBonus > 0 ? (
                              <span className="text-orange-400 font-bold">+{r.chipBonus}</span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.votedOutBonus > 0 ? (
                              <span className="text-emerald-400">+{r.votedOutBonus}</span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.netCorrect ? (
                              <span className="text-purple-400 font-bold">+3 ✓</span>
                            ) : (
                              <span className="text-white/20">✗</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="text-white font-extrabold text-sm px-2 py-0.5 rounded bg-white/5">
                              {r.fantasyPoints}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- TAB: Overrides ---- */}
      {tab === 'overrides' && (
        <div className="space-y-4">
          {/* Idol Penalty */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">🔥 Idol-in-Pocket Penalty (-5)</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={idolSurvivorId}
                onChange={(e) => setIdolSurvivorId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white"
              >
                <option value="">Select survivor...</option>
                {survivors.filter(s => !s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={applyIdolPenalty}
                disabled={!idolSurvivorId || saving}
                className="px-4 py-1.5 rounded-lg font-bold text-xs cursor-pointer border-none"
                style={{
                  background: idolSurvivorId ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.04)',
                  color: idolSurvivorId ? '#E74C3C' : 'rgba(255,255,255,0.15)',
                }}
              >
                Apply -5
              </button>
            </div>
          </div>

          {/* Manager Score Override */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">📝 Override Manager Fantasy Score</h3>
            <p className="text-xs text-white/25 mb-3">Directly set a manager&apos;s fantasy points for a specific episode. Use sparingly.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={overrideMgrId}
                onChange={(e) => setOverrideMgrId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white"
              >
                <option value="">Select manager...</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <select
                value={overrideEp}
                onChange={(e) => setOverrideEp(Number(e.target.value))}
                className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white"
              >
                {Array.from({ length: totalEpisodes - 1 }, (_, i) => i + 2).map(ep => (
                  <option key={ep} value={ep}>Ep. {ep}</option>
                ))}
              </select>
              <input
                type="number"
                value={overrideScore}
                onChange={(e) => setOverrideScore(parseInt(e.target.value) || 0)}
                className="w-20 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white text-center"
                placeholder="Score"
              />
              <button
                onClick={applyManagerOverride}
                disabled={!overrideMgrId || saving}
                className="px-4 py-1.5 rounded-lg font-bold text-xs cursor-pointer border-none"
                style={{
                  background: overrideMgrId ? 'linear-gradient(135deg, #FF6B35, #FF8F00)' : 'rgba(255,255,255,0.04)',
                  color: overrideMgrId ? '#fff' : 'rgba(255,255,255,0.15)',
                }}
              >
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- TAB: Season ---- */}
      {tab === 'season' && (
        <div className="space-y-4">
          {/* Current Episode Status */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-1">📅 Episode Progression</h3>
            <p className="text-xs text-white/25 mb-5">
              Advancing opens the picks page for the next episode so managers can submit captains, pool picks, and NET guesses.
            </p>

            {/* Episode tracker */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4">
                <span className="text-white/30 text-xs font-bold tracking-wider uppercase">Current Episode</span>
                <span
                  className="text-3xl font-extrabold ml-2"
                  style={{ background: 'linear-gradient(135deg, #FF6B35, #FFD54F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                >
                  {currentEpisode}
                </span>
                <span className="text-white/20 text-sm font-semibold">/ {totalEpisodes}</span>
              </div>

              <div className="text-white/15 text-lg">→</div>

              <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.04] rounded-xl px-5 py-4">
                <span className="text-white/20 text-xs font-bold tracking-wider uppercase">Next Episode</span>
                <span className="text-3xl font-extrabold text-white/20 ml-2">
                  {isFinale ? '🏁' : currentEpisode + 1}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex justify-between text-[10px] text-white/20 mb-1.5 font-semibold tracking-wider">
                <span>EPISODE 1</span>
                <span>FINALE (EP. {totalEpisodes})</span>
              </div>
              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${((currentEpisode - 1) / (totalEpisodes - 1)) * 100}%`,
                    background: 'linear-gradient(90deg, #FF6B35, #FFD54F)',
                  }}
                />
              </div>
              <div className="text-right text-[10px] text-white/20 mt-1">
                {Math.round(((currentEpisode - 1) / (totalEpisodes - 1)) * 100)}% through the season
              </div>
            </div>

            {/* Advance button */}
            {isFinale ? (
              <div className="flex items-center gap-3 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                <span className="text-2xl">🏁</span>
                <div>
                  <div className="text-yellow-400 font-bold text-sm">Season Complete</div>
                  <div className="text-white/25 text-xs mt-0.5">All episodes have aired. Time to run Quinfecta scoring!</div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4 flex-wrap">
                <div>
                  <button
                    onClick={advanceEpisode}
                    disabled={advancing}
                    className="px-8 py-3 rounded-xl font-extrabold text-sm tracking-wider transition-all cursor-pointer border-none"
                    style={{
                      background: advancing ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #FF6B35, #FF8F00)',
                      color: advancing ? 'rgba(255,255,255,0.2)' : '#fff',
                      boxShadow: advancing ? 'none' : '0 4px 20px rgba(255,107,53,0.35)',
                      opacity: advancing ? 0.7 : 1,
                    }}
                  >
                    {advancing ? '⏳ Advancing...' : `🔥 Advance to Episode ${currentEpisode + 1}`}
                  </button>
                  <p className="text-[10px] text-white/20 mt-2 max-w-xs">
                    This updates <code className="text-white/30">current_episode</code> in the database.
                    Managers will immediately see Episode {currentEpisode + 1} picks open.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Season info card */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">ℹ️ Season 50 Info</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Total Episodes', value: totalEpisodes },
                { label: 'Episodes Aired', value: currentEpisode - 1 },
                { label: 'Remaining', value: totalEpisodes - currentEpisode },
                { label: 'Managers', value: managers.length },
                { label: 'Active Survivors', value: survivors.filter(s => s.is_active).length },
                { label: 'Eliminated', value: survivors.filter(s => !s.is_active).length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                  <div className="text-[10px] text-white/25 font-bold tracking-wider uppercase mb-1">{label}</div>
                  <div className="text-xl font-extrabold text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
