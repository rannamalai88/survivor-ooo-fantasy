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
import { SEASON_ID, SEASON_NUMBER, TRIBE_COLORS, ROSTER_SLOTS, PICK_CHIPS } from '@/lib/constants';

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
const tc = (tribe: string) => TRIBE_COLORS[tribe] || '#9aa0a8';
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

  const page = { minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" } as const;
  if (loading) return <div style={page} className="flex items-center justify-center"><div className="text-white/30 text-sm tracking-wider uppercase">Loading breakdown...</div></div>;

  return (
    <div style={page}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 80px' }}>

        {/* Header + navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Score breakdown · Episode {episode}</div>
          <select value={managerId} onChange={(e) => router.push(`/breakdown/${e.target.value}/${episode}`)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: '#fff', fontSize: '12px' }}>
            {managers.map(m => <option key={m.id} value={m.id} style={{ background: '#1a1a2e' }}>{m.name}{m.id === me?.id ? ' (you)' : ''}</option>)}
          </select>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: 900, color: '#fff' }}>{isMe ? 'Your card' : `${subject}'s card`}</h1>
        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', marginBottom: '16px' }}>
          {prevEp ? <Link href={`/breakdown/${managerId}/${prevEp}`} style={{ color: '#3fc0f0' }}>← Episode {prevEp}</Link> : <span />}
          {nextEp && <Link href={`/breakdown/${managerId}/${nextEp}`} style={{ color: '#3fc0f0' }}>Episode {nextEp} →</Link>}
          <a href={`https://www.fantasysurvivorgame.com/episode-recap/season/${SEASON_NUMBER}#episode${episode}`} target="_blank" rel="noreferrer" style={{ color: '#3fc0f0', marginLeft: 'auto' }}>FSG recap ↗</a>
        </div>

        {lines.length === 0 ? (
          <div style={{ padding: '24px', borderRadius: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
            Episode {episode} hasn&apos;t been scored yet.
          </div>
        ) : (<>
          {/* Total + fixture */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px', marginBottom: '14px' }}>
            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.25)' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.45)' }}>CARD TOTAL</div>
              <div style={{ fontSize: '40px', fontWeight: 900, lineHeight: 1.1, color: cardTotal < 0 ? '#f87171' : '#fff' }}>{cardTotal}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Sum of every line below{chipDef ? ` · ${chipDef.icon} ${chipDef.name}${score?.chip_slot ? ` on ${SLOT_META[score.chip_slot]?.label}` : ''}` : ''}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(5,169,230,0.06)', border: '1px solid rgba(5,169,230,0.2)' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.45)' }}>HEAD TO HEAD</div>
              {fixture && h2h ? (<>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>{result} vs {mgrName(opponentId!)}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{myScore} – {theirScore} · <b style={{ color: '#3fc0f0' }}>{myPoints} pt{myPoints === 1 ? '' : 's'}</b></div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                  Win 3 · Draw 1 · Loss 0
                  {myChip === 'double_fixture' && ' · Double Fixture doubled it'}
                  {myChip === 'point_shield' && result === 'Loss' && ' · Point Shield turned the loss into a draw'}
                </div>
                <Link href={`/breakdown/${opponentId}/${episode}`} style={{ fontSize: '11px', color: '#3fc0f0' }}>See {mgrName(opponentId!)}&apos;s card →</Link>
              </>) : <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '6px' }}>No fixture this episode.</div>}
              {score?.shadow_beat !== null && score?.shadow_beat !== undefined && (
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '6px' }}>Shadow record: outscored <b>{score.shadow_beat}</b> of {Math.max(managers.length - 1, 0)} other managers</div>
              )}
            </div>
          </div>

          {/* Lines */}
          {sorted.map(line => {
            const meta = SLOT_META[line.slot] || { label: line.slot, icon: '•', rule: '' };
            const s = line.survivor_id ? byId.get(line.survivor_id) : null;
            const acts = line.survivor_id ? events.filter(e => e.survivor_id === line.survivor_id) : [];
            const isRoster = ROSTER_SLOTS.some(r => r.key === line.slot);
            const hit = isRoster && line.multiplier > 1;
            const noEvent = isRoster && /No (reward|immunity) challenge this episode|Nobody scored Other points|Nobody left the game this episode/.test(line.reason);
            return (
              <div key={line.id} style={{ padding: '16px', borderRadius: '14px', marginBottom: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '17px' }}>{meta.icon}</span>
                    <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>{meta.label}</span>
                    {isRoster && s && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', background: hit ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', color: hit ? '#4ade80' : 'rgba(255,255,255,0.45)' }}>{hit ? 'HIT' : noEvent ? 'NO EVENT' : 'MISS'}</span>}
                  </div>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: line.total < 0 ? '#f87171' : line.total > 0 ? '#fff' : 'rgba(255,255,255,0.4)' }}>{fmt(line.total)}</span>
                </div>

                {s && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${tc(s.tribe)}`, background: `${tc(s.tribe)}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {s.photo_url ? <img src={s.photo_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: 800, color: '#fff' }}>{s.name[0]}</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{s.name}</div>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: tc(s.tribe) }}>{s.tribe.toUpperCase()}</div>
                    </div>
                  </div>
                )}

                {/* The verbatim reason */}
                <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'rgba(255,255,255,0.85)', marginBottom: isRoster && s ? '10px' : 0 }}>{line.reason}</div>

                {/* Itemized FSG actions + math */}
                {isRoster && s && (<>
                  <div style={{ borderRadius: '8px', background: 'rgba(255,255,255,0.03)', padding: '8px 10px', fontSize: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{s.name.toUpperCase()}&apos;S FSG ACTIONS THIS EPISODE</div>
                    {acts.length === 0 ? <div style={{ color: 'rgba(255,255,255,0.45)' }}>None — 0 points.</div> : acts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'rgba(255,255,255,0.75)', padding: '1px 0' }}>
                        <span>{a.action} <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{CATEGORY_LABEL[a.category] || a.category}</span></span>
                        <span style={{ fontWeight: 700 }}>{a.category === 'departure' ? '—' : fmt(a.points)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', fontSize: '11px' }}>
                    {[
                      { k: 'Base', v: `${line.base_points}` },
                      { k: 'Multiplier', v: `×${line.multiplier}` },
                      { k: 'Bonus', v: fmt(line.bonus) },
                      { k: 'Penalty', v: fmt(line.penalty) },
                      { k: 'Slot total', v: `${line.base_points} × ${line.multiplier} ${line.bonus ? `+ ${line.bonus} ` : ''}${line.penalty ? `− ${Math.abs(line.penalty)} ` : ''}= ${line.total}` },
                    ].map(x => (
                      <span key={x.k} style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>{x.k}:</span> {x.v}
                      </span>
                    ))}
                  </div>
                </>)}
                {meta.rule && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '8px' }}>Rule: {meta.rule}</div>}
              </div>
            );
          })}

          {/* This looks wrong */}
          <div style={{ marginTop: '18px', textAlign: 'center' }}>
            {flagSent ? (
              <div style={{ fontSize: '12px', color: '#4ade80' }}>Sent — the commissioner will take a look.</div>
            ) : flagOpen ? (
              <div style={{ textAlign: 'left', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>What looks wrong? (optional)</div>
                <textarea value={flagText} onChange={(e) => setFlagText(e.target.value)} rows={3}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', padding: '8px', fontSize: '13px' }} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button onClick={sendFlag} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#FF6B35,#FF8F00)', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>Send to commissioner</button>
                  <button onClick={() => setFlagOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setFlagOpen(true)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer' }}>🚩 This looks wrong</button>
            )}
          </div>
        </>)}
      </div>
    </div>
  );
}

export default function BreakdownPage() {
  return <AuthGuard><BreakdownContent /></AuthGuard>;
}
