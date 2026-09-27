'use client';

// ============================================================
// Weekly recap — /recap/[episode]
// Superlatives, results, popular picks, chips, Title, Pool.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSeasonContext } from '@/lib/season-context';
import { loadRecap, type Recap } from '@/lib/recap';
import { SEASON_NUMBER } from '@/lib/constants';
import { Page, PageHeader, Card, CardHeader, StatTile, Badge, EmptyState, Skeleton, cn } from '@/components/ui';
import { IconChevronLeft, IconChevronRight, IconExternal } from '@/components/ui/icons';

export default function RecapPage() {
  const params = useParams<{ episode: string }>();
  const router = useRouter();
  const episode = Number(params.episode);
  const { episodes } = useSeasonContext();
  const [recap, setRecap] = useState<Recap | null | undefined>(undefined);

  useEffect(() => { setRecap(undefined); loadRecap(episode).then(setRecap).catch(() => setRecap(null)); }, [episode]);

  const scored = episodes.filter(e => e.status === 'scored').map(e => e.number);
  const i = scored.indexOf(episode);

  return (
    <Page width="lg">
      <PageHeader eyebrow="Weekly recap" title={`Episode ${episode}`}
        actions={
          <div className="flex items-center gap-1">
            <button disabled={i <= 0} onClick={() => router.push(`/recap/${scored[i - 1]}`)} className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-muted hover:bg-raised disabled:opacity-30" aria-label="Previous"><IconChevronLeft size={18} /></button>
            <button disabled={i < 0 || i >= scored.length - 1} onClick={() => router.push(`/recap/${scored[i + 1]}`)} className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-muted hover:bg-raised disabled:opacity-30" aria-label="Next"><IconChevronRight size={18} /></button>
          </div>
        } />

      {recap === undefined ? <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>
        : recap === null ? <EmptyState icon="📺" title={`Episode ${episode} hasn't been scored yet.`}>The recap appears once the commissioner scores the episode.</EmptyState>
        : (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            {recap.highCard && <StatTile label="🔥 High card" value={recap.highCard.total} sub={recap.highCard.name} href={`/breakdown/${recap.highCard.managerId}/${episode}`} />}
            {recap.lowCard && <StatTile label="🧊 Low card" value={recap.lowCard.total} sub={recap.lowCard.name} href={`/breakdown/${recap.lowCard.managerId}/${episode}`} />}
            {recap.blowout && <StatTile label="💥 Biggest win" value={`+${recap.blowout.margin}`} sub={`${recap.blowout.winner.name} ${recap.blowout.winnerScore}–${recap.blowout.loserScore} ${recap.blowout.loser.name}`} />}
            {recap.closest && <StatTile label="😬 Closest" value={recap.closest.margin === 0 ? 'Draw' : `${recap.closest.margin} pt${recap.closest.margin === 1 ? '' : 's'}`} sub={`${recap.closest.a.name} ${recap.closest.aScore}–${recap.closest.bScore} ${recap.closest.b.name}`} />}
            {recap.bestLine && <StatTile label="⭐ Best single pick" value={`+${recap.bestLine.total}`} sub={`${recap.bestLine.name}: ${recap.bestLine.survivorName} (${recap.bestLine.slot})`} href={`/breakdown/${recap.bestLine.managerId}/${episode}`} />}
            {recap.worstLine && <StatTile label="💀 Worst single pick" value={recap.worstLine.total} sub={`${recap.worstLine.name}: ${recap.worstLine.survivorName} (${recap.worstLine.slot})`} href={`/breakdown/${recap.worstLine.managerId}/${episode}`} />}
            <StatTile label="📊 League average" value={recap.average} sub={`${recap.cards.length} cards`} />
            <StatTile label="🌊 Pool survivors" value={recap.pool.stillActive} sub="still active" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card padded={false}>
              <div className="px-4 pt-4 sm:px-5"><CardHeader title="Every card" subtitle="Tap for the breakdown" /></div>
              <ol className="divide-y divide-line">
                {recap.cards.map((c, n) => (
                  <li key={c.managerId}>
                    <Link href={`/breakdown/${c.managerId}/${episode}`} className="flex items-center gap-3 px-4 sm:px-5 py-2 hover:bg-raised/50">
                      <span className="w-6 text-xs text-muted num">{n + 1}</span>
                      <span className="flex-1 text-sm text-ink">{c.name}</span>
                      <span className={cn('num font-bold', c.total < 0 ? 'text-negative' : 'text-ink')}>{c.total}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Most popular picks" subtitle="And how they paid off" />
                <div className="space-y-2">
                  {recap.popular.map(p => (
                    <div key={p.slot} className="flex items-center gap-2 text-sm">
                      <span className="w-28 text-muted text-xs">{p.label}</span>
                      <Link href={`/survivors/${p.survivorId}`} className="flex-1 text-ink hover:underline">{p.survivorName}</Link>
                      <span className="text-xs text-muted num">{p.count} pick{p.count === 1 ? '' : 's'}</span>
                      <Badge tone={p.hit ? 'positive' : 'neutral'}>{p.hit ? 'Hit' : 'Miss'} · {p.avgTotal > 0 ? '+' : ''}{p.avgTotal}</Badge>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Around the island" />
                <ul className="space-y-2 text-sm">
                  <li><span className="text-muted">Left the game:</span> <span className="text-ink">{recap.departures.join(', ') || 'Nobody'}</span></li>
                  <li><span className="text-muted">Title:</span> <span className="text-ink">{recap.title.answerName ? <>{recap.title.answerName} — {recap.title.correct.length ? `called by ${recap.title.correct.join(', ')}` : 'nobody called it'}</> : 'Answer not recorded yet'}</span></li>
                  <li><span className="text-muted">Chips played:</span> <span className="text-ink">{recap.chips.length ? recap.chips.map(c => `${c.name} (${c.chipName}${c.slot ? ` on ${c.slot}` : ''})`).join(', ') : 'None'}</span></li>
                  <li><span className="text-muted">Pool:</span> <span className="text-ink">
                    {[recap.pool.drowned.length ? `drowned — ${recap.pool.drowned.join(', ')}` : 'nobody drowned',
                      recap.pool.idolSaves.length ? `idol save — ${recap.pool.idolSaves.join(', ')}` : '',
                      recap.pool.backdoorHits.length ? `back via backdoor — ${recap.pool.backdoorHits.join(', ')}` : ''].filter(Boolean).join(' · ')}
                  </span></li>
                </ul>
                <a href={`https://www.fantasysurvivorgame.com/episode-recap/season/${SEASON_NUMBER}#episode${episode}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-accent">FSG recap <IconExternal size={14} /></a>
              </Card>
            </div>
          </div>
        </>)}
    </Page>
  );
}
