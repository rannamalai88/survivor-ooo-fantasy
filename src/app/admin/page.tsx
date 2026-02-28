'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, CHIPS } from '@/lib/constants';
import {
  calcAllManagerScoresForEpisode,
  calcSeasonTotals,
  type SurvivorScore,
  type TeamMember,
  type WeeklyPick,
  type EliminatedSurvivor,
  type ManagerEpisodeScore,
  type NetAnswer,
  type PoolStatusRecord,
  type QuinfectaSubmission,
} from '@/lib/scoring';

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
  const [fsgScores, setFsgScores] = useState<Record<string, number>>({}); // survivor_id → fsg_points
  const [adjustments, setAdjustments] = useState<Record<string, number>>({}); // survivor_id → manual_adjustment
  const [existingScores, setExistingScores] = useState<boolean>(false);

  // NET answer
  const [netAnswerId, setNetAnswerId] = useState<string | null>(null);
  const [netTitle, setNetTitle] = useState('');

  // Calculated results
  const [calcResults, setCalcResults] = useState<ManagerEpisodeScore[] | null>(null);

  // Tab
  const [tab, setTab] = useState<'scores' | 'results' | 'pool' | 'net'>('scores');

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
    // Load existing survivor scores for this episode
    const { data: scores } = await supabase
      .from('survivor_scores')
      .select('*')
      .eq('season_id', SEASON_ID)
      .eq('episode', episode);
    
    if (scores && scores.length > 0) {
      const fsg: Record<string, number> = {};
      const adj: Record<string, number> = {};
      scores.forEach((s: any) => {
        fsg[s.survivor_id] = s.fsg_points;
        adj[s.survivor_id] = s.manual_adjustment;
      });
      setFsgScores(fsg);
      setAdjustments(adj);
      setExistingScores(true);
    } else {
      setFsgScores({});
      setAdjustments({});
      setExistingScores(false);
    }

    // Load NET answer
    const { data: netAns } = await supabase
      .from('net_answers')
      .select('*')
      .eq('season_id', SEASON_ID)
      .eq('episode', episode)
      .single();
    
    if (netAns) {
      setNetAnswerId(netAns.correct_survivor_id);
      setNetTitle(netAns.episode_title || '');
    } else {
      setNetAnswerId(null);
      setNetTitle('');
    }

    setCalcResults(null);
  }

  // ---- Save Survivor Scores ----
  async function saveSurvivorScores() {
    try {
      setSaving(true);
      setError(null);

      const rows = survivors.map(s => ({
        season_id: SEASON_ID,
        survivor_id: s.id,
        episode: selectedEpisode,
        fsg_points: fsgScores[s.id] || 0,
        manual_adjustment: adjustments[s.id] || 0,
        final_points: (fsgScores[s.id] || 0) + (adjustments[s.id] || 0),
        updated_at: new Date().toISOString(),
      }));

      if (existingScores) {
        // Delete existing and re-insert (simpler than upsert for bulk)
        await supabase
          .from('survivor_scores')
          .delete()
          .eq('season_id', SEASON_ID)
          .eq('episode', selectedEpisode);
      }

      const { error: insertErr } = await supabase
        .from('survivor_scores')
        .insert(rows);
      
      if (insertErr) throw insertErr;

      setExistingScores(true);
      setSuccess('Survivor scores saved!');
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
      // Upsert
      await supabase
        .from('net_answers')
        .delete()
        .eq('season_id', SEASON_ID)
        .eq('episode', selectedEpisode);
      
      await supabase.from('net_answers').insert({
        season_id: SEASON_ID,
        episode: selectedEpisode,
        correct_survivor_id: netAnswerId,
        episode_title: netTitle,
      });

      setSuccess('NET answer saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Calculate & Save Manager Scores ----
  async function calculateAndSaveManagerScores() {
    try {
      setSaving(true);
      setError(null);

      // Fetch all data needed for calculation
      const [teamsRes, picksRes, scoresRes, elimRes, poolRes, netRes] = await Promise.all([
        supabase.from('teams').select('manager_id, survivor_id, is_active').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('*').eq('season_id', SEASON_ID).eq('episode', selectedEpisode),
        supabase.from('survivor_scores').select('*').eq('season_id', SEASON_ID).eq('episode', selectedEpisode),
        supabase.from('survivors').select('id, elimination_order, eliminated_episode, has_idol').eq('season_id', SEASON_ID).not('eliminated_episode', 'is', null),
        supabase.from('pool_status').select('manager_id, status, weeks_survived').eq('season_id', SEASON_ID),
        supabase.from('net_answers').select('*').eq('season_id', SEASON_ID).eq('episode', selectedEpisode).single(),
      ]);

      // Build data structures
      const allTeams = new Map<string, TeamMember[]>();
      (teamsRes.data || []).forEach((t: any) => {
        const arr = allTeams.get(t.manager_id) || [];
        arr.push({ survivor_id: t.survivor_id, is_active: t.is_active });
        allTeams.set(t.manager_id, arr);
      });

      const allPicks = new Map<string, WeeklyPick>();
      (picksRes.data || []).forEach((p: any) => {
        allPicks.set(p.manager_id, p);
      });

      const allScores: SurvivorScore[] = (scoresRes.data || []).map((s: any) => ({
        survivor_id: s.survivor_id,
        episode: s.episode,
        fsg_points: s.fsg_points,
        manual_adjustment: s.manual_adjustment,
        final_points: s.final_points,
      }));

      const eliminated: EliminatedSurvivor[] = (elimRes.data || []).map((e: any) => ({
        survivor_id: e.id,
        elimination_order: e.elimination_order || 0,
        eliminated_episode: e.eliminated_episode || 0,
        has_idol: e.has_idol || false,
      }));

      const netAnswer: NetAnswer | null = netRes.data ? {
        episode: netRes.data.episode,
        correct_survivor_id: netRes.data.correct_survivor_id,
      } : null;

      const poolStatuses = new Map<string, PoolStatusRecord>();
      (poolRes.data || []).forEach((p: any) => {
        poolStatuses.set(p.manager_id, {
          manager_id: p.manager_id,
          status: p.status,
          weeks_survived: p.weeks_survived || 0,
        });
      });

      // Calculate
      const results = calcAllManagerScoresForEpisode(
        selectedEpisode,
        managers,
        allTeams,
        allScores,
        allPicks,
        eliminated,
        netAnswer,
        poolStatuses,
        null, // soleSurvivorId — null until finale
      );

      setCalcResults(results);

      // Save to manager_scores
      await supabase
        .from('manager_scores')
        .delete()
        .eq('season_id', SEASON_ID)
        .eq('episode', selectedEpisode);

      const managerScoreRows = results.map(r => ({
        season_id: SEASON_ID,
        manager_id: r.manager_id,
        episode: r.episode,
        fantasy_points: r.fantasy_total,
        voted_out_bonus: r.voted_out_bonus,
        pool_weeks_survived: r.pool_weeks_survived,
        net_correct: r.net_correct,
        chip_effect_detail: r.chip_effect_detail || null,
        updated_at: new Date().toISOString(),
      }));

      const { error: msErr } = await supabase
        .from('manager_scores')
        .insert(managerScoreRows);
      if (msErr) throw msErr;

      // Now recalculate season totals
      await recalcSeasonTotals();

      // Log activity
      await supabase.from('activity_log').insert({
        season_id: SEASON_ID,
        type: 'score',
        message: `Episode ${selectedEpisode} scores calculated and saved`,
        metadata: { episode: selectedEpisode },
      });

      setSuccess('Manager scores calculated and saved!');
      setTab('results');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Recalculate Season Totals ----
  async function recalcSeasonTotals() {
    try {
      // Fetch ALL manager_scores across ALL episodes
      const { data: allMS } = await supabase
        .from('manager_scores')
        .select('*')
        .eq('season_id', SEASON_ID);

      const { data: poolData } = await supabase
        .from('pool_status')
        .select('manager_id, status, weeks_survived')
        .eq('season_id', SEASON_ID);

      const { data: quinfectaData } = await supabase
        .from('quinfecta_submissions')
        .select('*')
        .eq('season_id', SEASON_ID);

      // Build structures
      const allEpScores = (allMS || []).map((s: any) => ({
        manager_id: s.manager_id,
        episode: s.episode,
        base_team_points: 0,
        captain_bonus: 0,
        chip_effect_points: 0,
        chip_effect_detail: s.chip_effect_detail || '',
        voted_out_bonus: s.voted_out_bonus || 0,
        idol_penalty: 0,
        sole_survivor_bonus: 0,
        fantasy_total: s.fantasy_points,
        net_correct: s.net_correct,
        net_points: s.net_correct ? 3 : 0,
        pool_weeks_survived: s.pool_weeks_survived || 0,
      }));

      const poolStatuses = new Map<string, PoolStatusRecord>();
      (poolData || []).forEach((p: any) => {
        poolStatuses.set(p.manager_id, {
          manager_id: p.manager_id,
          status: p.status,
          weeks_survived: p.weeks_survived || 0,
        });
      });

      const quinfectas = new Map<string, QuinfectaSubmission>();
      (quinfectaData || []).forEach((q: any) => {
        quinfectas.set(q.manager_id, q);
      });

      const totals = calcSeasonTotals(
        managers,
        allEpScores,
        poolStatuses,
        totalEpisodes,
        quinfectas,
        null, // actualFinishOrder — null until finale
      );

      // Save to manager_totals
      await supabase
        .from('manager_totals')
        .delete()
        .eq('season_id', SEASON_ID);

      const totalRows = totals.map(t => ({
        season_id: SEASON_ID,
        manager_id: t.manager_id,
        fantasy_total: t.fantasy_total,
        pool_score: t.pool_score,
        quinfecta_score: t.quinfecta_score,
        net_total: t.net_total,
        grand_total: t.grand_total,
        rank: t.rank,
        updated_at: new Date().toISOString(),
      }));

      await supabase.from('manager_totals').insert(totalRows);
    } catch (err: any) {
      console.error('Failed to recalc totals:', err);
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">⚙️ Score Management</h1>
          <p className="text-white/25 text-xs mt-1">Commissioner Panel — Enter scores, review calculations, manage pool & NET</p>
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
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-6 w-fit">
        {[
          { key: 'scores' as const, label: '📊 Survivor Scores', desc: 'Enter FSG points' },
          { key: 'net' as const, label: '💬 NET Answer', desc: 'Set correct answer' },
          { key: 'results' as const, label: '🧮 Calculate', desc: 'Review & save' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer border-none"
            style={{
              background: tab === t.key ? 'rgba(255,107,53,0.15)' : 'transparent',
              color: tab === t.key ? '#FF6B35' : 'rgba(255,255,255,0.35)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- TAB: Survivor Scores Entry ---- */}
      {tab === 'scores' && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white tracking-wider">
              Episode {selectedEpisode} — Survivor Scores
            </h2>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${existingScores ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'}`}>
              {existingScores ? 'SAVED' : 'NOT YET SAVED'}
            </span>
          </div>

          <p className="text-xs text-white/30 mb-4">
            Enter FSG points for each survivor. Use the Adj column for manual adjustments (e.g., -5 idol penalty).
          </p>

          <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-2.5 text-white/35 font-bold tracking-wider text-[10px]">SURVIVOR</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-20">TRIBE</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-20">STATUS</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-24">FSG PTS</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-24">ADJ (+/-)</th>
                  <th className="text-center p-2.5 text-white/35 font-bold tracking-wider text-[10px] w-20">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {survivors.map((s) => {
                  const fsg = fsgScores[s.id] || 0;
                  const adj = adjustments[s.id] || 0;
                  const total = fsg + adj;
                  return (
                    <tr key={s.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-2.5">
                        <span className="font-semibold text-white/70">{s.name}</span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[10px] font-bold tracking-wider" style={{ color: TRIBE_COLORS[s.tribe] }}>
                          {s.tribe.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        {s.is_active ? (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">ACTIVE</span>
                        ) : (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400">OUT</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          value={fsg || ''}
                          onChange={(e) => setFsgScores({ ...fsgScores, [s.id]: parseInt(e.target.value) || 0 })}
                          className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-center text-white font-semibold text-xs"
                          placeholder="0"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          value={adj || ''}
                          onChange={(e) => setAdjustments({ ...adjustments, [s.id]: parseInt(e.target.value) || 0 })}
                          className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-center font-semibold text-xs"
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
              onClick={saveSurvivorScores}
              disabled={saving}
              className="px-6 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all cursor-pointer border-none"
              style={{
                background: 'linear-gradient(135deg, #FF6B35, #FF8F00)',
                color: '#fff',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? '⏳ Saving...' : '💾 Save Survivor Scores'}
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
            Set which survivor said the episode title. This auto-scores all managers&apos; NET picks.
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white tracking-wider">
              🧮 Episode {selectedEpisode} — Manager Score Calculation
            </h2>
          </div>

          <p className="text-xs text-white/30 mb-4">
            This will calculate manager scores using: survivor FSG scores + captain 2x + chip effects + voted out bonus + NET results. Make sure survivor scores and NET answer are saved first.
          </p>

          <button
            onClick={calculateAndSaveManagerScores}
            disabled={saving}
            className="px-6 py-3 rounded-lg font-bold text-sm tracking-wider transition-all cursor-pointer border-none mb-6"
            style={{
              background: 'linear-gradient(135deg, #FF6B35, #FF8F00)',
              color: '#fff',
              opacity: saving ? 0.5 : 1,
              boxShadow: '0 4px 20px rgba(255,107,53,0.3)',
            }}
          >
            {saving ? '⏳ Calculating...' : '🔥 Calculate & Save Manager Scores'}
          </button>

          {/* Results table */}
          {calcResults && (
            <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="text-left p-2.5 text-white/35 font-bold text-[10px]">MANAGER</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">BASE</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">👑 CAPT</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">🎰 CHIP</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">V.O.</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">💬 NET</th>
                    <th className="text-center p-2.5 text-white/35 font-bold text-[10px]">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {calcResults
                    .sort((a, b) => b.fantasy_total - a.fantasy_total)
                    .map((r) => {
                      const mgr = managers.find(m => m.id === r.manager_id);
                      return (
                        <tr key={r.manager_id} className="border-t border-white/[0.03]">
                          <td className="p-2.5 font-bold text-white">{mgr?.name || '?'}</td>
                          <td className="p-2.5 text-center text-white/50">{r.base_team_points}</td>
                          <td className="p-2.5 text-center">
                            <span className={r.captain_bonus > 0 ? 'text-yellow-300 font-bold' : 'text-white/20'}>
                              +{r.captain_bonus}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            {r.chip_effect_points > 0 ? (
                              <span className="text-orange-400 font-bold" title={r.chip_effect_detail}>
                                +{r.chip_effect_points}
                              </span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.voted_out_bonus > 0 ? (
                              <span className="text-emerald-400">+{r.voted_out_bonus}</span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.net_correct ? (
                              <span className="text-purple-400 font-bold">+3 ✓</span>
                            ) : (
                              <span className="text-white/20">✗</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="text-white font-extrabold text-sm px-2 py-0.5 rounded bg-white/5">
                              {r.fantasy_total + r.net_points}
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
    </div>
  );
}
