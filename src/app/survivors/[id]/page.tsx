'use client';

// ============================================================
// Survivor profile — /survivors/[id]
// Points by episode, itemized actions, and how the league has played them
// (locked cards only): picks per slot and how those slots scored.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useSeasonContext } from '@/lib/season-context';
import { SEASON_ID, ROSTER_SLOTS, placeFromEliminationOrder, type RosterSlot } from '@/lib/constants';
import { formatRank } from '@/lib/utils';
import { Page, Card, CardHeader, Badge, StatTile, SurvivorAvatar, TribeTag, Skeleton, EmptyState, cn } from '@/components/ui';
import { EpisodeBars } from '@/components/charts';

interface Survivor { id: string; name: string; full_name: string | null; tribe: string; original_tribe: string | null; is_active: boolean; eliminated_episode: number | null; elimination_order: number | null; photo_url: string | null }
interface Event { episode: number; action: string; points: number; category: string }

const COL: Record<RosterSlot, string> = { reward: 'reward_pick_id', immunity: 'immunity_pick_id', going_home: 'going_home_pick_id', mop: 'mop_pick_id' };
const CAT: Record<string, string> = { reward: 'Reward win', immunity: 'Immunity win', other: 'Other', departure: 'Left the game' };

export default function SurvivorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { managers } = useAuth();
  const { episodes } = useSeasonContext();
  const [s, setS] = useState<Survivor | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [mopEps, setMopEps] = useState<number[]>([]);
  const [picks, setPicks] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!episodes.length) return;
    // Only fetch picks from locked episodes — unlocked cards are private.
    const locked = episodes.filter(e => Date.now() >= new Date(e.lock_at).getTime()).map(e => e.number);
    (async () => {
      const [sv, ev, oc, pk, ln] = await Promise.all([
        supabase.from('survivors').select('id, name, full_name, tribe, original_tribe, is_active, eliminated_episode, elimination_order, photo_url').eq('id', id).maybeSingle(),
        supabase.from('episode_events').select('episode, action, points, category').eq('season_id', SEASON_ID).eq('survivor_id', id).order('episode'),
        supabase.from('episode_outcomes').select('episode, mop_winners').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('manager_id, episode, reward_pick_id, immunity_pick_id, going_home_pick_id, mop_pick_id, title_pick_id, pool_pick_id').eq('season_id', SEASON_ID).in('episode', locked.length ? locked : [-1])
          .or(`reward_pick_id.eq.${id},immunity_pick_id.eq.${id},going_home_pick_id.eq.${id},mop_pick_id.eq.${id},pool_pick_id.eq.${id}`),
        supabase.from('score_lines').select('manager_id, episode, slot, total, multiplier').eq('season_id', SEASON_ID).eq('survivor_id', id),
      ]);
      setS(sv.data as Survivor | null);
      setEvents((ev.data || []) as Event[]);
      setMopEps(((oc.data || []) as any[]).filter(o => (o.mop_winners || []).includes(id)).map(o => o.episode));
      setPicks(pk.data || []);
      setLines(ln.data || []);
      setLoading(false);
    })();
  }, [id, episodes]);

  // Only locked episodes' picks are public
  const lockedEps = useMemo(() => new Set(episodes.filter(e => Date.now() >= new Date(e.lock_at).getTime()).map(e => e.number)), [episodes]);
  const publicPicks = picks.filter(p => lockedEps.has(p.episode));
  const eps = useMemo(() => [...new Set(events.map(e => e.episode))].sort((a, b) => a - b), [events]);
  const perEp = eps.map(ep => ({ episode: ep, value: events.filter(e => e.episode === ep).reduce((a, e) => a + e.points, 0) }));
  const total = perEp.reduce((a, e) => a + e.value, 0);
  const wins = (cat: string) => new Set(events.filter(e => e.category === cat).map(e => e.episode)).size;

  const slotUsage = ROSTER_SLOTS.map(slot => {
    const ps = publicPicks.filter(p => p[COL[slot.key]] === id);
    const ls = lines.filter(l => l.slot === slot.key);
    return { slot, count: ps.length, hits: ls.filter(l => l.multiplier > 1).length, avg: ls.length ? Math.round((ls.reduce((a, l) => a + l.total, 0) / ls.length) * 10) / 10 : null, scoredCount: ls.length };
  });
  const poolUses = publicPicks.filter(p => p.pool_pick_id === id).length;

  if (loading) return <Page><Skeleton className="h-20 w-72 mb-4" /><Skeleton className="h-48 w-full" /></Page>;
  if (!s) return <Page><EmptyState title="Survivor not found." /></Page>;

  return (
    <Page width="lg">
      <div className="flex items-center gap-4 mb-5">
        <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={72} out={!s.is_active} />
        <div className="min-w-0">
          <div className="text-xs text-muted"><Link href="/survivors" className="hover:underline">Survivors</Link></div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{s.name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {s.full_name && s.full_name !== s.name && <span className="text-sm text-muted">{s.full_name}</span>}
            <TribeTag tribe={s.tribe} />
            {s.original_tribe && s.original_tribe !== s.tribe && <span className="text-xs text-faint">(originally {s.original_tribe})</span>}
            {s.is_active ? <Badge tone="positive">Still in</Badge> : <Badge tone="negative">Out E{s.eliminated_episode}{s.elimination_order ? ` · ${formatRank(placeFromEliminationOrder(s.elimination_order))}` : ''}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <StatTile label="FSG points" value={total} sub={eps.length ? `${Math.round((total / eps.length) * 10) / 10} per episode` : undefined} />
        <StatTile label="Immunity wins" value={wins('immunity')} />
        <StatTile label="Reward wins" value={wins('reward')} />
        <StatTile label="Most Other Points" value={mopEps.length} sub={mopEps.length ? mopEps.map(e => `E${e}`).join(', ') : undefined} />
        <StatTile label="Used in Pool" value={poolUses} sub="times (locked weeks)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title="FSG points by episode" />
            <EpisodeBars data={perEp} seriesLabel="FSG points" />
          </Card>
          <Card>
            <CardHeader title="Actions" subtitle="Straight from FSG's episode recaps" />
            {eps.length === 0 ? <p className="text-sm text-muted">No actions yet.</p> : (
              <div className="space-y-3">
                {[...eps].reverse().map(ep => (
                  <div key={ep}>
                    <div className="text-xs font-semibold text-muted mb-1">Episode {ep}</div>
                    {events.filter(e => e.episode === ep).map((e, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm py-0.5">
                        <span className="text-ink">{e.action} <span className="text-xs text-faint">{CAT[e.category]}</span></span>
                        <span className="num font-semibold text-ink">{e.category === 'departure' ? '—' : e.points > 0 ? `+${e.points}` : e.points}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="How the league played them" subtitle="Locked cards only" />
          <div className="space-y-2.5">
            {slotUsage.map(u => (
              <div key={u.slot.key} className="flex items-center gap-2 text-sm">
                <span className="w-5">{u.slot.icon}</span>
                <span className="flex-1 text-ink">{u.slot.label}</span>
                <span className="text-muted num text-xs">{u.count} pick{u.count === 1 ? '' : 's'}{u.scoredCount ? ` · ${u.hits}/${u.scoredCount} hit · avg ${u.avg}` : ''}</span>
              </div>
            ))}
          </div>
          {publicPicks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <div className="text-xs font-semibold text-muted mb-1.5">Picked by</div>
              <div className="space-y-1">
                {publicPicks.sort((a, b) => b.episode - a.episode).slice(0, 12).map((p, i) => {
                  const slot = ROSTER_SLOTS.find(sl => p[COL[sl.key]] === id);
                  const line = lines.find(l => l.manager_id === p.manager_id && l.episode === p.episode && slot && l.slot === slot.key);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-faint">E{p.episode}</span>
                      <Link href={`/managers/${p.manager_id}`} className="flex-1 text-ink hover:underline truncate">{managers.find(m => m.id === p.manager_id)?.name}</Link>
                      <span className="text-muted">{slot ? slot.label : 'Pool'}</span>
                      {line && <span className={cn('num font-semibold w-8 text-right', line.total < 0 ? 'text-negative' : line.multiplier > 1 ? 'text-positive' : 'text-ink')}>{line.total > 0 ? `+${line.total}` : line.total}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
