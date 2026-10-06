'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import AuthGuard from '@/components/auth/AuthGuard';
import { Card, Button, Segmented, TribeTag, cn } from '@/components/ui';
import { SEASON_ID, SEASON_NUMBER } from '@/lib/constants';
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
  availableEpisodes?: number[]; mergeDetected?: boolean;
}
interface EpisodeAdminRow { number: number; air_date: string; status: string; title: string | null; title_source: string | null; title_fetched_at: string | null; is_post_merge: boolean; merge_aired: boolean }
interface CalcResult {
  managerId?: string; name: string; submitted?: boolean; cardTotal: number; chip: string | null; chipNote: string | null;
  opponent: string | null; h2hPoints: number | null; h2hNote: string | null; shadowBeat: number;
}
interface ActivityRow { id: string; created_at: string; type: string; message: string; metadata: any; manager_id: string | null }
interface CalcResponse { success: boolean; dryRun?: boolean; finale?: boolean; message?: string; titleAnswerRecorded: boolean; results: CalcResult[]; error?: string }

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
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[15px] font-semibold text-ink mb-3">{children}</h2>
);
const Btn = ({ onClick, disabled, children, variant = 'primary' }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: 'primary' | 'secondary' }) => (
  <Button onClick={onClick} disabled={disabled} variant={variant}>{children}</Button>
);
const IssueList = ({ title, items, tone }: { title: string; items: string[]; tone: 'error' | 'warn' }) => items.length === 0 ? null : (
  <div className={cn('rounded-xl border p-3 mb-3 text-sm', tone === 'error' ? 'bg-negative/10 border-negative/30' : 'bg-warn/10 border-warn/30')}>
    <div className={cn('font-semibold mb-1', tone === 'error' ? 'text-negative' : 'text-warn')}>{title}</div>
    <ul className="list-disc pl-5 space-y-0.5 text-ink">{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
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
  const [episodeRows, setEpisodeRows] = useState<EpisodeAdminRow[]>([]);
  const [titleDrafts, setTitleDrafts] = useState<Record<number, string>>({});
  const [titleFetch, setTitleFetch] = useState<{ success: boolean; error?: string; updated?: { episode: number; title: string }[]; skipped?: string[] } | null>(null);

  const [tab, setTab] = useState<'results' | 'title' | 'calculate' | 'season' | 'flags' | 'tools'>('results');

  // Flags ("This looks wrong") + recent activity
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => { loadData(); loadActivity(); }, []);

  async function loadActivity() {
    const { data } = await supabase.from('activity_log').select('id, created_at, type, message, metadata, manager_id')
      .eq('season_id', SEASON_ID).order('created_at', { ascending: false }).limit(200);
    setActivity((data || []) as ActivityRow[]);
  }

  async function resolveFlag(row: ActivityRow) {
    const { error } = await supabase.from('activity_log').update({ metadata: { ...(row.metadata || {}), resolved: true } }).eq('id', row.id);
    if (error) setError(error.message); else await loadActivity();
  }
  useEffect(() => { loadEpisodeData(selectedEpisode); }, [selectedEpisode]);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, survivorsRes, managersRes] = await Promise.all([
        supabase.from('seasons').select('current_episode, total_episodes').eq('id', SEASON_ID).single(),
        supabase.from('survivors').select('id, name, tribe, is_active, is_playable, elimination_order, eliminated_episode, photo_url').eq('season_id', SEASON_ID).order('name'),
        supabase.from('managers').select('id, name').eq('season_id', SEASON_ID).order('name'),
      ]);
      const ep = seasonRes.data?.current_episode || 2;
      setCurrentEpisode(ep);
      setSelectedEpisode(ep);
      setTotalEpisodes(seasonRes.data?.total_episodes || 13);
      await loadEpisodeRows();
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
      supabase.from('episodes').select('status, title').eq('season_id', SEASON_ID).eq('number', episode).maybeSingle(),
    ]);
    const scores = scoresRes.data || [];
    setFsgScores(Object.fromEntries(scores.map((s: any) => [s.survivor_id, s.fsg_points])));
    setAdjustments(Object.fromEntries(scores.map((s: any) => [s.survivor_id, s.manual_adjustment || 0])));
    setActionsBy(Object.fromEntries(scores.map((s: any) => [s.survivor_id, s.scored_actions?.actions || []])));
    setHasScores(scores.length > 0);
    setOutcome(outcomeRes.data as StoredOutcome | null);
    setTitleAnswerId(netRes.data?.correct_survivor_id ?? null);
    setTitleText(netRes.data?.episode_title ?? epRes.data?.title ?? '');
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
  async function loadEpisodeRows() {
    const { data } = await supabase.from('episodes')
      .select('number, air_date, status, title, title_source, title_fetched_at, is_post_merge, merge_aired')
      .eq('season_id', SEASON_ID).order('number');
    const rows = (data || []) as EpisodeAdminRow[];
    setEpisodeRows(rows);
    setTitleDrafts(Object.fromEntries(rows.map(r => [r.number, r.title ?? ''])));
  }

  async function fetchTitles() {
    setBusy('titles'); setError(null);
    const { ok, data } = await postJSON('/api/scoring/fetch-titles', { seasonId: SEASON_ID });
    setTitleFetch(data);
    if (!ok) setError(data.error || 'Title fetch failed');
    else flash(data.updated?.length ? `Fetched ${data.updated.length} title(s).` : 'No new titles yet.');
    await loadEpisodeRows();
    setBusy(null);
  }

  // Saving a title marks it commissioner-set, so the scraper never overwrites it.
  // Saving it empty clears the override and lets the scraper refill it.
  async function saveEpisodeTitle(n: number) {
    const title = (titleDrafts[n] ?? '').trim();
    setBusy(`title-${n}`);
    const { error } = await supabase.from('episodes')
      .update(title ? { title, title_source: 'commissioner' } : { title: null, title_source: null, title_fetched_at: null })
      .eq('season_id', SEASON_ID).eq('number', n);
    if (error) setError(error.message);
    else { await logActivity('admin', title ? `Episode ${n} title set by commissioner: "${title}"` : `Episode ${n} title cleared (scraper will refill)`); flash(`Episode ${n} title saved.`); }
    await loadEpisodeRows();
    setBusy(null);
  }

  async function setEpisodeFlag(n: number, field: 'is_post_merge' | 'merge_aired', value: boolean) {
    const { error } = await supabase.from('episodes').update({ [field]: value }).eq('season_id', SEASON_ID).eq('number', n);
    if (error) setError(error.message);
    else await logActivity('admin', `Episode ${n} ${field} set to ${value} by commissioner`);
    await loadEpisodeRows();
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
  const flags = activity.filter(a => a.metadata?.kind === 'score_flag');
  const openFlags = flags.filter(f => !f.metadata?.resolved);
  const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center"><div className="text-4xl mb-4 animate-pulse">🔥</div><p className="text-faint text-sm">Loading admin panel...</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-5 pb-10 md:pt-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-ink tracking-wider">⚙️ Commissioner</h1>
          <p className="text-faint text-xs mt-1">Current episode: {currentEpisode} · Weekly flow: Pull from FSG → Title answer → Preview → Calculate → Advance</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Episode:</span>
          <select value={selectedEpisode} onChange={(e) => setSelectedEpisode(Number(e.target.value))}
            className="bg-raised border border-line rounded-md px-3 py-1.5 text-sm text-ink font-semibold">
            {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map(ep => (
              <option key={ep} value={ep}>Episode {ep}{ep === currentEpisode ? ' (current)' : ''}{ep === 1 ? ' — not scored' : ''}</option>
            ))}
          </select>
          {episodeStatus && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-raised text-muted uppercase tracking-wider">{episodeStatus}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-negative/10 border border-negative/30 rounded-lg p-3 mb-4 text-negative text-xs">
          ❌ {error}
          <button onClick={() => setError(null)} className="ml-2 text-negative underline cursor-pointer bg-transparent border-none">dismiss</button>
        </div>
      )}
      {success && <div className="bg-positive/10 border border-positive/30 rounded-lg p-3 mb-4 text-positive text-xs">✅ {success}</div>}

      {/* Tabs */}
      <Segmented className="mb-6" value={tab} onChange={setTab} options={[
        { value: 'results', label: '1 · FSG results' },
        { value: 'title', label: '2 · Title answer' },
        { value: 'calculate', label: '3 · Calculate' },
        { value: 'season', label: '4 · Advance' },
        { value: 'flags', label: `🚩 Flags${openFlags.length ? ` (${openFlags.length})` : ''}` },
        { value: 'tools', label: 'Tools' },
      ]} />

      {/* ---- 1. FSG RESULTS ---- */}
      {tab === 'results' && (<>
        <Card className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <H2>Episode {selectedEpisode} — FSG results</H2>
            <a href={fsgRecapUrl(selectedEpisode)} target="_blank" rel="noreferrer" className="text-xs text-accent underline">Open FSG recap ↗</a>
          </div>
          <p className="text-xs text-muted mb-4">Pull reads FSG&apos;s recap page for this episode. Re-pulling is safe — it replaces the episode&apos;s results. FSG usually updates the morning after an episode airs.</p>
          <Btn onClick={pullFromFSG} disabled={busy === 'pull'}>{busy === 'pull' ? '⏳ Pulling from FSG...' : '🔄 Pull from FSG'}</Btn>

          {pullResult && (
            <div className="mt-4">
              <IssueList title="Nothing was written — fix these first" items={pullResult.blocking || []} tone="error" />
              {!!pullResult.unknownActions?.length && (
                <IssueList title="New FSG actions — scored as Other. Confirm none of these is a challenge win." items={pullResult.unknownActions} tone="warn" />
              )}
              <IssueList title="Warnings — results were saved, but check these" items={(pullResult.warnings || []).filter(w => !w.includes('unknown FSG action'))} tone="warn" />
              {pullResult.success && (
                <div className="text-xs text-muted space-y-1">
                  <div>✓ {pullResult.actions} actions saved.</div>
                  {!!pullResult.eliminations?.length && <div>✓ Out of the game: {pullResult.eliminations.map(e => `${e.name} (${e.kind}${e.place ? `, ${formatRank(e.place)} place` : ''})`).join(', ')}</div>}
                  {!!pullResult.tribeChanges?.length && <div>✓ Tribe changes: {pullResult.tribeChanges.join(', ')}</div>}
                  {pullResult.mergeDetected && <div className="text-sm text-ink font-semibold">🔀 Merge detected — every later episode now uses post-merge penalty rules (see the Advance tab).</div>}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="mb-4">
          <H2>What the scoring engine sees</H2>
          {!outcome ? <p className="text-xs text-muted">No results stored for episode {selectedEpisode} yet. Pull from FSG first.</p> : (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {[
                { label: '🍖 Reward winners', value: outcome.reward_happened ? outcome.reward_winners.map(nameOf).join(', ') : 'No reward challenge (Reward slot scores base points only)' },
                { label: '🗿 Immunity winners', value: outcome.immunity_happened ? outcome.immunity_winners.map(nameOf).join(', ') : 'No immunity challenge' },
                { label: '🔥 Left the game', value: outcome.departures.length ? outcome.departures.map(nameOf).join(', ') : 'Nobody' },
                { label: '📈 Most Other Points', value: outcome.mop_winners.length ? outcome.mop_winners.map(nameOf).join(', ') : 'Nobody scored Other points' },
              ].map(r => (
                <div key={r.label} className="bg-raised/60 rounded-lg p-3">
                  <div className="text-[10px] font-bold tracking-wider text-muted mb-1">{r.label}</div>
                  <div className="text-ink">{r.value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <H2>Survivor points &amp; adjustments</H2>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${hasScores ? 'bg-positive/10 text-positive border border-positive/30' : 'bg-raised text-muted border border-line'}`}>{hasScores ? 'LOADED' : 'NO SCORES YET'}</span>
          </div>
          <p className="text-xs text-muted mb-3">Adjustments are added to a survivor&apos;s slot total and are <b>never multiplied</b>. Save, then re-run Calculate.</p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-raised/60">
                  {['SURVIVOR', 'TRIBE', 'FSG ACTIONS', 'FSG', 'ADJ', 'TOTAL'].map(h => <th key={h} className="text-left p-2.5 text-muted font-bold tracking-wider text-[10px]">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {playable.map(s => {
                  const fsg = fsgScores[s.id] || 0;
                  const adj = adjustments[s.id] || 0;
                  const out = s.eliminated_episode !== null && s.eliminated_episode <= selectedEpisode;
                  return (
                    <tr key={s.id} className="border-t border-line hover:bg-raised/50 align-top">
                      <td className="p-2.5"><span className={`font-semibold ${out ? 'text-faint line-through' : 'text-ink'}`}>{s.name}</span></td>
                      <td className="p-2.5"><TribeTag tribe={s.tribe} /></td>
                      <td className="p-2.5 text-muted">{(actionsBy[s.id] || []).map(a => `${a.action} (${a.points})`).join(' · ') || '—'}</td>
                      <td className="p-2.5 text-ink font-semibold">{fsg}</td>
                      <td className="p-2.5">
                        <input type="number" value={adj || ''} placeholder="0"
                          onChange={(e) => setAdjustments({ ...adjustments, [s.id]: parseInt(e.target.value) || 0 })}
                          className="w-14 bg-raised border border-line rounded px-2 py-1 text-center font-semibold text-xs"
                          style={{ color: adj < 0 ? 'rgb(var(--c-negative))' : adj > 0 ? 'rgb(var(--c-positive))' : undefined }} />
                      </td>
                      <td className="p-2.5 font-bold text-ink">{fsg + adj}</td>
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
        <Card className="mb-4">
          <H2>💬 Episode {selectedEpisode} — who said the title?</H2>
          <p className="text-xs text-muted mb-4">Worth +1 to every manager whose Title pick matches. Jeff is an option.</p>
          <input type="text" value={titleText} onChange={(e) => setTitleText(e.target.value)} placeholder="Episode title (optional)"
            className="w-full bg-raised border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint mb-4" />
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
            {[...survivors.filter(s => !s.is_playable), ...playable].map(s => {
              const on = titleAnswerId === s.id;
              return (
                <button key={s.id} onClick={() => setTitleAnswerId(s.id)}
                  className={cn('text-left px-3 py-2 rounded-xl text-sm font-semibold border transition-colors', on ? 'bg-accent/15 border-accent/50 text-accent' : 'bg-raised/60 border-line text-ink hover:bg-raised')}>
                  {s.name}<span className="block text-[9px] opacity-60">{s.tribe}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Btn onClick={saveTitleAnswer} disabled={!titleAnswerId || busy === 'title'}>{busy === 'title' ? '⏳ Saving...' : '💾 Save title answer'}</Btn>
            {titleSaved && <span className="text-xs text-positive">Saved: {titleAnswerId ? nameOf(titleAnswerId) : '—'}</span>}
          </div>
        </Card>
      )}

      {/* ---- 3. CALCULATE ---- */}
      {tab === 'calculate' && (<>
        <Card className="mb-4">
          <H2>🧮 Score episode {selectedEpisode}</H2>
          {selectedEpisode === 1 && <IssueList title="Episode 1 is parsed but never scored." items={['There were no picks for the premiere.']} tone="warn" />}
          <p className="text-xs text-muted mb-2"><b>Preview</b> shows every card&apos;s score and fixture result without saving anything. <b>Calculate &amp; save</b> writes scores, H2H, Pool and standings. Both are safe to repeat.</p>
          <div className="text-xs text-muted mb-4 space-y-1">
            <div>{outcome ? '✓' : '✗'} FSG results {outcome ? 'pulled' : <span className="text-negative">not pulled yet</span>}</div>
            <div>{titleSaved ? '✓' : '○'} Title answer {titleSaved ? `recorded (${titleAnswerId ? nameOf(titleAnswerId) : 'nobody'})` : 'not recorded — Title slots will score 0 until you add it and re-run'}</div>
            <div>✓ {submittedIds.length} of {managers.length} cards submitted{missingCards.length ? ` — no card: ${missingCards.map(m => m.name).join(', ')}` : ''}</div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Btn variant="secondary" onClick={() => calculate(true)} disabled={!!busy || !outcome}>{busy === 'preview' ? '⏳ Previewing...' : '👀 Preview (no save)'}</Btn>
            <Btn onClick={() => calculate(false)} disabled={!!busy || !outcome || selectedEpisode === 1}>{busy === 'calc' ? '⏳ Calculating...' : '✅ Calculate & save'}</Btn>
          </div>
        </Card>

        {calcResult && (
          <Card className="mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <H2>{calcResult.dryRun ? 'Preview — nothing saved' : 'Saved results'}</H2>
              {!calcResult.titleAnswerRecorded && <span className="text-[10px] font-bold text-warn">Title answer not recorded</span>}
            </div>
            {calcResult.message && <p className="text-sm text-ink mb-3">{calcResult.message}</p>}
            {(calcResult as any).ruleset && <p className="text-xs text-muted mb-3">Scored under <b className="text-ink">{(calcResult as any).rulesVersion ? `Rules v${(calcResult as any).rulesVersion} · ` : ''}{(calcResult as any).ruleset}</b> penalty rules.</p>}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-raised/60">
                    {['MANAGER', 'CARD', 'CHIP', 'VS', 'H2H', 'BEAT'].map(h => <th key={h} className="text-left p-2.5 text-muted font-bold tracking-wider text-[10px]">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {calcResult.results.map(r => {
                    const mgr = managers.find(m => m.name === r.name);
                    return (
                      <tr key={r.name} className="border-t border-line">
                        <td className="p-2.5 font-semibold text-ink">
                          {mgr && !calcResult.dryRun ? <Link href={`/breakdown/${mgr.id}/${selectedEpisode}`} className="underline decoration-white/20">{r.name}</Link> : r.name}
                        </td>
                        <td className={cn('p-2.5 font-bold num', r.cardTotal < 0 ? 'text-negative' : 'text-ink')}>{r.cardTotal}</td>
                        <td className="p-2.5 text-muted">{r.chip || '—'}{r.chipNote && <div className="text-warn text-[10px]">{r.chipNote}</div>}</td>
                        <td className="p-2.5 text-muted">{r.opponent || '—'}</td>
                        <td className="p-2.5 text-ink">{r.h2hPoints ?? '—'}{r.h2hNote && <div className="text-muted text-[10px]">{r.h2hNote}</div>}</td>
                        <td className="p-2.5 text-muted">{r.shadowBeat}/{managers.length - 1}</td>
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
        <Card className="mb-4">
          <H2>📅 Season progress</H2>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl font-black text-ink">Ep {currentEpisode}</span>
            <span className="text-muted text-sm">of {totalEpisodes}</span>
          </div>
          <p className="text-xs text-muted">Managers are submitting picks for episode {currentEpisode}. Picks lock at that episode&apos;s lock time in the episodes table.</p>
        </Card>
        <Card className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
            <H2>🎬 Episodes — titles &amp; merge rules</H2>
            <Btn variant="secondary" onClick={fetchTitles} disabled={busy === 'titles'}>{busy === 'titles' ? '⏳ Fetching...' : 'Fetch titles'}</Btn>
          </div>
          <p className="text-xs text-muted mb-3">Titles are pulled daily from CBS press releases (The Futon Critic) and shown on the pick card. Typing a title here overrides it — the scraper never touches a commissioner title; save it empty to hand it back. <b className="text-ink">Post-merge</b> switches that episode to post-merge penalty rules; the FSG pull sets it automatically on every episode after the merge.</p>
          {titleFetch && !titleFetch.success && <IssueList title="Title fetch failed — nothing was written" items={[titleFetch.error || 'Unknown error']} tone="error" />}
          {titleFetch?.success && !!titleFetch.skipped?.length && <IssueList title="Kept commissioner titles" items={titleFetch.skipped} tone="warn" />}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="data-table">
              <thead><tr><th>Ep</th><th>Airs</th><th>Title</th><th>Source</th><th className="text-center">Merge aired</th><th className="text-center">Post-merge</th></tr></thead>
              <tbody>
                {episodeRows.filter(r => r.number >= 2).map(r => (
                  <tr key={r.number}>
                    <td className="num font-semibold text-ink">E{r.number}</td>
                    <td className="text-muted text-xs">{new Date(r.air_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td>
                      <div className="flex gap-1.5 min-w-[220px]">
                        <input type="text" value={titleDrafts[r.number] ?? ''} placeholder="Not announced"
                          onChange={(e) => setTitleDrafts({ ...titleDrafts, [r.number]: e.target.value })}
                          className="flex-1 bg-raised border border-line rounded-lg px-2 py-1 text-sm text-ink placeholder:text-faint" />
                        {(titleDrafts[r.number] ?? '') !== (r.title ?? '') && <Button size="sm" onClick={() => saveEpisodeTitle(r.number)} disabled={busy === `title-${r.number}`}>Save</Button>}
                      </div>
                    </td>
                    <td className="text-xs text-muted">{r.title_source === 'commissioner' ? 'You' : r.title_source === 'thefutoncritic' ? 'CBS' : '—'}</td>
                    <td className="text-center"><input type="checkbox" checked={r.merge_aired} onChange={(e) => setEpisodeFlag(r.number, 'merge_aired', e.target.checked)} aria-label={`Episode ${r.number} merge aired`} /></td>
                    <td className="text-center"><input type="checkbox" checked={r.is_post_merge} onChange={(e) => setEpisodeFlag(r.number, 'is_post_merge', e.target.checked)} aria-label={`Episode ${r.number} post-merge rules`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="mb-4">
          <H2>🔥 Advance to episode {currentEpisode + 1}</H2>
          {currentEpisode >= totalEpisodes ? <p className="text-xs text-muted">Season complete.</p> : (<>
            <p className="text-xs text-muted mb-4">
              Do this after episode {currentEpisode} is scored. It opens episode {currentEpisode + 1} picks.
              {currentEpisode >= 2 ? ' Active Pool managers with no pool pick for this episode are drowned — you\'ll see the list and confirm first.' : ' Nobody is drowned when leaving episode 1 (the Pool starts at episode 2).'}
            </p>
            <Btn onClick={advanceEpisode} disabled={busy === 'advance'}>{busy === 'advance' ? '⏳ Advancing...' : `Advance to episode ${currentEpisode + 1}`}</Btn>
          </>)}
        </Card>
      </>)}

      {/* ---- FLAGS ---- */}
      {tab === 'flags' && (<>
        <Card className="mb-4">
          <H2>🚩 Score questions from managers</H2>
          <p className="text-xs text-muted mb-3">Sent from the &quot;This looks wrong&quot; button on a breakdown. Fix the input and re-run Calculate if needed, then mark it resolved.</p>
          {flags.length === 0 ? <p className="text-xs text-muted">No flags yet.</p> : (
            <div className="space-y-2">
              {flags.map(f => (
                <div key={f.id} className={cn('rounded-xl p-3 text-sm flex items-start gap-3 flex-wrap border', f.metadata?.resolved ? 'bg-surface border-line' : 'bg-warn/10 border-warn/30')}>
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-ink">{f.message}</div>
                    <div className="text-muted mt-1">{fmtTime(f.created_at)}{f.metadata?.resolved ? ' · resolved' : ''}</div>
                  </div>
                  {f.metadata?.about_manager_id && f.metadata?.episode && (
                    <Link href={`/breakdown/${f.metadata.about_manager_id}/${f.metadata.episode}`} className="text-accent underline whitespace-nowrap">Open breakdown</Link>
                  )}
                  {!f.metadata?.resolved && <Button size="sm" variant="secondary" onClick={() => resolveFlag(f)}>Mark resolved</Button>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="mb-4">
          <H2>Recent activity</H2>
          <div className="space-y-1 text-xs">
            {activity.filter(a => a.metadata?.kind !== 'score_flag').slice(0, 40).map(a => (
              <div key={a.id} className="flex gap-3 text-muted"><span className="text-faint whitespace-nowrap w-28 shrink-0">{fmtTime(a.created_at)}</span><span>{a.message}</span></div>
            ))}
          </div>
        </Card>
      </>)}

      {/* ---- TOOLS ---- */}
      {tab === 'tools' && (
        <Card className="mb-4">
          <H2>🧪 Parser self-test</H2>
          <p className="text-xs text-muted mb-4">Re-reads FSG live and checks the parser and scoring rules against the known Episode 1 results (spec §8). Run it if FSG looks like it changed its page. Writes nothing.</p>
          <Btn variant="secondary" onClick={runSelfTest} disabled={busy === 'selftest'}>{busy === 'selftest' ? '⏳ Running...' : 'Run self-test'}</Btn>
          {selfTest && (
            <div className="mt-4 text-xs">
              <div className={cn('font-bold mb-2', selfTest.success ? 'text-positive' : 'text-negative')}>{selfTest.success ? '✓' : '✗'} {selfTest.passed} / {selfTest.total} checks passed</div>
              <ul className="space-y-0.5">
                {selfTest.checks.map(c => <li key={c.name} className={c.pass ? 'text-muted' : 'text-negative'}>{c.pass ? '✓' : '✗'} {c.name}{c.detail ? ` — ${c.detail}` : ''}</li>)}
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
