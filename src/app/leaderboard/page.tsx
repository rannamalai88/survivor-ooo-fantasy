'use client';

// ============================================================
// Standings — /leaderboard
// Championship · Head to Head (with luck + all-play) · Weekly cards · Couples
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useSeason } from '@/hooks/useSeason';
import { loadStandings, fmtPts, fmtSigned, type Standings, type StandingRow } from '@/lib/standings';
import { PLACEMENT_CURVE, WEIGHTS } from '@/lib/constants';
import { formatRank } from '@/lib/utils';
import { Page, PageHeader, Card, CardHeader, Segmented, ManagerAvatar, ResultPill, EmptyState, Skeleton, cn } from '@/components/ui';
import { RankLines, Sparkline } from '@/components/charts';

type Tab = 'championship' | 'h2h' | 'cards' | 'couples';

export default function LeaderboardPage() {
  const { manager } = useAuth();
  const { season } = useSeason();
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('championship');

  useEffect(() => { loadStandings().then(setData).catch(e => setError(e.message)); }, []);

  const byChampionship = useMemo(() => data ? [...data.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.rawCardPoints - a.rawCardPoints) : [], [data]);
  const byH2H = useMemo(() => data ? [...data.rows].sort((a, b) => (a.fantasyRank ?? 99) - (b.fantasyRank ?? 99) || b.rawCardPoints - a.rawCardPoints) : [], [data]);

  const isMe = (r: StandingRow) => r.managerId === manager?.id;
  const latest = data?.scoredEpisodes[data.scoredEpisodes.length - 1];

  const NameCell = ({ r }: { r: StandingRow }) => (
    <td>
      <Link href={`/managers/${r.managerId}`} className="flex items-center gap-2.5 min-w-[120px] hover:underline decoration-line underline-offset-4">
        <ManagerAvatar name={r.name} size={26} me={isMe(r)} />
        <span className={cn('text-ink', isMe(r) ? 'font-bold' : 'font-medium')}>{r.name}</span>
      </Link>
    </td>
  );
  const rowCls = (r: StandingRow) => cn(isMe(r) && 'bg-accent/[0.07]');

  if (error) return <Page><EmptyState icon="⚠️" title="Couldn't load standings">{error}</EmptyState></Page>;

  return (
    <Page width="lg">
      <PageHeader title="Standings" subtitle={`${season?.name ?? ''}${latest ? ` · through Episode ${latest}` : ''}`} />
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[
        { value: 'championship', label: 'Championship' }, { value: 'h2h', label: 'Head to Head' },
        { value: 'cards', label: 'Weekly cards' }, { value: 'couples', label: 'Couples' },
      ]} />

      {!data ? <Skeleton className="h-96 w-full" /> : data.scoredEpisodes.length === 0 ? (
        <EmptyState icon="🏆" title="Standings appear once Episode 2 is scored." />
      ) : (<>
        {tab === 'championship' && (<>
          <Card padded={false} className="overflow-x-auto mb-4">
            <table className="data-table">
              <thead><tr><th>#</th><th>Manager</th><th>Fantasy</th><th>Pool</th><th>Quinfecta</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {byChampionship.map(r => (
                  <tr key={r.managerId} className={rowCls(r)}>
                    <td className="num text-muted font-semibold w-10">{r.rank ? formatRank(r.rank) : '—'}</td>
                    <NameCell r={r} />
                    <td className="num"><span className="text-ink">{fmtPts(r.champFantasy)}</span> <span className="text-faint text-xs">{r.fantasyRank ? formatRank(r.fantasyRank) : ''}</span></td>
                    <td className="num"><span className="text-ink">{fmtPts(r.champPool)}</span> <span className="text-faint text-xs">{r.poolRank ? formatRank(r.poolRank) : ''}</span></td>
                    <td className="num">{r.quinfectaRank ? <><span className="text-ink">{fmtPts(r.champQuinfecta)}</span> <span className="text-faint text-xs">{formatRank(r.quinfectaRank)}</span></> : <span className="text-faint text-xs">after finale</span>}</td>
                    <td className="num text-right text-base font-bold text-ink">{fmtPts(r.championship)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="text-sm text-muted leading-relaxed">
            <b className="text-ink">How the championship works.</b> Each game is ranked on its own — Fantasy (Head-to-Head points, tiebreak card points), Pool (weeks survived) and Quinfecta (finale).
            Places 1st–12th earn {PLACEMENT_CURVE.join(' / ')}, multiplied by Fantasy ×{WEIGHTS.fantasy}, Pool ×{WEIGHTS.pool}, Quinfecta ×{WEIGHTS.quinfecta}. Ties split the points for the places they share.
          </Card>
        </>)}

        {tab === 'h2h' && (<>
          <Card padded={false} className="overflow-x-auto mb-4">
            <table className="data-table">
              <thead><tr><th>#</th><th>Manager</th><th className="text-right">W-D-L</th><th className="text-right">Pts</th><th className="text-right">Card pts</th><th className="text-right" title="Other managers' cards you outscored, summed over every week">All-play</th><th className="text-right" title="Actual wins minus the wins your all-play record predicts">Luck</th><th>Form</th></tr></thead>
              <tbody>
                {byH2H.map(r => (
                  <tr key={r.managerId} className={rowCls(r)}>
                    <td className="num text-muted font-semibold w-10">{r.fantasyRank ? formatRank(r.fantasyRank) : '—'}</td>
                    <NameCell r={r} />
                    <td className="num text-right text-muted">{r.won}-{r.drawn}-{r.lost}</td>
                    <td className="num text-right font-bold text-ink">{r.h2hPoints}</td>
                    <td className={cn('num text-right', r.rawCardPoints < 0 ? 'text-negative' : 'text-ink')}>{r.rawCardPoints}</td>
                    <td className="num text-right text-muted">{r.shadowGames ? `${r.shadowBeat}/${r.shadowGames}` : '—'}</td>
                    <td className={cn('num text-right font-medium', r.luck > 0.25 ? 'text-positive' : r.luck < -0.25 ? 'text-negative' : 'text-muted')}>{r.played ? fmtSigned(r.luck) : '—'}</td>
                    <td><div className="flex gap-0.5">{r.form.slice(-5).map((f, i) => <ResultPill key={i} result={f} />)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="mb-4">
            <CardHeader title="Head-to-head rank by episode" subtitle="You in blue · hover for everyone" />
            <RankLines series={data.rows.map(r => ({ id: r.managerId, name: r.name, points: r.rankHistory }))} highlightId={manager?.id} episodes={data.scoredEpisodes} total={data.rows.length} />
          </Card>
          <p className="text-xs text-muted">Win 3 · Draw 1 · Loss 0 (Double Fixture and Point Shield included). <b className="text-ink">All-play</b> is your record if you&apos;d played every card each week. <b className="text-ink">Luck</b> = actual wins − wins your all-play record predicts; positive means your opponents underperformed.</p>
        </>)}

        {tab === 'cards' && (
          <Card padded={false} className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Manager</th>{data.scoredEpisodes.map(ep => <th key={ep} className="text-right">E{ep}</th>)}<th className="text-right">Total</th><th>Trend</th></tr></thead>
              <tbody>
                {byH2H.map(r => (
                  <tr key={r.managerId} className={rowCls(r)}>
                    <NameCell r={r} />
                    {data.scoredEpisodes.map(ep => {
                      const v = r.cards[ep];
                      const best = Math.max(...data.rows.map(x => x.cards[ep] ?? -Infinity));
                      return (
                        <td key={ep} className="text-right">
                          {v === undefined ? <span className="text-faint">—</span> : (
                            <Link href={`/breakdown/${r.managerId}/${ep}`} className={cn('num font-semibold hover:underline', v < 0 ? 'text-negative' : 'text-ink', v === best && 'rounded-md bg-positive/15 px-1.5 py-0.5')}>{v}</Link>
                          )}
                        </td>
                      );
                    })}
                    <td className="num text-right font-bold text-ink">{r.rawCardPoints}</td>
                    <td><Sparkline values={data.scoredEpisodes.map(ep => r.cards[ep] ?? 0)} /></td>
                  </tr>
                ))}
                <tr>
                  <td className="text-muted text-xs font-semibold">League avg</td>
                  {data.scoredEpisodes.map(ep => <td key={ep} className="num text-right text-muted">{data.leagueAvg[ep] ?? '—'}</td>)}
                  <td /><td />
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-3 text-xs text-muted border-t border-line">Tap any score for its breakdown. Highlighted = top card that week.</div>
          </Card>
        )}

        {tab === 'couples' && (
          <Card padded={false} className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>#</th><th>Couple</th><th>Partners</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {data.couples.map(c => {
                  const mine = !!manager && c.managerIds.includes(manager.id);
                  return (
                    <tr key={c.label} className={cn(mine && 'bg-accent/[0.07]')}>
                      <td className="num text-muted font-semibold w-10">{formatRank(c.rank)}</td>
                      <td className="font-semibold text-ink">{c.label}</td>
                      <td className="text-muted text-xs">{c.managerIds.map(id => { const r = data.rows.find(x => x.managerId === id); return r ? `${r.name} ${fmtPts(r.championship)}` : ''; }).join(' + ')}</td>
                      <td className="num text-right font-bold text-ink">{fmtPts(c.championship)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 text-xs text-muted border-t border-line">Couples score the sum of both partners&apos; championship points.</div>
          </Card>
        )}
      </>)}
    </Page>
  );
}
