'use client';

// ============================================================
// Home — matchday hub: this week's matchup and card status, what needs
// doing, last week's recap, and the table.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/auth/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, PICK_CHIPS, CHIP_LAST_EP } from '@/lib/constants';
import { useSeasonContext } from '@/lib/season-context';
import { loadStandings, fmtPts, fmtSigned, type Standings, type StandingRow } from '@/lib/standings';
import { loadRecap, type Recap } from '@/lib/recap';
import { formatRank } from '@/lib/utils';
import { Page, Card, CardHeader, Badge, Button, ManagerAvatar, ResultPill, StatTile, Skeleton, cn } from '@/components/ui';
import { IconClock, IconLock, IconCheck, IconChevronRight } from '@/components/ui/icons';

function countdown(ms: number) {
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`;
}

function Side({ row, name, me, align }: { row: StandingRow | undefined; name: string; me?: boolean; align: 'left' | 'right' }) {
  return (
    <div className={cn('flex-1 min-w-0 flex flex-col gap-1.5', align === 'right' ? 'items-end text-right' : 'items-start')}>
      <ManagerAvatar name={name} size={44} me={me} />
      <div className="text-lg font-bold text-ink truncate max-w-full">{me ? 'You' : name}</div>
      <div className="text-xs text-muted num">
        {row && row.played > 0 ? `${row.won}-${row.drawn}-${row.lost}` : '0-0-0'}
        {row?.rank ? ` · ${formatRank(row.rank)}` : ''}
      </div>
      {row && row.form.length > 0 && (
        <div className={cn('flex gap-0.5', align === 'right' && 'flex-row-reverse')}>{row.form.slice(-5).map((f, i) => <ResultPill key={i} result={f} />)}</div>
      )}
    </div>
  );
}

function HomeContent() {
  const { manager, managers } = useAuth();
  const { season, episode } = useSeasonContext();
  const [standings, setStandings] = useState<Standings | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [submitted, setSubmitted] = useState<string[] | null>(null);
  const [fixture, setFixture] = useState<{ manager_a: string; manager_b: string } | null>(null);
  const [usedChips, setUsedChips] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);
  useEffect(() => { loadStandings().then(setStandings).catch(console.error); }, []);

  useEffect(() => {
    if (!standings) return;
    const last = standings.scoredEpisodes[standings.scoredEpisodes.length - 1];
    if (last) loadRecap(last).then(setRecap).catch(console.error);
  }, [standings]);

  useEffect(() => {
    if (!season || !manager || !episode) return;
    (async () => {
      const [{ data: picks }, { data: mine }, fxRes] = await Promise.all([
        supabase.from('weekly_picks').select('manager_id').eq('season_id', SEASON_ID).eq('episode', season.current_episode),
        supabase.from('weekly_picks').select('episode, chip').eq('season_id', SEASON_ID).eq('manager_id', manager.id),
        episode.h2h_round
          ? supabase.from('fixtures').select('manager_a, manager_b').eq('season_id', SEASON_ID).eq('round', episode.h2h_round).or(`manager_a.eq.${manager.id},manager_b.eq.${manager.id}`).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setSubmitted((picks || []).map((p: any) => p.manager_id));
      setUsedChips((mine || []).filter((p: any) => p.chip && p.episode !== season.current_episode).map((p: any) => p.chip));
      setFixture((fxRes as any).data ?? null);
    })();
  }, [season, manager, episode]);

  const me = standings?.rows.find(r => r.managerId === manager?.id);
  const oppId = fixture && manager ? (fixture.manager_a === manager.id ? fixture.manager_b : fixture.manager_a) : null;
  const opp = standings?.rows.find(r => r.managerId === oppId);
  const oppName = oppId ? managers.find(x => x.id === oppId)?.name ?? '?' : null;
  const lockMs = episode ? new Date(episode.lock_at).getTime() - now : 0;
  const locked = !!episode && lockMs <= 0;
  const iSubmitted = !!manager && !!submitted?.includes(manager.id);
  const scored = (standings?.scoredEpisodes.length ?? 0) > 0;
  const lastEp = standings?.scoredEpisodes[standings.scoredEpisodes.length - 1];
  const myLast = me?.results.find(r => r.episode === lastEp);
  const episodesLeftForChips = season ? Math.max(0, CHIP_LAST_EP - season.current_episode + 1) : 0;
  const chipsLeft = PICK_CHIPS.filter(c => !usedChips.includes(c.id));

  const table = useMemo(() => {
    if (!standings) return [];
    return [...standings.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.rawCardPoints - a.rawCardPoints);
  }, [standings]);
  const movement = (r: StandingRow) => {
    const h = r.rankHistory;
    if (h.length < 2) return 0;
    return h[h.length - 2].rank - h[h.length - 1].rank;
  };

  // To-do list
  const todos: { tone: 'warn' | 'accent' | 'negative'; text: React.ReactNode; href: string }[] = [];
  if (episode && !locked && !iSubmitted) todos.push({ tone: 'warn', text: <>You haven&apos;t submitted your Episode {season?.current_episode} card.</>, href: '/picks' });
  if (me?.poolStatus === 'drowned' && !locked) todos.push({ tone: 'negative', text: <>You&apos;re drowned in the Pool — make a Backdoor pick to get back in.</>, href: '/picks' });
  if (!locked && episodesLeftForChips > 0 && chipsLeft.length > 0 && chipsLeft.length >= episodesLeftForChips) todos.push({ tone: 'accent', text: <>{chipsLeft.length} chip{chipsLeft.length === 1 ? '' : 's'} left and only {episodesLeftForChips} episode{episodesLeftForChips === 1 ? '' : 's'} to play {chipsLeft.length === 1 ? 'it' : 'them'}.</>, href: '/picks' });

  return (
    <Page width="lg">
      {/* ── Matchup hero ── */}
      <Card className="mb-4 overflow-hidden" padded={false}>
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4 bg-gradient-to-br from-accent/10 via-transparent to-transparent">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs font-semibold text-muted">{season?.name ?? <Skeleton className="h-3 w-20 inline-block" />} · Episode {season?.current_episode}</span>
            {episode?.h2h_round && <Badge>Round {episode.h2h_round}</Badge>}
            {episode?.is_couples_week && <Badge tone="accent">💞 Couples Week</Badge>}
            {episode?.is_rivalry_week && <Badge tone="negative">⚔️ Rivalry Week</Badge>}
            {episode?.is_finale && <Badge tone="accent">🏆 Finale</Badge>}
          </div>

          {fixture && oppName && manager ? (
            <div className="flex items-start gap-3">
              <Side row={me} name={manager.name} me align="left" />
              <div className="pt-3 text-center shrink-0">
                <div className="text-xs font-bold text-faint tracking-widest">VS</div>
              </div>
              <Side row={opp} name={oppName} align="right" />
            </div>
          ) : (
            <div className="text-lg font-semibold text-ink">{episode?.is_finale ? 'Finale week — no fixture, just glory (and the Quinfecta).' : episode ? 'No fixture this episode.' : <Skeleton className="h-6 w-56" />}</div>
          )}
        </div>

        <div className="border-t border-line px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            {locked ? <><IconLock size={16} className="text-muted" /><span className="text-muted">Picks locked · {submitted?.length ?? '–'}/{managers.length} cards in</span></>
              : <><IconClock size={16} className="text-accent" /><span className="text-ink">Locks in <b>{countdown(lockMs) ?? '—'}</b></span>
                {iSubmitted ? <Badge tone="positive"><IconCheck size={12} />Card in</Badge> : <Badge tone="warn">Card not in</Badge>}
                {oppId && submitted && <span className="text-muted hidden sm:inline">· {oppName} {submitted.includes(oppId) ? 'is in' : "hasn't submitted"}</span>}</>}
          </div>
          <Button href={locked ? '/matchups' : '/picks'} size="md">
            {locked ? 'See all cards' : iSubmitted ? 'Edit your card' : 'Make your picks'}
          </Button>
        </div>
      </Card>

      {todos.length > 0 && (
        <div className="space-y-2 mb-4">
          {todos.map((t, i) => (
            <Link key={i} href={t.href} className={cn('flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm text-ink transition-colors',
              t.tone === 'warn' ? 'border-warn/30 bg-warn/10 hover:bg-warn/15' : t.tone === 'negative' ? 'border-negative/30 bg-negative/10 hover:bg-negative/15' : 'border-accent/30 bg-accent/10 hover:bg-accent/15')}>
              <span>{t.text}</span><IconChevronRight size={16} className="text-muted shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        {/* ── Left column ── */}
        <div className="md:col-span-3 space-y-4">
          {/* Last episode */}
          <Card>
            <CardHeader title={lastEp ? `Episode ${lastEp} recap` : 'Recap'} subtitle={lastEp ? 'How last week shook out' : undefined}
              action={lastEp && <Link href={`/recap/${lastEp}`} className="text-accent font-semibold">Full recap</Link>} />
            {!standings ? <Skeleton className="h-28 w-full" /> : !scored ? (
              <p className="text-sm text-muted">The first recap lands after Episode 2 is scored.</p>
            ) : (
              <>
                {manager && lastEp && (
                  <Link href={`/breakdown/${manager.id}/${lastEp}`} className="flex items-center justify-between gap-3 rounded-xl bg-raised/60 hover:bg-raised px-3.5 py-3 mb-3">
                    <div>
                      <div className="text-xs text-muted">Your card</div>
                      <div className="text-3xl font-bold tracking-tight" style={{ color: (me?.cards[lastEp] ?? 0) < 0 ? 'rgb(var(--c-negative))' : undefined }}>{me?.cards[lastEp] ?? '—'}</div>
                    </div>
                    {myLast && (
                      <div className="text-right text-sm">
                        <div className="flex items-center gap-1.5 justify-end"><ResultPill result={myLast.result} /><span className="text-ink font-semibold">vs {myLast.opponentName}</span></div>
                        <div className="text-muted num">{myLast.myCard}–{myLast.theirCard} · {myLast.h2hPoints} pt{myLast.h2hPoints === 1 ? '' : 's'}</div>
                      </div>
                    )}
                    <IconChevronRight size={16} className="text-muted shrink-0" />
                  </Link>
                )}
                {recap && (
                  <div className="grid grid-cols-2 gap-2">
                    {recap.highCard && <StatTile label="🔥 High card" value={recap.highCard.total} sub={recap.highCard.name} />}
                    {recap.blowout && <StatTile label="💥 Biggest win" value={`+${recap.blowout.margin}`} sub={`${recap.blowout.winner.name} over ${recap.blowout.loser.name}`} />}
                    {recap.closest && <StatTile label="😬 Closest" value={recap.closest.margin === 0 ? 'Draw' : `${recap.closest.margin} pt${recap.closest.margin === 1 ? '' : 's'}`} sub={`${recap.closest.a.name} v ${recap.closest.b.name}`} />}
                    {recap.bestLine && <StatTile label="⭐ Best pick" value={`+${recap.bestLine.total}`} sub={`${recap.bestLine.name}: ${recap.bestLine.survivorName}`} />}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* My season */}
          {me && scored && (
            <Card>
              <CardHeader title="Your season" action={<Link href="/managers/me" className="text-accent font-semibold">Details</Link>} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile label="Championship" value={fmtPts(me.championship)} sub={me.rank ? `${formatRank(me.rank)} of ${standings!.rows.length}` : undefined} />
                <StatTile label="Record" value={`${me.won}-${me.drawn}-${me.lost}`} sub={`${me.h2hPoints} H2H pts`} />
                <StatTile label="Luck" value={fmtSigned(me.luck)} sub="wins vs all-play" />
                <StatTile label="Pool" value={`${me.weeksSurvived} wk${me.weeksSurvived === 1 ? '' : 's'}`} sub={me.poolStatus} />
              </div>
            </Card>
          )}
        </div>

        {/* ── Right column: table ── */}
        <div className="md:col-span-2">
          <Card padded={false}>
            <div className="px-4 pt-4"><CardHeader title="Championship" action={<Link href="/leaderboard" className="text-accent font-semibold">Standings</Link>} /></div>
            {!standings ? <div className="px-4 pb-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              : !scored ? <p className="px-4 pb-4 text-sm text-muted">Standings start once Episode 2 is scored.</p> : (
                <ol className="pb-2">
                  {table.map(r => {
                    const mv = movement(r);
                    const isMe = r.managerId === manager?.id;
                    return (
                      <li key={r.managerId}>
                        <Link href={`/managers/${r.managerId}`} className={cn('flex items-center gap-3 px-4 py-2 hover:bg-raised/60', isMe && 'bg-accent/10')}>
                          <span className="w-7 text-xs font-semibold text-muted num">{r.rank ? formatRank(r.rank) : '—'}</span>
                          <span className={cn('flex-1 text-sm truncate', isMe ? 'font-bold text-ink' : 'text-ink')}>{r.name}</span>
                          <span className={cn('w-6 text-[11px] font-semibold num text-right', mv > 0 ? 'text-positive' : mv < 0 ? 'text-negative' : 'text-faint')}>{mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–'}</span>
                          <span className="w-12 text-right text-sm font-bold text-ink num">{fmtPts(r.championship)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

export default function HomePage() {
  return <AuthGuard><HomeContent /></AuthGuard>;
}
