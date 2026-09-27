'use client';

// ============================================================
// Score breakdown — /breakdown/[managerId]/[episode]
// ============================================================
// Spec §6: a manager who doesn't understand the rules should be able to
// read this page and work out why they scored what they scored. Every
// number on the page comes from score_lines (with its verbatim reason) or
// from the survivor's itemized FSG actions in episode_events.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/auth/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, SEASON_NUMBER, ROSTER_SLOTS, PICK_CHIPS } from '@/lib/constants';
import { Page, PageSkeleton, Card, Badge, Button, Callout, EmptyState, ResultPill, SurvivorAvatar, TribeTag, cn } from '@/components/ui';
import { IconChevronLeft, IconChevronRight, IconExternal, IconFlag } from '@/components/ui/icons';

interface Line { id: string; slot: string; survivor_id: string | null; base_points: number; multiplier: number; bonus: number; penalty: number; total: number; reason: string }
interface Survivor { id: string; name: string; tribe: string; photo_url: string | null }
interface Event { survivor_id: string; action: string; points: number; category: string }
interface ScoreRow { card_total: number | null; chip: string | null; chip_slot: string | null; h2h_points: number | null; shadow_beat: number | null }
interface Fixture { id: string; manager_a: string; manager_b: string }
interface H2H { fixture_id: string; score_a: number; score_b: number; points_a: number; points_b: number; chip_a: string | null; chip_b: string | null }

const SLOT_META: Record<string, { label: string; icon: string; rule: string }> = {
  ...Object.fromEntries(ROSTER_SLOTS.map(s => [s.key, { label: s.label, icon: s.icon, rule: s.desc }])),
  title: { label: 'Title', icon: '💬', rule: 'Who says the episode title. +1 if right, never multiplied.' },
  adjustment: { label: 'Commissioner adjustment', icon: '🛠', rule: 'A manual correction on a survivor you played. Never multiplied.' },
};
const CATEGORY_LABEL: Record<string, string> = { reward: 'Reward win', immunity: 'Immunity win', other: 'Other', departure: 'Left the game' };
const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function BreakdownContent() {
  const params = useParams<{ managerId: string; episode: string }>();
  const router = useRouter();
  const { manager: me, managers } = useAuth();
  const managerId = params.managerId;
  const episode = Number(params.episode);

  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [score, setScore] = useState<ScoreRow | null>(null);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [h2h, setH2h] = useState<H2H | null>(null);
  const [scoredEpisodes, setScoredEpisodes] = useState<number[]>([]);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagText, setFlagText] = useState('');
  const [flagSent, setFlagSent] = useState(false);

  useEffect(() => { load(); }, [managerId, episode]);

  async function load() {
    setLoading(true);
    const [linesRes, survRes, eventsRes, scoreRes, epRes, scoredRes] = await Promise.all([
      supabase.from('score_lines').select('*').eq('season_id', SEASON_ID).eq('episode', episode).eq('manager_id', managerId).order('created_at'),
      supabase.from('survivors').select('id, name, tribe, photo_url').eq('season_id', SEASON_ID),
      supabase.from('episode_events').select('survivor_id, action, points, category').eq('season_id', SEASON_ID).eq('episode', episode),
      supabase.from('manager_scores').select('card_total, chip, chip_slot, h2h_points, shadow_beat').eq('season_id', SEASON_ID).eq('episode', episode).eq('manager_id', managerId).maybeSingle(),
      supabase.from('episodes').select('h2h_round').eq('season_id', SEASON_ID).eq('number', episode).maybeSingle(),
      supabase.from('episodes').select('number').eq('season_id', SEASON_ID).eq('status', 'scored').order('number'),
    ]);
    setLines((linesRes.data || []) as Line[]);
    setSurvivors((survRes.data || []) as Survivor[]);
    setEvents((eventsRes.data || []) as Event[]);
    setScore(scoreRes.data as ScoreRow | null);
    setScoredEpisodes((scoredRes.data || []).map((r: any) => r.number));

    setFixture(null); setH2h(null);
    if (epRes.data?.h2h_round) {
      const { data: fx } = await supabase.from('fixtures').select('id, manager_a, manager_b')
        .eq('season_id', SEASON_ID).eq('round', epRes.data.h2h_round)
        .or(`manager_a.eq.${managerId},manager_b.eq.${managerId}`).maybeSingle();
      if (fx) {
        setFixture(fx as Fixture);
        const { data: res } = await supabase.from('h2h_results').select('*').eq('season_id', SEASON_ID).eq('episode', episode).eq('fixture_id', fx.id).maybeSingle();
        setH2h(res as H2H | null);
      }
    }
    setLoading(false);
  }

  const byId = useMemo(() => new Map(survivors.map(s => [s.id, s])), [survivors]);
  const mgrName = (id: string) => managers.find(m => m.id === id)?.name || 'Unknown';
  const subject = mgrName(managerId);
  const isMe = me?.id === managerId;
  const cardTotal = score?.card_total ?? lines.reduce((s, l) => s + l.total, 0);

  // Order: roster slots, title, adjustments
  const order = ['reward', 'immunity', 'going_home', 'mop', 'title', 'adjustment'];
  const sorted = [...lines].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));

  const chipDef = score?.chip ? PICK_CHIPS.find(c => c.id === score.chip) : null;

  // Fixture from this manager's perspective
  const iAmA = fixture?.manager_a === managerId;
  const opponentId = fixture ? (iAmA ? fixture.manager_b : fixture.manager_a) : null;
  const myScore = h2h ? (iAmA ? h2h.score_a : h2h.score_b) : null;
  const theirScore = h2h ? (iAmA ? h2h.score_b : h2h.score_a) : null;
  const myPoints = h2h ? (iAmA ? h2h.points_a : h2h.points_b) : null;
  const myChip = h2h ? (iAmA ? h2h.chip_a : h2h.chip_b) : null;
  const result = myScore === null || theirScore === null ? null : myScore > theirScore ? 'Win' : myScore < theirScore ? 'Loss' : 'Draw';

  const prevEp = [...scoredEpisodes].reverse().find(e => e < episode);
  const nextEp = scoredEpisodes.find(e => e > episode);

  async function sendFlag() {
    if (!me) return;
    await supabase.from('activity_log').insert({
      season_id: SEASON_ID, type: 'admin', manager_id: me.id,
      message: `Score question from ${me.name} about ${subject}'s episode ${episode}${flagText.trim() ? `: ${flagText.trim()}` : ''}`,
      metadata: { kind: 'score_flag', episode, about_manager_id: managerId, note: flagText.trim() },
    });
    setFlagSent(true);
    setFlagOpen(false);
  }

  if (loading) return <PageSkeleton />;

  return (
    <Page>
      {/* Header + navigation */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <div className="text-xs font-semibold text-muted">Score breakdown · Episode {episode}</div>
        <select value={managerId} onChange={(e) => router.push(`/breakdown/${e.target.value}/${episode}`)}
          className="h-8 rounded-lg bg-raised border border-line px-2 text-sm text-ink">
          {managers.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === me?.id ? ' (you)' : ''}</option>)}
        </select>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-ink mb-2">{isMe ? 'Your card' : `${subject}'s card`}</h1>
      <div className="flex items-center gap-4 text-sm mb-5">
        {prevEp ? <Link href={`/breakdown/${managerId}/${prevEp}`} className="inline-flex items-center gap-0.5 text-accent font-medium"><IconChevronLeft size={16} />Episode {prevEp}</Link> : <span />}
        {nextEp && <Link href={`/breakdown/${managerId}/${nextEp}`} className="inline-flex items-center gap-0.5 text-accent font-medium">Episode {nextEp}<IconChevronRight size={16} /></Link>}
        <a href={`https://www.fantasysurvivorgame.com/episode-recap/season/${SEASON_NUMBER}#episode${episode}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent font-medium">FSG recap <IconExternal size={14} /></a>
      </div>

      {lines.length === 0 ? (
        <EmptyState icon="📺" title={`Episode ${episode} hasn't been scored yet.`} />
      ) : (<>
        {/* Total + fixture */}
        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          <Card>
            <div className="text-xs font-medium text-muted">Card total</div>
            <div className={cn('text-5xl font-bold tracking-tight mt-1', cardTotal < 0 ? 'text-negative' : 'text-ink')}>{cardTotal}</div>
            <div className="text-xs text-muted mt-1">Sum of every line below{chipDef ? <> · {chipDef.icon} {chipDef.name}{score?.chip_slot ? ` on ${SLOT_META[score.chip_slot]?.label}` : ''}</> : ''}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Head to head</div>
            {fixture && h2h ? (<>
              <div className="flex items-center gap-2 mt-1.5">
                <ResultPill result={result === 'Win' ? 'W' : result === 'Loss' ? 'L' : 'D'} />
                <span className="text-lg font-bold text-ink">{result} vs {mgrName(opponentId!)}</span>
              </div>
              <div className="text-sm text-muted mt-0.5 num">{myScore}–{theirScore} · <b className="text-accent">{myPoints} pt{myPoints === 1 ? '' : 's'}</b>
                {myChip === 'double_fixture' && ' · Double Fixture doubled it'}
                {myChip === 'point_shield' && result === 'Loss' && ' · Point Shield made it a draw'}
              </div>
              <Link href={`/breakdown/${opponentId}/${episode}`} className="inline-block text-sm font-medium text-accent mt-1.5">See {mgrName(opponentId!)}&apos;s card</Link>
            </>) : <div className="text-sm text-muted mt-1.5">No fixture this episode.</div>}
            {score?.shadow_beat !== null && score?.shadow_beat !== undefined && (
              <div className="text-xs text-muted mt-2 pt-2 border-t border-line">All-play: outscored <b className="text-ink">{score.shadow_beat}</b> of {Math.max(managers.length - 1, 0)} other cards</div>
            )}
          </Card>
        </div>

        {/* Lines */}
        <div className="space-y-3">
          {sorted.map(line => {
            const meta = SLOT_META[line.slot] || { label: line.slot, icon: '•', rule: '' };
            const s = line.survivor_id ? byId.get(line.survivor_id) : null;
            const acts = line.survivor_id ? events.filter(e => e.survivor_id === line.survivor_id) : [];
            const isRoster = ROSTER_SLOTS.some(r => r.key === line.slot);
            const hit = isRoster && line.multiplier > 1;
            const noEvent = isRoster && /No (reward|immunity) challenge this episode|Nobody scored Other points|Nobody left the game this episode/.test(line.reason);
            return (
              <Card key={line.id}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{meta.icon}</span>
                    <span className="text-[15px] font-semibold text-ink">{meta.label}</span>
                    {isRoster && s && <Badge tone={hit ? 'positive' : 'neutral'}>{hit ? 'Hit' : noEvent ? 'No event' : 'Miss'}</Badge>}
                  </div>
                  <span className={cn('text-2xl font-bold tracking-tight num', line.total < 0 ? 'text-negative' : line.total > 0 ? 'text-ink' : 'text-faint')}>{fmt(line.total)}</span>
                </div>

                {s && (
                  <Link href={`/survivors/${s.id}`} className="flex items-center gap-3 mb-3 w-fit">
                    <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={40} />
                    <div>
                      <div className="font-semibold text-ink">{s.name}</div>
                      <TribeTag tribe={s.tribe} />
                    </div>
                  </Link>
                )}

                <p className="text-sm leading-relaxed text-ink">{line.reason}</p>

                {isRoster && s && (<>
                  <div className="mt-3 rounded-xl bg-raised/60 px-3 py-2.5">
                    <div className="text-[11px] font-semibold text-muted mb-1">{s.name}&apos;s FSG actions this episode</div>
                    {acts.length === 0 ? <div className="text-sm text-muted">None — 0 points.</div> : acts.map((a, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm py-0.5">
                        <span className="text-ink">{a.action} <span className="text-[11px] text-faint">{CATEGORY_LABEL[a.category] || a.category}</span></span>
                        <span className="num font-semibold text-ink">{a.category === 'departure' ? '—' : fmt(a.points)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap text-sm num">
                    <span className="rounded-lg bg-raised px-2 py-1 text-ink" title="Base FSG points">{line.base_points}</span>
                    <span className="text-muted">×</span>
                    <span className={cn('rounded-lg px-2 py-1', line.multiplier > 1 ? 'bg-positive/15 text-positive font-semibold' : 'bg-raised text-ink')} title="Multiplier">{line.multiplier}</span>
                    {line.bonus !== 0 && <><span className="text-muted">+</span><span className="rounded-lg bg-positive/15 px-2 py-1 text-positive font-semibold" title="Bonus">{line.bonus}</span></>}
                    {line.penalty !== 0 && <><span className="text-muted">−</span><span className="rounded-lg bg-negative/15 px-2 py-1 text-negative font-semibold" title="Penalty">{Math.abs(line.penalty)}</span></>}
                    <span className="text-muted">=</span>
                    <span className={cn('rounded-lg px-2 py-1 font-bold', line.total < 0 ? 'bg-negative/15 text-negative' : 'bg-accent/10 text-ink')}>{line.total}</span>
                  </div>
                </>)}
                {meta.rule && <div className="text-xs text-muted mt-3">Rule: {meta.rule}</div>}
              </Card>
            );
          })}
        </div>

        {/* This looks wrong */}
        <div className="mt-6 text-center">
          {flagSent ? (
            <Callout tone="positive">Sent — the commissioner will take a look.</Callout>
          ) : flagOpen ? (
            <Card className="text-left">
              <label className="text-sm text-ink font-medium" htmlFor="flag-note">What looks wrong? (optional)</label>
              <textarea id="flag-note" value={flagText} onChange={(e) => setFlagText(e.target.value)} rows={3}
                className="mt-2 w-full rounded-xl bg-raised border border-line text-ink p-3 text-sm" />
              <div className="flex gap-2 mt-3">
                <Button onClick={sendFlag}>Send to commissioner</Button>
                <Button variant="secondary" onClick={() => setFlagOpen(false)}>Cancel</Button>
              </div>
            </Card>
          ) : (
            <Button variant="secondary" onClick={() => setFlagOpen(true)}><IconFlag size={16} />This looks wrong</Button>
          )}
        </div>
      </>)}
    </Page>
  );
}

export default function BreakdownPage() {
  return <AuthGuard><BreakdownContent /></AuthGuard>;
}
