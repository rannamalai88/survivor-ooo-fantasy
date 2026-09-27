'use client';

// ============================================================
// Standings — /leaderboard
// Championship, Head-to-Head table, weekly card scores, couples.
// Every card score links to its breakdown.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useSeason } from '@/hooks/useSeason';
import { loadStandings, fmtPts, type Standings, type StandingRow } from '@/lib/standings';
import { PLACEMENT_CURVE, WEIGHTS } from '@/lib/constants';
import { formatRank } from '@/lib/utils';

type Tab = 'championship' | 'h2h' | 'cards' | 'couples';

const th = 'text-left p-2.5 text-white/45 font-bold tracking-wider text-[10px] whitespace-nowrap';
const td = 'p-2.5 whitespace-nowrap';

export default function LeaderboardPage() {
  const { manager } = useAuth();
  const { season } = useSeason();
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('championship');

  useEffect(() => {
    loadStandings().then(setData).catch(e => setError(e.message));
  }, []);

  const byChampionship = useMemo(() => data ? [...data.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.rawCardPoints - a.rawCardPoints) : [], [data]);
  const byH2H = useMemo(() => data ? [...data.rows].sort((a, b) => b.h2hPoints - a.h2hPoints || b.rawCardPoints - a.rawCardPoints) : [], [data]);

  const isMe = (r: StandingRow) => r.managerId === manager?.id;
  const rowStyle = (r: StandingRow) => ({ background: isMe(r) ? 'rgba(255,107,53,0.08)' : undefined });
  const latest = data?.scoredEpisodes[data.scoredEpisodes.length - 1];
  const nameCell = (r: StandingRow) => (
    <td className={`${td} font-semibold`}>
      {latest ? <Link href={`/breakdown/${r.managerId}/${latest}`} className="text-white/90 hover:underline">{r.name}</Link> : <span className="text-white/90">{r.name}</span>}
      {isMe(r) && <span className="ml-1.5 text-[9px] font-bold text-[#FF6B35]">YOU</span>}
    </td>
  );

  if (error) return <div className="max-w-5xl mx-auto px-4 py-12 text-red-400 text-sm">Couldn&apos;t load standings: {error}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading standings...</div></div>;

  const nothingScored = data.scoredEpisodes.length === 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-extrabold text-white tracking-wider">🏆 Standings</h1>
        <p className="text-white/40 text-xs mt-1 mb-5">
          {season?.name ?? ''} · {nothingScored ? 'No episodes scored yet' : `Through episode ${latest}`} · Tap a name for their latest breakdown
        </p>

        <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-5 w-fit max-w-full overflow-x-auto">
          {([['championship', 'Championship'], ['h2h', 'Head to Head'], ['cards', 'Weekly Cards'], ['couples', 'Couples']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="px-4 py-2 rounded-md text-xs font-semibold cursor-pointer border-none whitespace-nowrap"
              style={{ background: tab === k ? 'rgba(255,107,53,0.15)' : 'transparent', color: tab === k ? '#FF6B35' : 'rgba(255,255,255,0.45)' }}>{label}</button>
          ))}
        </div>

        {nothingScored && (
          <div className="rounded-xl p-6 mb-5 text-center text-sm text-white/50" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            Standings appear once episode 2 is scored.
          </div>
        )}

        {/* ── Championship ── */}
        {tab === 'championship' && !nothingScored && (<>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] mb-4">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-white/[0.03]">
                <th className={th}>#</th><th className={th}>MANAGER</th>
                <th className={th}>FANTASY</th><th className={th}>POOL</th><th className={th}>QUINFECTA</th><th className={th}>TOTAL</th>
              </tr></thead>
              <tbody>
                {byChampionship.map(r => (
                  <tr key={r.managerId} className="border-t border-white/[0.04]" style={rowStyle(r)}>
                    <td className={`${td} text-white/50 font-bold`}>{r.rank ? formatRank(r.rank) : '—'}</td>
                    {nameCell(r)}
                    <td className={`${td} text-white/75`}>{fmtPts(r.champFantasy)} <span className="text-white/35">({r.fantasyRank ? formatRank(r.fantasyRank) : '—'})</span></td>
                    <td className={`${td} text-white/75`}>{fmtPts(r.champPool)} <span className="text-white/35">({r.poolRank ? formatRank(r.poolRank) : '—'})</span></td>
                    <td className={`${td} text-white/75`}>{r.quinfectaRank ? <>{fmtPts(r.champQuinfecta)} <span className="text-white/35">({formatRank(r.quinfectaRank)})</span></> : <span className="text-white/35">after finale</span>}</td>
                    <td className={`${td} font-black text-white text-sm`}>{fmtPts(r.championship)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl p-4 text-xs text-white/55 leading-relaxed" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <b className="text-white/80">How the championship works.</b> Each game is ranked separately: Fantasy (Head-to-Head points, ties broken by total card points), Pool (weeks survived) and Quinfecta (finale only).
            Your place in each game earns {PLACEMENT_CURVE.join(' / ')} points for 1st–12th, multiplied by the game&apos;s weight — Fantasy ×{WEIGHTS.fantasy}, Pool ×{WEIGHTS.pool}, Quinfecta ×{WEIGHTS.quinfecta}.
            Tied managers split the points for the places they share.
          </div>
        </>)}

        {/* ── Head to Head ── */}
        {tab === 'h2h' && !nothingScored && (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-white/[0.03]">
                <th className={th}>#</th><th className={th}>MANAGER</th><th className={th}>P</th><th className={th}>W</th><th className={th}>D</th><th className={th}>L</th>
                <th className={th}>PTS</th><th className={th}>CARD PTS</th><th className={th}>ALL-PLAY</th><th className={th}>FORM</th>
              </tr></thead>
              <tbody>
                {byH2H.map(r => (
                  <tr key={r.managerId} className="border-t border-white/[0.04]" style={rowStyle(r)}>
                    <td className={`${td} text-white/50 font-bold`}>{r.fantasyRank ? formatRank(r.fantasyRank) : '—'}</td>
                    {nameCell(r)}
                    <td className={`${td} text-white/60`}>{r.played}</td>
                    <td className={`${td} text-white/60`}>{r.won}</td>
                    <td className={`${td} text-white/60`}>{r.drawn}</td>
                    <td className={`${td} text-white/60`}>{r.lost}</td>
                    <td className={`${td} font-black text-white`}>{r.h2hPoints}</td>
                    <td className={`${td} text-white/60`} style={{ color: r.rawCardPoints < 0 ? '#f87171' : undefined }}>{r.rawCardPoints}</td>
                    <td className={`${td} text-white/60`} title="How many other managers' cards you outscored, summed over every episode">{r.shadowGames ? `${r.shadowBeat}/${r.shadowGames}` : '—'}</td>
                    <td className={td}>
                      <span className="flex gap-0.5">
                        {r.form.slice(-5).map((f, i) => (
                          <span key={i} className="w-4 h-4 rounded text-[9px] font-black flex items-center justify-center"
                            style={{ background: f === 'W' ? 'rgba(74,222,128,0.18)' : f === 'L' ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.08)', color: f === 'W' ? '#4ade80' : f === 'L' ? '#f87171' : 'rgba(255,255,255,0.6)' }}>{f}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3 text-[11px] text-white/40">Win 3 · Draw 1 · Loss 0. Ties in points are broken by total card points. Double Fixture and Point Shield are included in PTS. ALL-PLAY is your shadow record: how many other managers&apos; cards you outscored each week, as if you played everyone.</div>
          </div>
        )}

        {/* ── Weekly cards ── */}
        {tab === 'cards' && !nothingScored && (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-white/[0.03]">
                <th className={th}>MANAGER</th>
                {data.scoredEpisodes.map(ep => <th key={ep} className={th}>E{ep}</th>)}
                <th className={th}>TOTAL</th>
              </tr></thead>
              <tbody>
                {byH2H.map(r => (
                  <tr key={r.managerId} className="border-t border-white/[0.04]" style={rowStyle(r)}>
                    <td className={`${td} font-semibold text-white/90`}>{r.name}</td>
                    {data.scoredEpisodes.map(ep => {
                      const v = r.cards[ep];
                      return (
                        <td key={ep} className={td}>
                          {v === undefined ? <span className="text-white/25">—</span> : (
                            <Link href={`/breakdown/${r.managerId}/${ep}`} className="font-semibold hover:underline" style={{ color: v < 0 ? '#f87171' : 'rgba(255,255,255,0.85)' }}>{v}</Link>
                          )}
                        </td>
                      );
                    })}
                    <td className={`${td} font-black text-white`}>{r.rawCardPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3 text-[11px] text-white/40">Tap any score to see exactly how it was earned.</div>
          </div>
        )}

        {/* ── Couples ── */}
        {tab === 'couples' && !nothingScored && (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-white/[0.03]"><th className={th}>#</th><th className={th}>COUPLE</th><th className={th}>PARTNERS</th><th className={th}>TOTAL</th></tr></thead>
              <tbody>
                {data.couples.map(c => {
                  const mine = !!manager && c.managerIds.includes(manager.id);
                  return (
                    <tr key={c.label} className="border-t border-white/[0.04]" style={{ background: mine ? 'rgba(255,107,53,0.08)' : undefined }}>
                      <td className={`${td} text-white/50 font-bold`}>{formatRank(c.rank)}</td>
                      <td className={`${td} font-semibold text-white/90`}>{c.label}</td>
                      <td className={`${td} text-white/55`}>{c.managerIds.map(id => { const r = data.rows.find(x => x.managerId === id); return r ? `${r.name} ${fmtPts(r.championship)}` : ''; }).join(' + ')}</td>
                      <td className={`${td} font-black text-white`}>{fmtPts(c.championship)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="p-3 text-[11px] text-white/40">Couples score the sum of both partners&apos; championship points.</div>
          </div>
        )}
      </div>
    </div>
  );
}
