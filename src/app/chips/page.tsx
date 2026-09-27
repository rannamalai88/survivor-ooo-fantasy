'use client';

// ============================================================
// Chips — who has played which S51 chip, and when.
// Only locked episodes are fetched, so nobody sees a chip before lock.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useSeasonContext } from '@/lib/season-context';
import { SEASON_ID, PICK_CHIPS, ROSTER_SLOTS, CHIP_FIRST_EP, CHIP_LAST_EP } from '@/lib/constants';
import { Page, PageHeader, Card, Badge, ManagerAvatar, Skeleton, cn } from '@/components/ui';

interface Played { manager_id: string; episode: number; chip: string; chip_slot: string | null }

export default function ChipsPage() {
  const { manager, managers } = useAuth();
  const { season, episodes } = useSeasonContext();
  const [played, setPlayed] = useState<Played[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!episodes.length) return;
    const locked = episodes.filter(e => Date.now() >= new Date(e.lock_at).getTime()).map(e => e.number);
    supabase.from('weekly_picks').select('manager_id, episode, chip, chip_slot').eq('season_id', SEASON_ID).not('chip', 'is', null).in('episode', locked.length ? locked : [-1])
      .then(({ data }) => { setPlayed((data || []) as Played[]); setLoading(false); });
  }, [episodes]);

  const slotLabel = (k: string | null) => ROSTER_SLOTS.find(s => s.key === k)?.label;
  const left = season ? Math.max(0, CHIP_LAST_EP - Math.max(season.current_episode, CHIP_FIRST_EP) + 1) : 0;
  const counts = useMemo(() => Object.fromEntries(PICK_CHIPS.map(c => [c.id, played.filter(p => p.chip === c.id).length])), [played]);

  return (
    <Page width="lg">
      <PageHeader title="Chips" subtitle={`Episodes ${CHIP_FIRST_EP}–${CHIP_LAST_EP} · one per episode · each once per season · ${left} episode${left === 1 ? '' : 's'} left to play them`} />

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        {PICK_CHIPS.map(c => (
          <Card key={c.id}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">{c.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <Badge>{counts[c.id] || 0} played</Badge>
                </div>
                <p className="text-sm text-muted mt-1">{c.desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {loading ? <Skeleton className="h-72 w-full" /> : (
        <Card padded={false} className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Manager</th>{PICK_CHIPS.map(c => <th key={c.id}>{c.icon} {c.name}</th>)}</tr></thead>
            <tbody>
              {managers.map(m => (
                <tr key={m.id} className={cn(m.id === manager?.id && 'bg-accent/[0.07]')}>
                  <td><Link href={`/managers/${m.id}`} className="flex items-center gap-2 hover:underline decoration-line underline-offset-4"><ManagerAvatar name={m.name} size={24} me={m.id === manager?.id} /><span className="font-medium text-ink">{m.name}</span></Link></td>
                  {PICK_CHIPS.map(c => {
                    const p = played.find(x => x.manager_id === m.id && x.chip === c.id);
                    return (
                      <td key={c.id}>
                        {p ? <Link href={`/breakdown/${m.id}/${p.episode}`} className="text-ink hover:underline">E{p.episode}{p.chip_slot && <span className="text-muted"> · {slotLabel(p.chip_slot)}</span>}</Link> : <span className="text-faint">available</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-line text-xs text-muted">Chips show up here once their episode&apos;s picks lock.</div>
        </Card>
      )}
    </Page>
  );
}
