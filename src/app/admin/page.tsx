'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import AuthGuard from '@/components/auth/AuthGuard';
import { SEASON_ID, SEASON_NUMBER, TRIBE_COLORS } from '@/lib/constants';
import { formatRank } from '@/lib/utils';

// ============================================================
// Types
// ============================================================
interface Survivor {
  id: string; name: string; tribe: string; is_active: boolean; is_playable: boolean;
  elimination_order: number | null; eliminated_episode: number | null; photo_url: string | null;
}
interface Manager { id: string; name: string }
interface StoredOutcome {
  reward_happened: boolean; immunity_happened: boolean;
  reward_winners: string[]; immunity_winners: string[]; departures: string[]; mop_winners: string[];
  computed_at: string;
}
interface PullResult {
  success: boolean; error?: string; blocking?: string[];
  actions?: number; eliminations?: { name: string; kind: string; place: number | null }[];
  tribeChanges?: string[]; unknownActions?: string[]; warnings?: string[];
  availableEpisodes?: number[];
}
interface CalcResult {
  managerId?: string; name: string; submitted?: boolean; cardTotal: number; chip: string | null; chipNote: string | null;
  opponent: string | null; h2hPoints: number | null; h2hNote: string | null; shadowBeat: number;
}
interface CalcResponse { success: boolean; dryRun?: boolean; titleAnswerRecorded: boolean; results: CalcResult[]; error?: string }

const fsgRecapUrl = (ep: number) => `https://www.fantasysurvivorgame.com/episode-recap/season/${SEASON_NUMBER}#episode${ep}`;

async function logActivity(type: string, message: string) {
  try { await supabase.from('activity_log').insert({ season_id: SEASON_ID, type, message }); } catch { /* non-fatal */ }
}

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ============================================================
// Small UI pieces
// ============================================================
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 mb-4">{children}</div>
);
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-sm font-bold text-white tracking-wider mb-3">{children}</h2>
);
const Btn = ({ onClick, disabled, children, variant = 'primary' }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: 'primary' | 'secondary' }) => (
  <button onClick={onClick} disabled={disabled}
    className="px-5 py-2.5 rounded-lg font-bold text-xs tracking-wider transition-all border-none"
    style={{
      background: variant === 'primary' ? 'linear-gradient(135deg, #FF6B35, #FF8F00)' : 'rgba(5,169,230,0.12)',
      color: variant === 'primary' ? '#fff' : '#3fc0f0',
      border: variant === 'secondary' ? '1px solid rgba(5,169,230,0.35)' : 'none',
      opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
    }}>
    {children}
  </button>
);
const IssueList = ({ title, items, tone }: { title: string; items: string[]; tone: 'error' | 'warn' }) => items.length === 0 ? null : (
  <div className="rounded-lg p-3 mb-3 text-xs" style={{
    background: tone === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(255,107,53,0.07)',
    border: `1px solid ${tone === 'error' ? 'rgba(248,113,113,0.35)' : 'rgba(255,107,53,0.3)'}`,
    color: tone === 'error' ? '#f87171' : '#ff9a6b',
  }}>
    <div className="font-bold mb-1">{title}</div>
    <ul className="list-disc pl-5 space-y-0.5 text-white/75">{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
  </div>
);

// ============================================================
// Main
// ============================================================
function AdminContent() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [selectedEpisode, setSelectedEpisode] = useState(2);
  const [totalEpisodes, setTotalEpisodes] = useState(13);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);

  // Selected-episode data
  const [fsgScores, setFsgScores] = useState<Record<string, number>>({});
  const [actionsBy, setActionsBy] = useState<Record<string, { action: string; points: number }[]>>({});
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [hasScores, setHasScores] = useState(false);
  const [outcome, setOutcome] = useState<StoredOutcome | null>(null);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [episodeStatus, setEpisodeStatus] = useState<string | null>(null);

  // Title answer
  const [titleAnswerId, setTitleAnswerId] = useState<string | null>(null);
  const [titleText, setTitleText] = useState('');
  const [titleSaved, setTitleSaved] = useState(false);

  // Action results
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [calcResult, setCalcResult] = useState<CalcResponse | null>(null);
  const [selfTest, setSelfTest] = useState<{ success: boolean; passed: number; total: number; checks: { name: string; pass: boolean; detail?: string }[] } | null>(null);

  // Season tab
  const [nextEpisodeTitle, setNextEpisodeTitle] = useState('');

  const [tab, setTab] = useState<'results' | 'title' | 'calculate' | 'season' | 'tools'>('results');

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadEpisodeData(selectedEpisode); }, [selectedEpisode]);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, survivorsRes, managersRes] = await Promise.all([
        supabase.from('seasons').select('current_episode, total_episodes, next_episode_title').eq('id', SEASON_ID).single(),
        supabase.from('survivors').select('id, name, tribe, is_active, is_playable, elimination_order, eliminated_episode, photo_url').eq('season_id', SEASON_ID).order('name'),
        supabase.from('managers').select('id, name').eq('season_id', SEASON_ID).order('name'),
      ]);
      const ep = seasonRes.data?.current_episode || 2;
      setCurrentEpisode(ep);
      setSelectedEpisode(ep);
      setTotalEpisodes(seasonRes.data?.total_episodes || 13);
      setNextEpisodeTitle(seasonRes.data?.next_episode_title || '');
      setSurvivors(survivorsRes.data || []);
      setManagers(managersRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadEpisodeData(episode: number) {
    const [scoresRes, outcomeRes, netRes, picksRes, epRes] = await Promise.all([
      supabase.from('survivor_scores').select('survivor_id, fsg_points, manual_adjustment, scored_actions').eq('season_id', SEASON_ID).eq('episode', episode),
      supabase.from('episode_outcomes').select('*').eq('season_id', SEASON_ID).eq('episode', episode).maybeSingle(),
      supabase.from('net_answers').select('correct_survivor_id, episode_title').eq('season_id', SEASON_ID).eq('episode', episode).maybeSingle(),
      supabase.from('weekly_picks').select('manager_id').eq('season_id', SEASON_ID).eq('episode', episode),
      supabase.from('episodes').select('status').eq('season_id', SEASON_ID).eq('number', episode).maybeSingle(),
    ]);
    const scores = scoresRes.data || [];
    setFsgScores(Object.fromEntries(scores.map((s: any) => [s.survivor_id, s.fsg_points])));
    setAdjustments(Object.fromEntries(scores.map((s: any) => [s.survivor_id, s.manual_adjustment || 0])));
    setActionsBy(Object.fromEntries(scores.map((s: any) => [s.survivor_id, s.scored_actions?.actions || []])));
    setHasScores(scores.length > 0);
    setOutcome(outcomeRes.data as StoredOutcome | null);
    setTitleAnswerId(netRes.data?.correct_survivor_id ?? null);
    setTitleText(netRes.data?.episode_title ?? '');
    setTitleSaved(!!netRes.data);
    setSubmittedIds((picksRes.data || []).map((p: any) => p.manager_id));
    setEpisodeStatus(epRes.data?.status ?? null);
    setCalcResult(null);
    setPullResult(null);
  }

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); }

  // ---- Pull from FSG ----
  async function pullFromFSG() {
    setBusy('pull'); setError(null);
    const { ok, data } = await postJSON('/api/scoring/scrape-fsg', { episode: selectedEpisode, seasonId: SEASON_ID });
    setPullResult(data);
    if (!ok) setError(data.error || 'FSG pull failed');
    else {
      flash(`FSG results pulled for episode ${selectedEpisode}.`);
      await loadData();
      await loadEpisodeData(selectedEpisode);
      setPullResult(data);
    }
    setBusy(null);
  }

  // ---- Save manual adjustments ----
  async function saveAdjustments() {
    setBusy('adj'); setError(null);
    try {
      const changed: string[] = [];
      for (const s of survivors.filter(x => x.is_playable)) {
        const adj = adjustments[s.id] || 0;
        const fsg = fsgScores[s.id] || 0;
        const { error } = await supabase.from('survivor_scores')
          .update({ manual_adjustment: adj, final_points: fsg + adj, updated_at: new Date().toISOString() })
          .eq('season_id', SEASON_ID).eq('survivor_id', s.id).eq('episode', selectedEpisode);
        if (error) throw error;
        if (adj !== 0) changed.push(`${s.name} ${adj > 0 ? '+' : ''}${adj}`);
      }
      if (changed.length) await logActivity('admin', `Manual adjustments for episode ${selectedEpisode}: ${changed.join(', ')}`);
      flash('Adjustments saved. Re-run Calculate for them to count.');
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(null);
  }

  // ---- Title answer ----
  async function saveTitleAnswer() {
    if (!titleAnswerId) return;
    setBusy('title'); setError(null);
    const { ok, data } = await postJSON('/api/scoring/override', {
      action: 'set_net_answer', seasonId: SEASON_ID, episode: selectedEpisode, correctSurvivorId: titleAnswerId, episodeTitle: titleText,
    });
    if (!ok) setError(data.error || 'Could not save title answer');
    else { setTitleSaved(true); flash('Title answer saved. Re-run Calculate for it to count.'); }
    setBusy(null);
  }

  // ---- Calculate ----
  async function calculate(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'calc'); setError(null);
    const { ok, data } = await postJSON('/api/scoring/calculate', { episode: selectedEpisode, seasonId: SEASON_ID, dryRun });
    if (!ok) setError(data.error || 'Calculate failed');
    else {
      setCalcResult(data);
      if (!dryRun) {
        flash(`Episode ${selectedEpisode} scored. Standings, H2H and Pool updated.`);
        setEpisodeStatus('scored');
      }
    }
    setBusy(null);
  }

  // ---- Season ----
  async function saveNextEpisodeTitle() {
    setBusy('nextTitle');
    const { error } = await supabase.from('seasons').update({ next_episode_title: nextEpisodeTitle.trim() || null }).eq('id', SEASON_ID);
    if (error) setError(error.message);
    else { await logActivity('admin', `Episode ${currentEpisode} title set: "${nextEpisodeTitle.trim()}"`); flash('Episode title saved.'); }
    setBusy(null);
  }

  async function advanceEpisode() {
    if (currentEpisode >= totalEpisodes) return;
    const next = currentEpisode + 1;
    setError(null);
    try {
      // Auto-drown active pool managers who missed their pool pick. The Pool starts
      // at E2, so there is nothing to check when leaving E1.
      let missed: { id: string; name: string }[] = [];
      if (currentEpisode >= 2) {
        const { data: activePool } = await supabase.from('pool_status').select('manager_id').eq('season_id', SEASON_ID).eq('status', 'active');
        const activeIds = (activePool || []).map((r: any) => r.manager_id);
        if (activeIds.length) {
          const { data: submitted } = await supabase.from('weekly_picks').select('manager_id')
            .eq('season_id', SEASON_ID).eq('episode', currentEpisode).not('pool_pick_id', 'is', null).in('manager_id', activeIds);
          const got = new Set((submitted || []).map((r: any) => r.manager_id));
          missed = activeIds.filter((id: string) => !got.has(id)).map((id: string) => ({ id, name: managers.find(m => m.id === id)?.name || id }));
        }
      }

      const warning = missed.length
        ? `\n\nThese managers made no pool pick for episode ${currentEpisode} and will be DROWNED:\n  ${missed.map(m => m.name).join(', ')}`
        : '\n\nNobody will be drowned.';
      if (!window.confirm(`Advance to episode ${next}? Picks for episode ${next} open immediately.${warning}`)) return;

      setBusy('advance');
      if (missed.length) {
        const { error } = await supabase.from('pool_status').update({ status: 'drowned' })
          .eq('season_id', SEASON_ID).in('manager_id', missed.map(m => m.id));
        if (error) throw error;
        await logActivity('pool', `Auto-drowned for missing episode ${currentEpisode} pool pick: ${missed.map(m => m.name).join(', ')}`);
      }
      const { error } = await supabase.from('seasons').update({ current_episode: next }).eq('id', SEASON_ID);
      if (error) throw error;
      await logActivity('pick', `Season advanced to episode ${next} — picks now open`);
      setCurrentEpisode(next);
      setSelectedEpisode(next);
      flash(`Advanced to episode ${next}. Managers can now submit episode ${next} picks.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // ---- Tools ----
  async function runSelfTest() {
    setBusy('selftest'); setError(null);
    const res = await fetch('/api/scoring/preview-fsg?selftest=1');
    const data = await res.json().catch(() => null);
    if (!data?.checks) setError(data?.error || 'Self-test failed to run');
    setSelfTest(data?.checks ? data : null);
    setBusy(null);
  }

  // ---- Derived ----
  const nameOf = (id: string) => survivors.find(s => s.id === id)?.name || '?';
  const playable = useMemo(() => survivors.filter(s => s.is_playable), [survivors]);
  const missingCards = managers.filter(m => !submittedIds.includes(m.id));

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center"><div className="text-4xl mb-4 animate-pulse">🔥</div><p className="text-white/30 text-sm">Loading admin panel...</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">⚙️ Commissioner</h1>
          <p className="text-white/35 text-xs mt-1">Current episode: {currentEpisode} · Weekly flow: Pull from FSG → Title answer → Preview → Calculate → Advance</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Episode:</span>
          <select value={selectedEpisode} onChange={(e) => setSelectedEpisode(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white font-semibold">
            {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map(ep => (
              <option key={ep} value={ep} className="bg-[#1a1a2e]">Episode {ep}{ep === currentEpisode ? ' (current)' : ''}{ep === 1 ? ' — not scored' : ''}</option>
            ))}
          </select>
          {episodeStatus && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/50 uppercase tracking-wider">{episodeStatus}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-xs">
          ❌ {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 underline cursor-pointer bg-transparent border-none">dismiss</button>
        </div>
      )}
      {success && <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-green-400 text-xs">✅ {success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-6 w-fit max-w-full overflow-x-auto">
        {[
          { key: 'results' as const, label: '1 · FSG Results' },
          { key: 'title' as const, label: '2 · Title Answer' },
          { key: 'calculate' as const, label: '3 · Calculate' },
          { key: 'season' as const, label: '4 · Advance' },
          { key: 'tools' as const, label: '🔧 Tools' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer border-none whitespace-nowrap"
            style={{ background: tab === t.key ? 'rgba(255,107,53,0.15)' : 'transparent', color: tab === t.key ? '#FF6B35' : 'rgba(255,255,255,0.45)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- 1. FSG RESULTS ---- */}
      {tab === 'results' && (<>
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <H2>Episode {selectedEpisode} — FSG results</H2>
            <a href={fsgRecapUrl(selectedEpisode)} target="_blank" rel="noreferrer" className="text-xs text-[#3fc0f0] underline">Open FSG recap ↗</a>
          </div>
          <p className="text-xs text-white/40 mb-4">Pull reads FSG&apos;s recap page for this episode. Re-pulling is safe — it replaces the episode&apos;s results. FSG usually updates the morning after an episode airs.</p>
          <Btn onClick={pullFromFSG} disabled={busy === 'pull'}>{busy === 'pull' ? '⏳ Pulling from FSG...' : '🔄 Pull from FSG'}</Btn>

          {pullResult && (
            <div className="mt-4">
              <IssueList title="Nothing was written — fix these first" items={pullResult.blocking || []} tone="error" />
              {!!pullResult.unknownActions?.length && (
                <IssueList title="New FSG actions — scored as Other. Confirm none of these is a challenge win." items={pullResult.unknownActions} tone="warn" />
              )}
              <IssueList title="Warnings — results were saved, but check these" items={(pullResult.warnings || []).filter(w => !w.includes('unknown FSG action'))} tone="warn" />
              {pullResult.success && (
                <div className="text-xs text-white/60 space-y-1">
                  <div>✓ {pullResult.actions} actions saved.</div>
                  {!!pullResult.eliminations?.length && <div>✓ Out of the game: {pullResult.eliminations.map(e => `${e.name} (${e.kind}${e.place ? `, ${formatRank(e.place)} place` : ''})`).join(', ')}</div>}
                  {!!pullResult.tribeChanges?.length && <div>✓ Tribe changes: {pullResult.tribeChanges.join(', ')}</div>}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <H2>What the scoring engine sees</H2>
          {!outcome ? <p className="text-xs text-white/40">No results stored for episode {selectedEpisode} yet. Pull from FSG first.</p> : (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {[
                { label: '🍖 Reward winners', value: outcome.reward_happened ? outcome.reward_winners.map(nameOf).join(', ') : 'No reward challenge (Reward slot scores base points only)' },
                { label: '🗿 Immunity winners', value: outcome.immunity_happened ? outcome.immunity_winners.map(nameOf).join(', ') : 'No immunity challenge' },
                { label: '🔥 Left the game', value: outcome.departures.length ? outcome.departures.map(nameOf).join(', ') : 'Nobody' },
                { label: '📈 Most Other Points', value: outcome.mop_winners.length ? outcome.mop_winners.map(nameOf).join(', ') : 'Nobody scored Other points' },
              ].map(r => (
                <div key={r.label} className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-[10px] font-bold tracking-wider text-white/40 mb-1">{r.label}</div>
                  <div className="text-white/85">{r.value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <H2>Survivor points &amp; adjustments</H2>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${hasScores ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}>{hasScores ? 'LOADED' : 'NO SCORES YET'}</span>
          </div>
          <p className="text-xs text-white/40 mb-3">Adjustments are added to a survivor&apos;s slot total and are <b>never multiplied</b>. Save, then re-run Calculate.</p>
          <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  {['SURVIVOR', 'TRIBE', 'FSG ACTIONS', 'FSG', 'ADJ', 'TOTAL'].map(h => <th key={h} className="text-left p-2.5 text-white/40 font-bold tracking-wider text-[10px]">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {playable.map(s => {
                  const fsg = fsgScores[s.id] || 0;
                  const adj = adjustments[s.id] || 0;
                  const out = s.eliminated_episode !== null && s.eliminated_episode <= selectedEpisode;
                  return (
                    <tr key={s.id} className="border-t border-white/[0.03] hover:bg-white/[0.02] align-top">
                      <td className="p-2.5"><span className={`font-semibold ${out ? 'text-white/35 line-through' : 'text-white/80'}`}>{s.name}</span></td>
                      <td className="p-2.5"><span className="text-[10px] font-bold" style={{ color: TRIBE_COLORS[s.tribe] || '#9aa0a8' }}>{s.tribe?.toUpperCase()}</span></td>
                      <td className="p-2.5 text-white/50">{(actionsBy[s.id] || []).map(a => `${a.action} (${a.points})`).join(' · ') || '—'}</td>
                      <td className="p-2.5 text-white/70 font-semibold">{fsg}</td>
                      <td className="p-2.5">
                        <input type="number" value={adj || ''} placeholder="0"
                          onChange={(e) => setAdjustments({ ...adjustments, [s.id]: parseInt(e.target.value) || 0 })}
                          className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-center font-semibold text-xs"
                          style={{ color: adj < 0 ? '#f87171' : adj > 0 ? '#4ade80' : 'rgba(255,255,255,0.4)' }} />
                      </td>
                      <td className="p-2.5 font-bold text-white">{fsg + adj}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4"><Btn onClick={saveAdjustments} disabled={busy === 'adj' || !hasScores}>{busy === 'adj' ? '⏳ Saving...' : '💾 Save adjustments'}</Btn></div>
        </Card>
      </>)}

      {/* ---- 2. TITLE ANSWER ---- */}
      {tab === 'title' && (
        <Card>
          <H2>💬 Episode {selectedEpisode} — who said the title?</H2>
          <p className="text-xs text-white/40 mb-4">Worth +1 to every manager whose Title pick matches. Jeff is an option.</p>
          <input type="text" value={titleText} onChange={(e) => setTitleText(e.target.value)} placeholder="Episode title (optional)"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 mb-4" />
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
            {[...survivors.filter(s => !s.is_playable), ...playable].map(s => {
              const on = titleAnswerId === s.id;
              return (
                <button key={s.id} onClick={() => setTitleAnswerId(s.id)}
                  className="text-left px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ background: on ? 'rgba(5,169,230,0.15)' : 'rgba(255,255,255,0.03)', border: on ? '1px solid rgba(5,169,230,0.5)' : '1px solid rgba(255,255,255,0.06)', color: on ? '#3fc0f0' : 'rgba(255,255,255,0.7)' }}>
                  {s.name}<span className="block text-[9px] opacity-60">{s.tribe}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Btn onClick={saveTitleAnswer} disabled={!titleAnswerId || busy === 'title'}>{busy === 'title' ? '⏳ Saving...' : '💾 Save title answer'}</Btn>
            {titleSaved && <span className="text-xs text-green-400">Saved: {titleAnswerId ? nameOf(titleAnswerId) : '—'}</span>}
          </div>
        </Card>
      )}

      {/* ---- 3. CALCULATE ---- */}
      {tab === 'calculate' && (<>
        <Card>
          <H2>🧮 Score episode {selectedEpisode}</H2>
          {selectedEpisode === 1 && <IssueList title="Episode 1 is parsed but never scored." items={['There were no picks for the premiere.']} tone="warn" />}
          <p className="text-xs text-white/40 mb-2"><b>Preview</b> shows every card&apos;s score and fixture result without saving anything. <b>Calculate &amp; save</b> writes scores, H2H, Pool and standings. Both are safe to repeat.</p>
          <div className="text-xs text-white/60 mb-4 space-y-1">
            <div>{outcome ? '✓' : '✗'} FSG results {outcome ? 'pulled' : <span className="text-red-400">not pulled yet</span>}</div>
            <div>{titleSaved ? '✓' : '○'} Title answer {titleSaved ? `recorded (${titleAnswerId ? nameOf(titleAnswerId) : 'nobody'})` : 'not recorded — Title slots will score 0 until you add it and re-run'}</div>
            <div>✓ {submittedIds.length} of {managers.length} cards submitted{missingCards.length ? ` — no card: ${missingCards.map(m => m.name).join(', ')}` : ''}</div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Btn variant="secondary" onClick={() => calculate(true)} disabled={!!busy || !outcome}>{busy === 'preview' ? '⏳ Previewing...' : '👀 Preview (no save)'}</Btn>
            <Btn onClick={() => calculate(false)} disabled={!!busy || !outcome || selectedEpisode === 1}>{busy === 'calc' ? '⏳ Calculating...' : '✅ Calculate & save'}</Btn>
          </div>
        </Card>

        {calcResult && (
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <H2>{calcResult.dryRun ? 'Preview — nothing saved' : 'Saved results'}</H2>
              {!calcResult.titleAnswerRecorded && <span className="text-[10px] font-bold text-[#ff9a6b]">Title answer not recorded</span>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white/[0.03]">
                    {['MANAGER', 'CARD', 'CHIP', 'VS', 'H2H', 'BEAT'].map(h => <th key={h} className="text-left p-2.5 text-white/40 font-bold tracking-wider text-[10px]">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {calcResult.results.map(r => {
                    const mgr = managers.find(m => m.name === r.name);
                    return (
                      <tr key={r.name} className="border-t border-white/[0.03]">
                        <td className="p-2.5 font-semibold text-white/85">
                          {mgr && !calcResult.dryRun ? <Link href={`/breakdown/${mgr.id}/${selectedEpisode}`} className="underline decoration-white/20">{r.name}</Link> : r.name}
                        </td>
                        <td className="p-2.5 font-bold" style={{ color: r.cardTotal < 0 ? '#f87171' : '#fff' }}>{r.cardTotal}</td>
                        <td className="p-2.5 text-white/60">{r.chip || '—'}{r.chipNote && <div className="text-[#ff9a6b] text-[10px]">{r.chipNote}</div>}</td>
                        <td className="p-2.5 text-white/60">{r.opponent || '—'}</td>
                        <td className="p-2.5 text-white/70">{r.h2hPoints ?? '—'}{r.h2hNote && <div className="text-white/40 text-[10px]">{r.h2hNote}</div>}</td>
                        <td className="p-2.5 text-white/60">{r.shadowBeat}/{managers.length - 1}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </>)}

      {/* ---- 4. ADVANCE ---- */}
      {tab === 'season' && (<>
        <Card>
          <H2>📅 Season progress</H2>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl font-black text-white">Ep {currentEpisode}</span>
            <span className="text-white/40 text-sm">of {totalEpisodes}</span>
          </div>
          <p className="text-xs text-white/40">Managers are submitting picks for episode {currentEpisode}. Picks lock at that episode&apos;s lock time in the episodes table.</p>
        </Card>
        <Card>
          <H2>💬 Next episode title (shown on the pick card)</H2>
          <div className="flex gap-2">
            <input type="text" value={nextEpisodeTitle} onChange={(e) => setNextEpisodeTitle(e.target.value)} placeholder={`Episode ${currentEpisode} title`}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25" />
            <Btn onClick={saveNextEpisodeTitle} disabled={busy === 'nextTitle'}>💾 Save</Btn>
          </div>
        </Card>
        <Card>
          <H2>🔥 Advance to episode {currentEpisode + 1}</H2>
          {currentEpisode >= totalEpisodes ? <p className="text-xs text-white/50">Season complete.</p> : (<>
            <p className="text-xs text-white/40 mb-4">
              Do this after episode {currentEpisode} is scored. It opens episode {currentEpisode + 1} picks.
              {currentEpisode >= 2 ? ' Active Pool managers with no pool pick for this episode are drowned — you\'ll see the list and confirm first.' : ' Nobody is drowned when leaving episode 1 (the Pool starts at episode 2).'}
            </p>
            <Btn onClick={advanceEpisode} disabled={busy === 'advance'}>{busy === 'advance' ? '⏳ Advancing...' : `Advance to episode ${currentEpisode + 1}`}</Btn>
          </>)}
        </Card>
      </>)}

      {/* ---- TOOLS ---- */}
      {tab === 'tools' && (
        <Card>
          <H2>🧪 Parser self-test</H2>
          <p className="text-xs text-white/40 mb-4">Re-reads FSG live and checks the parser and scoring rules against the known Episode 1 results (spec §8). Run it if FSG looks like it changed its page. Writes nothing.</p>
          <Btn variant="secondary" onClick={runSelfTest} disabled={busy === 'selftest'}>{busy === 'selftest' ? '⏳ Running...' : 'Run self-test'}</Btn>
          {selfTest && (
            <div className="mt-4 text-xs">
              <div className="font-bold mb-2" style={{ color: selfTest.success ? '#4ade80' : '#f87171' }}>{selfTest.success ? '✓' : '✗'} {selfTest.passed} / {selfTest.total} checks passed</div>
              <ul className="space-y-0.5">
                {selfTest.checks.map(c => <li key={c.name} style={{ color: c.pass ? 'rgba(255,255,255,0.55)' : '#f87171' }}>{c.pass ? '✓' : '✗'} {c.name}{c.detail ? ` — ${c.detail}` : ''}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function AdminPage() {
  return <AuthGuard requireAdmin><AdminContent /></AuthGuard>;
}
