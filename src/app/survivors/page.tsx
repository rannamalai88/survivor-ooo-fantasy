'use client';

// ============================================================
// Survivors — /survivors
// Cast cards (points, status, form) or the per-episode points table.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useSeason } from '@/hooks/useSeason';
import { SEASON_ID, SEASON_NUMBER, placeFromEliminationOrder } from '@/lib/constants';
import { formatRank } from '@/lib/utils';
import { Page, PageHeader, Card, Segmented, SurvivorAvatar, TribeTag, Badge, Skeleton, EmptyState, cn } from '@/components/ui';
import { IconExternal } from '@/components/ui/icons';

interface Survivor { id: string; name: string; full_name: string | null; tribe: string; original_tribe: string | null; is_active: boolean; eliminated_episode: number | null; elimination_order: number | null; photo_url: string | null }
interface Event { survivor_id: string; episode: number; points: number; category: string }
interface Outcome { episode: number; mop_winners: string[] }

export default function SurvivorsPage() {
  const { season } = useSeason();
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [tribe, setTribe] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: e }, { data: o }] = await Promise.all([
        supabase.from('survivors').select('id, name, full_name, tribe, original_tribe, is_active, eliminated_episode, elimination_order, photo_url').eq('season_id', SEASON_ID).eq('is_playable', true),
        supabase.from('episode_events').select('survivor_id, episode, points, category').eq('season_id', SEASON_ID),
        supabase.from('episode_outcomes').select('episode, mop_winners').eq('season_id', SEASON_ID),
      ]);
      setSurvivors((s || []) as Survivor[]); setEvents((e || []) as Event[]); setOutcomes((o || []) as Outcome[]);
      setLoading(false);
    })();
  }, []);

  const episodes = useMemo(() => [...new Set(events.map(e => e.episode))].sort((a, b) => a - b), [events]);
  const lastEp = episodes[episodes.length - 1];
  const stats = useMemo(() => new Map(survivors.map(s => {
    const mine = events.filter(e => e.survivor_id === s.id);
    return [s.id, {
      total: mine.reduce((a, e) => a + e.points, 0),
      last: lastEp ? mine.filter(e => e.episode === lastEp).reduce((a, e) => a + e.points, 0) : 0,
      rew: new Set(mine.filter(e => e.category === 'reward').map(e => e.episode)).size,
      imm: new Set(mine.filter(e => e.category === 'immunity').map(e => e.episode)).size,
      mop: outcomes.filter(o => o.mop_winners.includes(s.id)).length,
      byEp: Object.fromEntries(episodes.map(ep => [ep, mine.filter(e => e.episode === ep)])) as Record<number, Event[]>,
    }];
  })), [survivors, events, outcomes, episodes, lastEp]);

  const tribes = useMemo(() => [...new Set(survivors.map(s => s.original_tribe || s.tribe))].sort(), [survivors]);
  const rows = useMemo(() => survivors
    .filter(s => tribe === 'All' || (s.original_tribe || s.tribe) === tribe)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || (stats.get(b.id)!.total - stats.get(a.id)!.total) || a.name.localeCompare(b.name)), [survivors, tribe, stats]);
  const activeCount = survivors.filter(s => s.is_active).length;

  return (
    <Page width="xl">
      <PageHeader title="Survivors" subtitle={`${season?.name ?? ''} · ${activeCount} of ${survivors.length} still in the game`}
        actions={<a href={`https://www.fantasysurvivorgame.com/episode-recap/season/${SEASON_NUMBER}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">FSG recap <IconExternal size={14} /></a>} />

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Segmented value={tribe} onChange={setTribe} options={['All', ...tribes].map(t => ({ value: t, label: t }))} />
        <Segmented value={view} onChange={setView} options={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Points table' }]} />
      </div>

      {loading ? <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        : survivors.length === 0 ? <EmptyState title="No survivors yet." />
        : view === 'cards' ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map(s => {
              const st = stats.get(s.id)!;
              const out = !s.is_active;
              return (
                <Link key={s.id} href={`/survivors/${s.id}`} className="group">
                  <Card className={cn('h-full transition-colors group-hover:border-accent/40', out && 'opacity-75')}>
                    <div className="flex items-center gap-3 mb-3">
                      <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={44} out={out} />
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate">{s.name}</div>
                        {out ? <Badge tone="negative">Out · E{s.eliminated_episode}</Badge> : <TribeTag tribe={s.tribe} />}
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-bold tracking-tight text-ink num">{st.total}</div>
                        <div className="text-[11px] text-muted">FSG pts{lastEp ? ` · ${st.last >= 0 ? '+' : ''}${st.last} in E${lastEp}` : ''}</div>
                      </div>
                      <div className="text-right text-[11px] text-muted leading-relaxed">
                        {st.imm > 0 && <div>🗿 {st.imm}</div>}
                        {st.rew > 0 && <div>🍖 {st.rew}</div>}
                        {st.mop > 0 && <div>📈 {st.mop}</div>}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card padded={false} className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Survivor</th>{episodes.map(ep => <th key={ep} className="text-right">E{ep}</th>)}<th className="text-right">Total</th></tr></thead>
              <tbody>
                {rows.map(s => {
                  const st = stats.get(s.id)!;
                  return (
                    <tr key={s.id}>
                      <td><Link href={`/survivors/${s.id}`} className="flex items-center gap-2 hover:underline decoration-line underline-offset-4"><SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={24} out={!s.is_active} /><span className={s.is_active ? 'text-ink font-medium' : 'text-muted'}>{s.name}</span></Link></td>
                      {episodes.map(ep => {
                        const acts = st.byEp[ep] || [];
                        const gone = s.eliminated_episode !== null && ep > s.eliminated_episode;
                        const pts = acts.reduce((a, e) => a + e.points, 0);
                        const left = acts.some(a => a.category === 'departure');
                        const mop = outcomes.find(o => o.episode === ep)?.mop_winners.includes(s.id);
                        return (
                          <td key={ep} className={cn('text-right', left && 'bg-negative/10')}>
                            {gone ? <span className="text-faint">·</span> : <span className="inline-flex items-center gap-1 justify-end">
                              <span className={cn('num font-semibold', pts > 0 ? 'text-ink' : 'text-faint')}>{pts}</span>
                              <span className="text-[10px]">{acts.some(a => a.category === 'immunity') && '🗿'}{acts.some(a => a.category === 'reward') && '🍖'}{mop && '📈'}{left && '🔥'}</span>
                            </span>}
                          </td>
                        );
                      })}
                      <td className="num text-right font-bold text-ink">{st.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 text-xs text-muted border-t border-line">🗿 immunity win · 🍖 reward win · 📈 most Other points · 🔥 left the game</div>
          </Card>
        )}
      {survivors.some(s => !s.is_active && s.elimination_order) && view === 'cards' && (
        <p className="text-xs text-muted mt-4">Boot order: {survivors.filter(s => s.elimination_order && !s.is_active).sort((a, b) => a.elimination_order! - b.elimination_order!).map(s => `${s.name} (${formatRank(placeFromEliminationOrder(s.elimination_order!))})`).join(' · ')}</p>
      )}
    </Page>
  );
}
