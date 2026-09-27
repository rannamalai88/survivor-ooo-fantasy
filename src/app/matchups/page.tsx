'use client';

// ============================================================
// Matchups — /matchups?ep=N
// Before lock: every fixture with who has submitted (never what).
// After lock (episodes.lock_at): both cards side by side, slot by slot,
// plus pick popularity. Once scored: per-slot points and the result.
// ============================================================

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useSeasonContext } from '@/lib/season-context';
import { SEASON_ID, ROSTER_SLOTS, PICK_CHIPS, type RosterSlot } from '@/lib/constants';
import { Page, PageHeader, Card, Badge, SurvivorAvatar, ManagerAvatar, EmptyState, Skeleton, cn } from '@/components/ui';
import { IconChevronLeft, IconChevronRight, IconCheck, IconLock } from '@/components/ui/icons';

interface Survivor { id: string; name: string; tribe: string; photo_url: string | null }
interface Pick {
  manager_id: string; reward_pick_id: string | null; immunity_pick_id: string | null; going_home_pick_id: string | null;
  mop_pick_id: string | null; title_pick_id: string | null; chip: string | null; chip_slot: string | null; hedge_alt_id: string | null;
  pool_pick_id: string | null; pool_backdoor_id: string | null;
}
interface Line { manager_id: string; slot: string; survivor_id: string | null; total: number; multiplier: number }
interface Score { manager_id: string; card_total: number | null; h2h_points: number | null }

const COL: Record<RosterSlot, keyof Pick> = { reward: 'reward_pick_id', immunity: 'immunity_pick_id', going_home: 'going_home_pick_id', mop: 'mop_pick_id' };
const SHORT: Record<string, string> = { reward: 'Reward', immunity: 'Immunity', going_home: 'Going home', mop: 'MOP', title: 'Title' };

function MatchupsContent() {
  const { manager, managers } = useAuth();
  const { season, episodes } = useSeasonContext();
  const router = useRouter();
  const params = useSearchParams();
  const epParam = Number(params.get('ep')) || null;
  const selected = epParam ?? season?.current_episode ?? null;

  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [fixtures, setFixtures] = useState<{ id: string; manager_a: string; manager_b: string }[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);

  const ep = episodes.find(e => e.number === selected) || null;
  const isLocked = !!ep && now >= new Date(ep.lock_at).getTime();
  const scored = ep?.status === 'scored';

  useEffect(() => {
    supabase.from('survivors').select('id, name, tribe, photo_url').eq('season_id', SEASON_ID).then(({ data }) => setSurvivors((data || []) as Survivor[]));
  }, []);

  useEffect(() => {
    if (!ep) return;
    setLoading(true);
    (async () => {
      const fxP = ep.h2h_round
        ? supabase.from('fixtures').select('id, manager_a, manager_b').eq('season_id', SEASON_ID).eq('round', ep.h2h_round)
        : Promise.resolve({ data: [] as any[] });
      if (!isLocked) {
        // Before lock only fetch who submitted — never the picks themselves.
        const [{ data }, fx] = await Promise.all([supabase.from('weekly_picks').select('manager_id').eq('season_id', SEASON_ID).eq('episode', ep.number), fxP]);
        setSubmitted((data || []).map((r: any) => r.manager_id));
        setPicks([]); setLines([]); setScores([]);
        setFixtures(((fx as any).data || []) as any[]);
      } else {
        const [{ data: p }, { data: l }, { data: s }, fx] = await Promise.all([
          supabase.from('weekly_picks').select('manager_id, reward_pick_id, immunity_pick_id, going_home_pick_id, mop_pick_id, title_pick_id, chip, chip_slot, hedge_alt_id, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).eq('episode', ep.number),
          supabase.from('score_lines').select('manager_id, slot, survivor_id, total, multiplier').eq('season_id', SEASON_ID).eq('episode', ep.number),
          supabase.from('manager_scores').select('manager_id, card_total, h2h_points').eq('season_id', SEASON_ID).eq('episode', ep.number),
          fxP,
        ]);
        setPicks((p || []) as Pick[]);
        setSubmitted((p || []).map((r: any) => r.manager_id));
        setLines((l || []) as Line[]);
        setScores((s || []) as Score[]);
        setFixtures(((fx as any).data || []) as any[]);
      }
      setLoading(false);
    })();
  }, [ep?.number, isLocked]);

  const byId = useMemo(() => new Map(survivors.map(s => [s.id, s])), [survivors]);
  const nameOf = (id: string) => managers.find(m => m.id === id)?.name || '?';
  const groups = useMemo(() => {
    const g = fixtures.length ? fixtures.map(f => [f.manager_a, f.manager_b]) : managers.map(m => [m.id]);
    return g.sort((a, b) => Number(b.includes(manager?.id || '')) - Number(a.includes(manager?.id || '')));
  }, [fixtures, managers, manager]);

  // Pick popularity per slot (after lock)
  const popularity = useMemo(() => {
    if (!isLocked || !picks.length) return [];
    return ROSTER_SLOTS.map(slot => {
      const counts = new Map<string, number>();
      for (const p of picks) { const id = p[COL[slot.key]] as string | null; if (id) counts.set(id, (counts.get(id) || 0) + 1); }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { slot, top };
    });
  }, [picks, isLocked]);

  const playable = episodes.filter(e => e.number >= 2);
  const go = (n: number) => router.replace(`/matchups?ep=${n}`);
  const idx = playable.findIndex(e => e.number === selected);
  const lockLabel = ep ? new Date(ep.lock_at).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : '';

  const Pickline = ({ managerId, slot, align }: { managerId: string; slot: RosterSlot | 'title'; align: 'left' | 'right' }) => {
    const p = picks.find(x => x.manager_id === managerId);
    const id = slot === 'title' ? p?.title_pick_id : p ? (p[COL[slot]] as string | null) : null;
    const s = id ? byId.get(id) : undefined;
    const line = lines.find(l => l.manager_id === managerId && l.slot === slot);
    const chipHere = p?.chip && p.chip_slot === slot ? PICK_CHIPS.find(c => c.id === p.chip) : null;
    const hedge = p?.chip === 'hedge' && p.chip_slot === slot && p.hedge_alt_id ? byId.get(p.hedge_alt_id) : undefined;
    const counted = line?.survivor_id && line.survivor_id !== id ? byId.get(line.survivor_id) : undefined;   // hedge backup counted
    if (!p) return <div className={cn('flex-1 min-w-0 text-xs text-faint', align === 'right' && 'text-right')}>—</div>;
    return (
      <div className={cn('flex-1 min-w-0 flex items-center gap-2', align === 'right' && 'flex-row-reverse text-right')}>
        {s ? <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={26} /> : <span className="h-[26px] w-[26px] rounded-full bg-raised shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink truncate">{s?.name ?? 'No pick'}{chipHere && <span className="ml-1" title={chipHere.name}>{chipHere.icon}</span>}</div>
          {hedge && <div className="text-[10px] text-muted truncate">Hedge: {hedge.name}{counted ? ' (counted)' : ''}</div>}
        </div>
        {scored && line && (
          <span className={cn('num text-sm font-bold shrink-0', line.total < 0 ? 'text-negative' : line.multiplier > 1 ? 'text-positive' : line.total === 0 ? 'text-faint' : 'text-ink')}>
            {line.total > 0 ? `+${line.total}` : line.total}
          </span>
        )}
      </div>
    );
  };

  return (
    <Page width="lg">
      <PageHeader title="Matchups" subtitle={ep ? (isLocked ? (scored ? 'Scored — tap a total for the full breakdown.' : `Cards locked ${lockLabel}. Scores land after the FSG pull.`) : `Cards are revealed when picks lock · ${lockLabel}`) : undefined}
        actions={
          <div className="flex items-center gap-1">
            <button disabled={idx <= 0} onClick={() => go(playable[idx - 1].number)} className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-muted hover:bg-raised disabled:opacity-30" aria-label="Previous episode"><IconChevronLeft size={18} /></button>
            <select value={selected ?? ''} onChange={e => go(Number(e.target.value))} className="h-9 rounded-lg bg-raised border border-line px-2 text-sm font-semibold text-ink">
              {playable.map(e => <option key={e.number} value={e.number}>Episode {e.number}</option>)}
            </select>
            <button disabled={idx < 0 || idx >= playable.length - 1} onClick={() => go(playable[idx + 1].number)} className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-muted hover:bg-raised disabled:opacity-30" aria-label="Next episode"><IconChevronRight size={18} /></button>
          </div>
        } />

      <div className="flex gap-2 flex-wrap mb-4">
        {ep?.h2h_round && <Badge>Round {ep.h2h_round}</Badge>}
        {ep?.is_couples_week && <Badge tone="accent">💞 Couples Week</Badge>}
        {ep?.is_rivalry_week && <Badge tone="negative">⚔️ Rivalry Week</Badge>}
        {ep && !isLocked && <Badge tone="neutral"><IconLock size={12} />{submitted.length}/{managers.length} cards in</Badge>}
      </div>

      {loading || !ep ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : !isLocked ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map(g => (
            <Card key={g.join('-')} className={cn(g.includes(manager?.id || '') && 'ring-2 ring-accent/40')}>
              <div className="flex items-center justify-between gap-2">
                {g.map((id, i) => (
                  <div key={id} className={cn('flex items-center gap-2 min-w-0', i === 1 && 'flex-row-reverse text-right')}>
                    <ManagerAvatar name={nameOf(id)} size={32} me={id === manager?.id} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{nameOf(id)}</div>
                      <div className={cn('text-[11px] font-medium inline-flex items-center gap-1', submitted.includes(id) ? 'text-positive' : 'text-faint')}>
                        {submitted.includes(id) ? <><IconCheck size={12} />Card in</> : 'Not yet'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {popularity.length > 0 && (
            <div className="mb-4 -mx-4 px-4 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {popularity.map(({ slot, top }) => (
                  <div key={slot.key} className="rounded-xl bg-surface border border-line px-3 py-2 min-w-[150px]">
                    <div className="text-[11px] font-semibold text-muted mb-1">{slot.icon} Most picked · {SHORT[slot.key]}</div>
                    {top.length === 0 ? <div className="text-xs text-faint">—</div> : top.map(([id, n]) => {
                      const s = byId.get(id);
                      return (
                        <div key={id} className="flex items-center gap-1.5 text-xs py-0.5">
                          {s && <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={18} />}
                          <span className="text-ink flex-1 truncate">{s?.name}</span>
                          <span className="num text-muted">{Math.round((n / picks.length) * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {picks.length === 0 ? <EmptyState icon="🃏" title="No cards were submitted for this episode." /> : (
            <div className="grid gap-3 lg:grid-cols-2">
              {groups.map(g => {
                const [a, b] = g;
                const sa = scores.find(s => s.manager_id === a)?.card_total ?? null;
                const sb = b ? scores.find(s => s.manager_id === b)?.card_total ?? null : null;
                const winA = scored && sa !== null && sb !== null && sa > sb, winB = scored && sa !== null && sb !== null && sb > sa;
                const mine = g.includes(manager?.id || '');
                return (
                  <Card key={g.join('-')} padded={false} className={cn(mine && 'ring-2 ring-accent/40')}>
                    {/* Header: names + totals */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                      {[a, b].filter(Boolean).map((id, i) => {
                        const total = i === 0 ? sa : sb;
                        const won = i === 0 ? winA : winB;
                        return (
                          <Link key={id} href={scored ? `/breakdown/${id}/${ep.number}` : `/managers/${id}`} className={cn('flex-1 min-w-0 flex items-center gap-2', i === 1 && 'flex-row-reverse text-right')}>
                            <ManagerAvatar name={nameOf(id!)} size={30} me={id === manager?.id} />
                            <div className="min-w-0">
                              <div className={cn('text-sm truncate', won ? 'font-bold text-ink' : 'font-semibold text-ink')}>{nameOf(id!)}</div>
                              {won && <div className="text-[10px] font-bold text-positive">WIN</div>}
                            </div>
                            {scored && total !== null && <div className={cn('text-2xl font-bold tracking-tight num ml-auto', i === 1 && 'ml-0 mr-auto', total < 0 ? 'text-negative' : won ? 'text-ink' : 'text-muted')}>{total}</div>}
                          </Link>
                        );
                      })}
                    </div>
                    {/* Slot rows */}
                    <div className="divide-y divide-line">
                      {[...ROSTER_SLOTS.map(s => s.key), 'title' as const].map(slot => (
                        <div key={slot} className="flex items-center gap-2 px-3 py-2">
                          <Pickline managerId={a} slot={slot} align="left" />
                          <div className="w-14 shrink-0 text-center text-[10px] font-semibold text-faint uppercase tracking-wide leading-tight">{SHORT[slot]}</div>
                          {b ? <Pickline managerId={b} slot={slot} align="right" /> : <div className="flex-1" />}
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

export default function MatchupsPage() {
  return <Suspense fallback={null}><MatchupsContent /></Suspense>;
}
