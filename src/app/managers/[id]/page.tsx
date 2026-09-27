'use client';

// ============================================================
// Manager profile — /managers/[id]   (/managers/me = you)
// Season stats, card chart, full fixture list, chips, Pool path, dynasty.
// Another manager's picks are only shown for episodes that have locked.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/auth/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useSeasonContext } from '@/lib/season-context';
import { SEASON_ID, PICK_CHIPS, ROSTER_SLOTS } from '@/lib/constants';
import { loadStandings, fmtPts, fmtSigned, type Standings } from '@/lib/standings';
import { walkPool, type PoolWeek } from '@/lib/pool';
import { formatRank } from '@/lib/utils';
import { Page, Card, CardHeader, Badge, StatTile, ManagerAvatar, ResultPill, Skeleton, SurvivorAvatar, cn } from '@/components/ui';
import { EpisodeBars } from '@/components/charts';

interface Survivor { id: string; name: string; tribe: string; photo_url: string | null; is_active: boolean; eliminated_episode: number | null }

const POOL_LABEL: Record<PoolWeek['type'], string> = {
  safe: 'Safe', idol: 'Saved by idol', drowned: 'Drowned', missed: 'No pick — drowned', backdoor_hit: 'Backdoor hit — back in', backdoor_miss: 'Backdoor missed', none: '—',
};

function ProfileContent() {
  const params = useParams<{ id: string }>();
  const { manager: me, managers } = useAuth();
  const { episodes, season } = useSeasonContext();
  const id = params.id === 'me' ? me?.id ?? '' : params.id;
  const isMe = id === me?.id;
  const name = managers.find(m => m.id === id)?.name ?? '';

  const [standings, setStandings] = useState<Standings | null>(null);
  const [fixtures, setFixtures] = useState<{ round: number; manager_a: string; manager_b: string }[]>([]);
  const [picks, setPicks] = useState<any[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [couple, setCouple] = useState<string | null>(null);
  const [dynasty, setDynasty] = useState<{ season_label: string; rank: number }[]>([]);

  useEffect(() => { loadStandings().then(setStandings).catch(console.error); }, []);
  useEffect(() => {
    if (!id || !episodes.length) return;
    // Another manager's unlocked picks are private: only fetch locked episodes for them.
    const locked = episodes.filter(e => Date.now() >= new Date(e.lock_at).getTime()).map(e => e.number);
    (async () => {
      const [fx, pk, sv, cp, allMgrs, dyn] = await Promise.all([
        supabase.from('fixtures').select('round, manager_a, manager_b').eq('season_id', SEASON_ID).or(`manager_a.eq.${id},manager_b.eq.${id}`).order('round'),
        (isMe
          ? supabase.from('weekly_picks').select('episode, chip, chip_slot, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).eq('manager_id', id)
          : supabase.from('weekly_picks').select('episode, chip, chip_slot, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).eq('manager_id', id).in('episode', locked.length ? locked : [-1])),
        supabase.from('survivors').select('id, name, tribe, photo_url, is_active, eliminated_episode').eq('season_id', SEASON_ID),
        supabase.from('couples').select('label, manager1_id, manager2_id').eq('season_id', SEASON_ID).or(`manager1_id.eq.${id},manager2_id.eq.${id}`).maybeSingle(),
        supabase.from('managers').select('id, name'),
        supabase.from('dynasty_rankings').select('manager_id, season_label, rank').order('season_label'),
      ]);
      setFixtures((fx.data || []) as any[]);
      setPicks(pk.data || []);
      setSurvivors((sv.data || []) as Survivor[]);
      setCouple(cp.data?.label ?? null);
      const nameById = new Map((allMgrs.data || []).map((m: any) => [m.id, m.name]));
      const myName = nameById.get(id);
      setDynasty(((dyn.data || []) as any[]).filter(d => nameById.get(d.manager_id) === myName).map(d => ({ season_label: d.season_label, rank: d.rank })));
    })();
  }, [id, isMe, episodes]);

  const row = standings?.rows.find(r => r.managerId === id);
  const lockedEps = useMemo(() => new Set(episodes.filter(e => Date.now() >= new Date(e.lock_at).getTime()).map(e => e.number)), [episodes]);
  const visiblePicks = picks.filter(p => isMe || lockedEps.has(p.episode));
  const nameOf = (mid: string) => managers.find(m => m.id === mid)?.name ?? '?';
  const epByRound = new Map(episodes.filter(e => e.h2h_round).map(e => [e.h2h_round!, e]));

  // Pool path through the last locked episode
  const survMap = useMemo(() => new Map(survivors.map(s => [s.id, s])), [survivors]);
  const lastLocked = Math.max(1, ...[...lockedEps]);
  const walk = useMemo(() => {
    const byEp: Record<number, any> = {};
    for (const p of visiblePicks) byEp[p.episode] = p;
    return walkPool(byEp, survMap, !!row?.hasIdol, lastLocked);
  }, [visiblePicks, survMap, row?.hasIdol, lastLocked]);

  const chipsUsed = visiblePicks.filter(p => p.chip).sort((a, b) => a.episode - b.episode);
  const cardsList = standings ? standings.scoredEpisodes.filter(ep => row?.cards[ep] !== undefined).map(ep => ({ episode: ep, value: row!.cards[ep], href: `/breakdown/${id}/${ep}` })) : [];
  const best = cardsList.length ? cardsList.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const avg = cardsList.length ? Math.round((cardsList.reduce((s, c) => s + c.value, 0) / cardsList.length) * 10) / 10 : null;

  if (!id || !standings) return <Page><Skeleton className="h-16 w-64 mb-4" /><Skeleton className="h-40 w-full mb-3" /><Skeleton className="h-64 w-full" /></Page>;

  return (
    <Page width="lg">
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <ManagerAvatar name={name || '?'} size={56} me={isMe} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{isMe ? `${name} (you)` : name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {couple && <Badge>💞 {couple}</Badge>}
            {row?.rank && <Badge tone="accent">{formatRank(row.rank)} overall</Badge>}
            {row && <Badge tone={row.poolStatus === 'active' || row.poolStatus === 'finished' ? 'positive' : 'negative'}>Pool: {row.poolStatus}</Badge>}
            {row?.hasIdol && <Badge title="Dynasty Immunity Idol">🛡️ {row.idolUsed ? 'Idol used' : 'Holds the idol'}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <StatTile label="Championship" value={row ? fmtPts(row.championship) : '—'} sub={row?.rank ? `${formatRank(row.rank)} of ${standings.rows.length}` : undefined} />
        <StatTile label="Record" value={row ? `${row.won}-${row.drawn}-${row.lost}` : '—'} sub={row ? `${row.h2hPoints} H2H pts` : undefined} />
        <StatTile label="Card points" value={row?.rawCardPoints ?? 0} sub={avg !== null ? `${avg} per week` : undefined} />
        <StatTile label="All-play" value={row?.shadowGames ? `${Math.round((row.shadowBeat / row.shadowGames) * 100)}%` : '—'} sub={row?.shadowGames ? `${row.shadowBeat}/${row.shadowGames}` : undefined} />
        <StatTile label="Luck" value={row?.played ? fmtSigned(row.luck) : '—'} sub="wins vs all-play" />
        <StatTile label="Best week" value={best?.value ?? '—'} sub={best ? `Episode ${best.episode}` : undefined} href={best?.href} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title="Card points by episode" subtitle="Tap a bar for the breakdown" />
            <EpisodeBars data={cardsList} reference={standings.leagueAvg} seriesLabel={isMe ? 'Your card' : `${name}'s card`} />
          </Card>

          <Card padded={false}>
            <div className="px-4 pt-4 sm:px-5"><CardHeader title="Fixtures" subtitle="Head-to-head schedule and results" /></div>
            <ul className="divide-y divide-line">
              {fixtures.map(f => {
                const oppId = f.manager_a === id ? f.manager_b : f.manager_a;
                const ep = epByRound.get(f.round);
                const res = row?.results.find(r => r.episode === ep?.number);
                return (
                  <li key={f.round}>
                    <Link href={res ? `/breakdown/${id}/${res.episode}` : `/managers/${oppId}`} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-raised/50">
                      <span className="w-12 text-xs text-muted">E{ep?.number ?? '?'}</span>
                      {res ? <ResultPill result={res.result} /> : <span className="h-5 w-5 rounded-md bg-raised" />}
                      <span className="flex-1 text-sm text-ink truncate">vs {nameOf(oppId)}{ep?.is_couples_week && ' 💞'}{ep?.is_rivalry_week && ' ⚔️'}</span>
                      <span className="text-sm num text-muted">
                        {res ? <><b className="text-ink">{res.myCard}</b>–{res.theirCard} · {res.h2hPoints}pt</> : ep ? new Date(ep.air_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Chips" />
            <div className="space-y-2">
              {PICK_CHIPS.map(c => {
                const used = chipsUsed.find(p => p.chip === c.id);
                return (
                  <div key={c.id} className={cn('flex items-center gap-2.5 text-sm', used ? 'text-muted' : 'text-ink')}>
                    <span className="text-lg">{c.icon}</span>
                    <span className={cn('flex-1', used && 'line-through')}>{c.name}</span>
                    {used ? <span className="text-xs">E{used.episode}{used.chip_slot ? ` · ${ROSTER_SLOTS.find(s => s.key === used.chip_slot)?.label}` : ''}</span> : <Badge tone="accent">Available</Badge>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Pool path" subtitle={`${row?.weeksSurvived ?? 0} week${row?.weeksSurvived === 1 ? '' : 's'} survived`} />
            {walk.weeks.length === 0 ? <p className="text-sm text-muted">Starts with Episode 2.</p> : (
              <ul className="space-y-1.5">
                {walk.weeks.map(w => {
                  const s = w.survivorId ? survMap.get(w.survivorId) : undefined;
                  const good = w.type === 'safe' || w.type === 'idol' || w.type === 'backdoor_hit';
                  return (
                    <li key={w.episode} className="flex items-center gap-2 text-sm">
                      <span className="w-8 text-xs text-muted">E{w.episode}</span>
                      {s ? <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={22} /> : <span className="h-[22px] w-[22px]" />}
                      <span className="flex-1 text-ink truncate">{s?.name ?? ''}</span>
                      <span className={cn('text-xs font-medium', good ? 'text-positive' : w.type === 'none' ? 'text-faint' : 'text-negative')}>{POOL_LABEL[w.type]}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {dynasty.length > 0 && (
            <Card>
              <CardHeader title="Dynasty" subtitle="Final rank by season" />
              <div className="flex flex-wrap gap-1.5">
                {dynasty.map(d => (
                  <div key={d.season_label} className={cn('rounded-lg px-2 py-1 text-center min-w-[44px]', d.rank === 1 ? 'bg-accent/15' : 'bg-raised')}>
                    <div className="text-[10px] text-muted">{d.season_label}</div>
                    <div className="text-sm font-bold text-ink num">{d.rank === 1 ? '🥇' : formatRank(d.rank)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      {season && !isMe && <p className="text-xs text-muted mt-4">Picks for Episode {season.current_episode} stay hidden until they lock.</p>}
    </Page>
  );
}

export default function ManagerProfilePage() {
  return <AuthGuard><ProfileContent /></AuthGuard>;
}
