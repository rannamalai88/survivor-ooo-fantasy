'use client';

// ============================================================
// Home — this week's card and fixture, your standing, last result
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import { useSeason } from '@/hooks/useSeason';
import { SEASON_ID } from '@/lib/constants';
import { loadStandings, fmtPts, type Standings } from '@/lib/standings';
import { formatRank } from '@/lib/utils';

interface EpisodeRow { number: number; lock_at: string; h2h_round: number | null; is_couples_week: boolean; is_rivalry_week: boolean; is_finale: boolean }
interface Fixture { manager_a: string; manager_b: string }

const card = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '18px' } as const;
const label = { fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' as const };

function countdown(ms: number) {
  if (ms <= 0) return 'locked';
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`;
}

function HomeContent() {
  const { manager, managers, isLoading: authLoading } = useAuth();
  const { season } = useSeason();
  const [standings, setStandings] = useState<Standings | null>(null);
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{ episode: number; card: number; h2h: number | null; opponent: string | null; oppCard: number | null } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);
  useEffect(() => { loadStandings().then(setStandings).catch(console.error); }, []);

  useEffect(() => {
    if (!season || !manager) return;
    (async () => {
      const ep = season.current_episode;
      const [{ data: epRow }, { data: picks }] = await Promise.all([
        supabase.from('episodes').select('number, lock_at, h2h_round, is_couples_week, is_rivalry_week, is_finale').eq('season_id', SEASON_ID).eq('number', ep).maybeSingle(),
        supabase.from('weekly_picks').select('manager_id').eq('season_id', SEASON_ID).eq('episode', ep),
      ]);
      setEpisode(epRow as EpisodeRow | null);
      setSubmitted((picks || []).map((p: any) => p.manager_id));
      if (epRow?.h2h_round) {
        const { data: fx } = await supabase.from('fixtures').select('manager_a, manager_b').eq('season_id', SEASON_ID).eq('round', epRow.h2h_round)
          .or(`manager_a.eq.${manager.id},manager_b.eq.${manager.id}`).maybeSingle();
        setFixture(fx as Fixture | null);
      } else setFixture(null);
    })();
  }, [season, manager]);

  // Last scored result for me
  useEffect(() => {
    if (!standings || !manager) return;
    const last = standings.scoredEpisodes[standings.scoredEpisodes.length - 1];
    if (!last) { setLastResult(null); return; }
    (async () => {
      const { data: ep } = await supabase.from('episodes').select('h2h_round').eq('season_id', SEASON_ID).eq('number', last).maybeSingle();
      const me = standings.rows.find(r => r.managerId === manager.id);
      let opponent: string | null = null, oppCard: number | null = null, h2h: number | null = null;
      if (ep?.h2h_round) {
        const { data: fx } = await supabase.from('fixtures').select('manager_a, manager_b').eq('season_id', SEASON_ID).eq('round', ep.h2h_round)
          .or(`manager_a.eq.${manager.id},manager_b.eq.${manager.id}`).maybeSingle();
        if (fx) {
          const oppId = fx.manager_a === manager.id ? fx.manager_b : fx.manager_a;
          const opp = standings.rows.find(r => r.managerId === oppId);
          opponent = opp?.name ?? null; oppCard = opp?.cards[last] ?? null;
          const { data: ms } = await supabase.from('manager_scores').select('h2h_points').eq('season_id', SEASON_ID).eq('episode', last).eq('manager_id', manager.id).maybeSingle();
          h2h = ms?.h2h_points ?? null;
        }
      }
      setLastResult({ episode: last, card: me?.cards[last] ?? 0, h2h, opponent, oppCard });
    })();
  }, [standings, manager]);

  const me = useMemo(() => standings?.rows.find(r => r.managerId === manager?.id) ?? null, [standings, manager]);
  const top = useMemo(() => standings ? [...standings.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.rawCardPoints - a.rawCardPoints).slice(0, 5) : [], [standings]);
  const myCouple = standings?.couples.find(c => manager && c.managerIds.includes(manager.id));
  const opponentId = fixture && manager ? (fixture.manager_a === manager.id ? fixture.manager_b : fixture.manager_a) : null;
  const opponentName = opponentId ? managers.find(m => m.id === opponentId)?.name : null;
  const lockMs = episode ? new Date(episode.lock_at).getTime() - now : 0;
  const locked = !episode || lockMs <= 0;
  const iSubmitted = !!manager && submitted.includes(manager.id);
  const scored = (standings?.scoredEpisodes.length ?? 0) > 0;

  if (authLoading || !standings) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading...</div></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px 60px' }}>

        {/* This week */}
        <div style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.14), rgba(5,169,230,0.07))', border: '1px solid rgba(255,107,53,0.25)', borderRadius: '18px', padding: '22px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={label}>{season?.name ?? ''} · Episode {season?.current_episode ?? ''}</div>
              {fixture && opponentName ? (
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', marginTop: '6px' }}>
                  {manager?.name} <span style={{ fontSize: '14px', color: '#FF6B35' }}>vs</span> {opponentName}
                </div>
              ) : (
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginTop: '6px' }}>{episode?.is_finale ? 'Finale week — no fixture' : 'No fixture this week'}</div>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {episode?.h2h_round && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>ROUND {episode.h2h_round}</span>}
                {episode?.is_couples_week && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(244,114,182,0.15)', color: '#f472b6' }}>💞 COUPLES WEEK</span>}
                {episode?.is_rivalry_week && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>⚔️ RIVALRY WEEK</span>}
                {opponentId && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>{opponentName} {submitted.includes(opponentId) ? 'has submitted' : "hasn't submitted yet"}</span>}
              </div>
            </div>
            <Link href="/picks">
              <div style={{ background: locked ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#FF6B35,#FF8F00)', borderRadius: '12px', padding: '12px 18px', textAlign: 'center', boxShadow: locked ? 'none' : '0 4px 16px rgba(255,107,53,0.35)' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#fff', letterSpacing: '1px' }}>{locked ? (iSubmitted ? '🔒 VIEW YOUR CARD' : '🔒 PICKS LOCKED') : iSubmitted ? '✏️ EDIT YOUR CARD' : '🔥 MAKE YOUR PICKS'}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>{locked ? `${submitted.length}/${managers.length} cards in` : `Locks in ${countdown(lockMs)}`}</div>
              </div>
            </Link>
          </div>
          {!locked && !iSubmitted && <div style={{ marginTop: '12px', fontSize: '12px', color: '#ff9a6b' }}>You haven&apos;t submitted a card for episode {season?.current_episode} yet.</div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '14px', marginBottom: '14px' }}>
          {/* My standing */}
          <div style={card}>
            <div style={label}>Your championship</div>
            {scored && me ? (<>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '6px' }}>
                <span style={{ fontSize: '42px', fontWeight: 900, color: '#FF6B35', lineHeight: 1 }}>{fmtPts(me.championship)}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{me.rank ? `${formatRank(me.rank)} of ${standings.rows.length}` : ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px', marginTop: '12px', fontSize: '11px' }}>
                {[
                  { k: 'Fantasy', v: fmtPts(me.champFantasy), sub: `${me.h2hPoints} H2H pts` },
                  { k: 'Pool', v: fmtPts(me.champPool), sub: `${me.weeksSurvived} wk${me.weeksSurvived === 1 ? '' : 's'} · ${me.poolStatus}` },
                  { k: 'Quinfecta', v: me.quinfectaRank ? fmtPts(me.champQuinfecta) : '—', sub: 'finale' },
                ].map(x => (
                  <div key={x.k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>{x.k}</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>{x.v}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)' }}>{x.sub}</div>
                  </div>
                ))}
              </div>
              {myCouple && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '10px' }}>{myCouple.label}: {fmtPts(myCouple.championship)} ({formatRank(myCouple.rank)} of {standings.couples.length} couples)</div>}
            </>) : <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>Standings start once episode 2 is scored.</div>}
          </div>

          {/* Last result */}
          <div style={card}>
            <div style={label}>Last result</div>
            {lastResult ? (<>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginTop: '6px' }}>Episode {lastResult.episode}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '38px', fontWeight: 900, color: lastResult.card < 0 ? '#f87171' : '#fff', lineHeight: 1.1 }}>{lastResult.card}</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>card points</span>
              </div>
              {lastResult.opponent && (
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', marginTop: '4px' }}>
                  {lastResult.oppCard !== null && (lastResult.card > lastResult.oppCard ? 'Beat' : lastResult.card < lastResult.oppCard ? 'Lost to' : 'Drew with')} {lastResult.opponent} ({lastResult.oppCard ?? '—'}) · <b style={{ color: '#3fc0f0' }}>{lastResult.h2h ?? 0} H2H pts</b>
                </div>
              )}
              {manager && <Link href={`/breakdown/${manager.id}/${lastResult.episode}`} style={{ display: 'inline-block', marginTop: '10px', fontSize: '12px', color: '#3fc0f0' }}>See how you scored →</Link>}
            </>) : <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>No episodes scored yet.</div>}
          </div>
        </div>

        {/* Top of the table */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={label}>Championship</div>
            <Link href="/leaderboard" style={{ fontSize: '12px', color: '#3fc0f0' }}>Full standings →</Link>
          </div>
          {!scored ? <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Standings start once episode 2 is scored.</div> : top.map(r => (
            <div key={r.managerId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', background: r.managerId === manager?.id ? 'rgba(255,107,53,0.08)' : undefined }}>
              <span style={{ width: '34px', fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,0.45)' }}>{r.rank ? formatRank(r.rank) : '—'}</span>
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#fff' }}>{r.name}</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{r.won}-{r.drawn}-{r.lost}</span>
              <span style={{ width: '48px', textAlign: 'right', fontSize: '14px', fontWeight: 800, color: '#fff' }}>{fmtPts(r.championship)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <AuthGuard><HomeContent /></AuthGuard>;
}
