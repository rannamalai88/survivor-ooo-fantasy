'use client';

// ============================================================
// Dynasty — final individual rank each season, all-time.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { SEASON_ID } from '@/lib/constants';
import { formatRank } from '@/lib/utils';
import { Page, PageHeader, Card, CardHeader, ManagerAvatar, Skeleton, cn } from '@/components/ui';
import { RankLines } from '@/components/charts';

interface Row { manager_id: string; season_label: string; rank: number }

export default function DynastyPage() {
  const { manager: me } = useAuth();
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // dynasty_rankings.manager_id points at whichever season's managers row the
      // view joins to (S50 ids today). Managers are season-scoped, so match on name.
      const [cur, all, dyn] = await Promise.all([
        supabase.from('managers').select('id, name').eq('season_id', SEASON_ID).order('name'),
        supabase.from('managers').select('id, name'),
        supabase.from('dynasty_rankings').select('manager_id, season_label, rank').order('season_label'),
      ]);
      const current = cur.data || [];
      const nameById = new Map((all.data || []).map((m: any) => [m.id, m.name]));
      const idByName = new Map(current.map((m: any) => [m.name, m.id]));
      setManagers(current);
      // The view returns one row per managers row sharing a name (one per season); keep one per manager+season.
      const seen = new Set<string>();
      setRows(((dyn.data || []) as Row[])
        .map(d => ({ ...d, manager_id: idByName.get(nameById.get(d.manager_id)) ?? d.manager_id }))
        .filter(d => { const k = `${d.manager_id}|${d.season_label}`; if (seen.has(k)) return false; seen.add(k); return true; }));
      setLoading(false);
    })();
  }, []);

  const seasons = useMemo(() => [...new Set(rows.map(r => r.season_label))].sort(), [rows]);
  const seasonIdx = (label: string) => seasons.indexOf(label);
  const stats = useMemo(() => managers.map(m => {
    const ranks: Record<string, number> = {};
    rows.filter(r => r.manager_id === m.id).forEach(r => { ranks[r.season_label] = r.rank; });
    const vals = Object.values(ranks);
    return {
      ...m, ranks,
      avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
      titles: vals.filter(v => v === 1).length,
      podiums: vals.filter(v => v <= 3).length,
      seasons: vals.length,
    };
  }).sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99)), [managers, rows]);

  const highlight = focus ?? me?.id ?? null;
  const champions = seasons.map(s => ({ s, name: managers.find(m => m.id === rows.find(r => r.season_label === s && r.rank === 1)?.manager_id)?.name }));

  return (
    <Page width="lg">
      <PageHeader title="Dynasty" subtitle={`Final rank every season · ${seasons.length} seasons · lower is better`} />

      {loading ? <Skeleton className="h-96 w-full" /> : (<>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 mb-4">
          {champions.map(c => (
            <div key={c.s} className="shrink-0 rounded-xl bg-surface border border-line px-3 py-2 text-center min-w-[84px]">
              <div className="text-[11px] text-muted">{c.s}</div>
              <div className="text-sm font-semibold text-ink">🥇 {c.name ?? '—'}</div>
            </div>
          ))}
        </div>

        {seasons.length > 1 && (
          <Card className="mb-4">
            <CardHeader title="Rank by season" subtitle={`${managers.find(m => m.id === highlight)?.name ?? 'Tap a manager'} highlighted · tap a row below to switch`} />
            <RankLines
              series={stats.map(s => ({ id: s.id, name: s.name, points: Object.entries(s.ranks).map(([label, rank]) => ({ episode: seasonIdx(label), rank })) }))}
              highlightId={highlight}
              episodes={seasons.map((_, i) => i)}
              total={12}
              xLabel={i => seasons[i]}
              tooltipTitle={i => seasons[i]}
              highlightLabel={managers.find(m => m.id === highlight)?.name ?? ''}
            />
          </Card>
        )}

        <Card padded={false} className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Manager</th>{seasons.map(s => <th key={s} className="text-center">{s}</th>)}<th className="text-right">Avg</th><th className="text-right">🥇</th><th className="text-right">Top 3</th></tr></thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.id} onClick={() => setFocus(s.id)} className={cn('cursor-pointer', s.id === highlight && 'bg-accent/[0.07]')}>
                  <td><span className="flex items-center gap-2"><ManagerAvatar name={s.name} size={24} me={s.id === me?.id} /><Link href={`/managers/${s.id}`} onClick={e => e.stopPropagation()} className="font-medium text-ink hover:underline">{s.name}</Link></span></td>
                  {seasons.map(label => {
                    const r = s.ranks[label];
                    return (
                      <td key={label} className="text-center">
                        {r === undefined ? <span className="text-faint">—</span> : (
                          <span className={cn('inline-flex min-w-[32px] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold num',
                            r === 1 ? 'bg-accent/20 text-ink' : r <= 3 ? 'bg-positive/15 text-ink' : r >= 10 ? 'bg-negative/10 text-muted' : 'text-muted')}>
                            {r === 1 ? '🥇' : formatRank(r)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="num text-right font-bold text-ink">{s.avg ?? '—'}</td>
                  <td className="num text-right text-ink">{s.titles || '—'}</td>
                  <td className="num text-right text-muted">{s.podiums || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-line text-xs text-muted">Final individual standings each season. The current season is added when it concludes.</div>
        </Card>
      </>)}
    </Page>
  );
}
