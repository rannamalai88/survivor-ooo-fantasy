'use client';

// ============================================================
// Survivor Pool — /pool
// Board of every manager's pool path (same walk as the scoring engine,
// lib/pool.ts), your unused survivors, and pick popularity.
// Only locked episodes' picks are fetched.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useSeasonContext } from '@/lib/season-context';
import { SEASON_ID, PLACEMENT_CURVE, WEIGHTS } from '@/lib/constants';
import { walkPool, type PoolWeek } from '@/lib/pool';
import { Page, PageHeader, Card, CardHeader, StatTile, Badge, SurvivorAvatar, ManagerAvatar, Skeleton, cn } from '@/components/ui';

interface Survivor { id: string; name: string; tribe: string; photo_url: string | null; is_active: boolean; eliminated_episode: number | null }
interface PoolRow { manager_id: string; status: string; weeks_survived: number; has_immunity_idol: boolean }
interface PickRow { manager_id: string; episode: number; pool_pick_id: string | null; pool_backdoor_id: string | null }

const CELL: Record<PoolWeek['type'], { cls: string; icon: string; title: string }> = {
  safe: { cls: 'bg-positive/10 text-ink', icon: '✓', title: 'Safe' },
  idol: { cls: 'bg-accent/15 text-ink', icon: '🛡️', title: 'Pick eliminated — saved by the Dynasty Idol' },
  drowned: { cls: 'bg-negative/15 text-ink', icon: '💀', title: 'Drowned — pick eliminated' },
  missed: { cls: 'bg-negative/15 text-negative', icon: '💀', title: 'No pick — auto-drowned' },
  backdoor_hit: { cls: 'bg-positive/15 text-ink', icon: '↩', title: 'Backdoor hit — back in' },
  backdoor_miss: { cls: 'bg-raised text-muted', icon: '🚪', title: 'Backdoor missed' },
  none: { cls: 'text-faint', icon: '', title: '' },
};
const STATUS_TONE: Record<string, 'positive' | 'negative' | 'neutral' | 'accent'> = { active: 'positive', finished: 'accent', drowned: 'negative', burnt: 'neutral' };

export default function PoolPage() {
  const { manager, managers } = useAuth();
  const { season, episodes } = useSeasonContext();
  const [pool, setPool] = useState<PoolRow[]>([]);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [myPicks, setMyPicks] = useState<PickRow[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [champ, setChamp] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const lockedEps = useMemo(() => episodes.filter(e => e.number >= 2 && Date.now() >= new Date(e.lock_at).getTime()).map(e => e.number), [episodes]);

  useEffect(() => {
    if (!episodes.length || !manager) return;
    (async () => {
      const [p, pk, mine, sv, tot] = await Promise.all([
        supabase.from('pool_status').select('manager_id, status, weeks_survived, has_immunity_idol').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('manager_id, episode, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).in('episode', lockedEps.length ? lockedEps : [-1]),
        supabase.from('weekly_picks').select('manager_id, episode, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).eq('manager_id', manager.id),
        supabase.from('survivors').select('id, name, tribe, photo_url, is_active, eliminated_episode').eq('season_id', SEASON_ID).eq('is_playable', true).order('name'),
        supabase.from('manager_totals').select('manager_id, champ_pool').eq('season_id', SEASON_ID),
      ]);
      setPool((p.data || []) as PoolRow[]);
      setPicks((pk.data || []) as PickRow[]);
      setMyPicks((mine.data || []) as PickRow[]);
      setSurvivors((sv.data || []) as Survivor[]);
      setChamp(Object.fromEntries((tot.data || []).map((t: any) => [t.manager_id, Number(t.champ_pool)])));
      setLoading(false);
    })();
  }, [episodes, manager, lockedEps]);

  const survMap = useMemo(() => new Map(survivors.map(s => [s.id, s])), [survivors]);
  const through = lockedEps.length ? Math.max(...lockedEps) : 1;
  const board = useMemo(() => managers.map(m => {
    const byEp: Record<number, PickRow> = {};
    picks.filter(p => p.manager_id === m.id).forEach(p => { byEp[p.episode] = p; });
    const ps = pool.find(p => p.manager_id === m.id);
    const walk = walkPool(byEp, survMap, !!ps?.has_immunity_idol, through);
    return { m, status: ps?.status || 'active', walk, hasIdol: !!ps?.has_immunity_idol };
  }).sort((a, b) => b.walk.weeksSurvived - a.walk.weeksSurvived || a.m.name.localeCompare(b.m.name)), [managers, picks, pool, survMap, through]);

  const counts = { active: 0, drowned: 0, finished: 0, burnt: 0 } as Record<string, number>;
  board.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });
  const myUsed = new Set(myPicks.map(p => p.pool_pick_id).filter(Boolean) as string[]);
  const myStatus = board.find(b => b.m.id === manager?.id);
  const available = survivors.filter(s => s.is_active && !myUsed.has(s.id));
  const popularity = useMemo(() => {
    const c = new Map<string, number>();
    picks.forEach(p => { if (p.pool_pick_id) c.set(p.pool_pick_id, (c.get(p.pool_pick_id) || 0) + 1); });
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [picks]);
  const shownEps = episodes.filter(e => lockedEps.includes(e.number));

  return (
    <Page width="xl">
      <PageHeader title="Survivor Pool" subtitle="Pick someone who survives each week. One use per survivor. Missed pick = drowned." />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatTile label="Active" value={counts.active || 0} />
        <StatTile label="Drowned" value={counts.drowned || 0} sub="can Backdoor back in" />
        <StatTile label="Finished" value={counts.finished || 0} />
        <StatTile label="Burnt" value={counts.burnt || 0} />
      </div>

      {loading ? <Skeleton className="h-80 w-full" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card padded={false} className="lg:col-span-2 overflow-x-auto">
            <div className="px-4 pt-4 sm:px-5"><CardHeader title="The board" subtitle={season && lockedEps.length === 0 ? 'Picks appear here once Episode 2 locks.' : `Picks for Episode ${season?.current_episode} appear when they lock`} /></div>
            <table className="data-table">
              <thead><tr><th>Manager</th><th>Status</th>{shownEps.map(e => <th key={e.number} className="text-center">E{e.number}</th>)}<th className="text-right">Weeks</th><th className="text-right">Champ</th></tr></thead>
              <tbody>
                {board.map(({ m, status, walk, hasIdol }) => (
                  <tr key={m.id} className={cn(m.id === manager?.id && 'bg-accent/[0.07]')}>
                    <td>
                      <Link href={`/managers/${m.id}`} className="flex items-center gap-2 hover:underline decoration-line underline-offset-4">
                        <ManagerAvatar name={m.name} size={24} me={m.id === manager?.id} />
                        <span className="font-medium text-ink">{m.name}</span>
                        {hasIdol && <span title={walk.idolUsed ? `Dynasty Idol used in E${walk.idolEpisode}` : 'Holds the Dynasty Idol'} className={walk.idolUsed ? 'opacity-40' : ''}>🛡️</span>}
                      </Link>
                    </td>
                    <td><Badge tone={STATUS_TONE[status] || 'neutral'}>{status}</Badge></td>
                    {shownEps.map(e => {
                      const w = walk.weeks.find(x => x.episode === e.number);
                      const c = CELL[w?.type ?? 'none'];
                      const s = w?.survivorId ? survMap.get(w.survivorId) : undefined;
                      return (
                        <td key={e.number} className="text-center">
                          {w && w.type !== 'none' ? (
                            <span title={c.title} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium', c.cls)}>
                              {s?.name ?? 'No pick'} <span className="text-[10px]">{c.icon}</span>
                            </span>
                          ) : <span className="text-faint">·</span>}
                        </td>
                      );
                    })}
                    <td className="num text-right font-bold text-ink">{walk.weeksSurvived}</td>
                    <td className="num text-right text-muted">{champ[m.id] !== undefined ? Math.round(champ[m.id] * 100) / 100 : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 sm:px-5 py-3 border-t border-line text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
              <span>✓ safe</span><span>💀 drowned / no pick</span><span>🛡️ idol save</span><span>↩ backdoor hit</span><span>🚪 backdoor miss</span>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Your survivors left" subtitle={myStatus?.status === 'drowned' ? "You're drowned — make a Backdoor pick on your card to get back in" : `${available.length} you haven't used`} />
              <div className="flex flex-wrap gap-1.5">
                {available.map(s => (
                  <Link key={s.id} href={`/survivors/${s.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-raised pl-0.5 pr-2.5 py-0.5 text-xs font-medium text-ink hover:bg-line/60">
                    <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={20} />{s.name}
                  </Link>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Most-used pool picks" subtitle="Locked weeks" />
              {popularity.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
                <div className="space-y-1.5">
                  {popularity.map(([id, n]) => {
                    const s = survMap.get(id);
                    return (
                      <div key={id} className="flex items-center gap-2 text-sm">
                        {s && <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={22} out={!s.is_active} />}
                        <span className="flex-1 text-ink">{s?.name}</span>
                        <div className="w-24 h-1.5 rounded-full bg-raised overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(n / managers.length) * 100}%`, background: 'rgb(var(--c-chart-hi))' }} /></div>
                        <span className="num text-xs text-muted w-5 text-right">{n}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card className="text-sm text-muted leading-relaxed">
              <b className="text-ink">How the Pool counts.</b> Managers are ranked by weeks survived; that rank earns {PLACEMENT_CURVE[0]} down to 0 championship points × {WEIGHTS.pool}. Ties split the points. The Dynasty Idol saves its holder&apos;s first eliminated pick.
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
