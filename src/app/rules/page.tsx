'use client';

// League rules for S51. Every number here comes from src/lib/constants.ts,
// so the rules page and the scoring engine can't drift apart.

import { useSeason } from '@/hooks/useSeason';
import {
  ROSTER_SLOTS, PICK_CHIPS, PENALTY, SLOT_BONUS_GOING_HOME, SLOT_BONUS_TITLE, H2H_POINTS,
  PLACEMENT_CURVE, WEIGHTS, QUINFECTA_EXACT, QUINFECTA_ADJACENT, QUINFECTA_PERFECT_BONUS,
  CHIP_FIRST_EP, CHIP_LAST_EP, CAST_SIZE, H2H_ROUNDS,
} from '@/lib/constants';

const Section = ({ id, icon, title, children, color = 'rgba(255,255,255,0.06)' }: {
  id: string; icon: string; title: string; children: React.ReactNode; color?: string;
}) => (
  <div id={id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}`, borderRadius: '14px', padding: '20px', marginBottom: '14px', scrollMarginTop: '80px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
      <span style={{ fontSize: '24px' }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>{title}</h2>
    </div>
    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>{children}</div>
  </div>
);

const Rule = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
    <span style={{ color: '#FF6B35', fontSize: '8px', marginTop: '6px', flexShrink: 0 }}>◆</span>
    <div>{children}</div>
  </div>
);

const Row = ({ left, right, color = '#FF6B35' }: { left: React.ReactNode; right: React.ReactNode; color?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{left}</span>
    <span style={{ fontSize: '12px', fontWeight: 700, color, textAlign: 'right' }}>{right}</span>
  </div>
);

const Box = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', margin: '8px 0' }}>{children}</div>
);

const b = (t: React.ReactNode) => <b style={{ color: 'rgba(255,255,255,0.85)' }}>{t}</b>;

const TOC = [
  { id: 'overview', icon: '🔥', label: 'Overview' },
  { id: 'card', icon: '🃏', label: 'Pick Card' },
  { id: 'chips', icon: '🎰', label: 'Chips' },
  { id: 'h2h', icon: '⚔️', label: 'Head to Head' },
  { id: 'pool', icon: '🌊', label: 'Pool' },
  { id: 'quinfecta', icon: '🎯', label: 'Quinfecta' },
  { id: 'championship', icon: '🏆', label: 'Championship' },
];

export default function RulesPage() {
  const { season } = useSeason();
  const slot = (k: string) => ROSTER_SLOTS.find(s => s.key === k)!;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ padding: '20px 16px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '28px 20px', marginBottom: '18px', background: 'linear-gradient(135deg, rgba(255,107,53,0.06), rgba(255,107,53,0.02))', border: '1px solid rgba(255,107,53,0.12)', borderRadius: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, background: 'linear-gradient(135deg, #FF6B35, #FFD54F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>League Rules</h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>Survivor OOO Fantasy · {season?.name ?? ''} · Commissioner: Ramu</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px', justifyContent: 'center' }}>
          {TOC.map(t => (
            <a key={t.id} href={`#${t.id}`} style={{ fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{t.icon} {t.label}</a>
          ))}
        </div>

        <Section id="overview" icon="🔥" title="Overview">
          <Rule>No draft, no rosters, no captains. {b('Every week resets.')} Each week you fill a 5-slot pick card from the {CAST_SIZE} castaways still in the game.</Rule>
          <Rule>Your card total decides your {b('Head-to-Head')} fixture against one other manager that week.</Rule>
          <Rule>The {b('Survivor Pool')} and {b('Quinfecta')} run alongside, and all three feed the {b('Championship')}.</Rule>
          <Rule>Picks lock {b('Wednesday 7:00pm CT')} each episode. After that your card is read-only and everyone&apos;s cards appear on Reveals.</Rule>
          <Rule>Scores come from FantasySurvivorGame.com&apos;s episode recap. Every point you earn is itemized on your score breakdown.</Rule>
        </Section>

        <Section id="card" icon="🃏" title="The Pick Card" color="rgba(255,107,53,0.15)">
          <p style={{ margin: '0 0 8px' }}>Four roster slots plus Title. The four roster picks must be {b('four different survivors')}.</p>
          <Box>
            {ROSTER_SLOTS.map(s => <Row key={s.key} left={<>{s.icon} {b(s.label)} — {s.desc}</>} right="" />)}
            <Row left={<>💬 {b('Title')} — who says the line that becomes the episode title. Anyone still in the game, or Jeff. Can repeat a roster pick.</>} right={`+${SLOT_BONUS_TITLE}`} />
          </Box>

          <p style={{ margin: '14px 0 6px' }}>{b('How a roster slot scores')}</p>
          <Box>
            <Row left="Your survivor's FSG points for the episode" right="base" color="rgba(255,255,255,0.8)" />
            <Row left="Slot hits (the survivor did the thing the slot asks for)" right="base × 2" color="#4ade80" />
            <Row left={`${slot('going_home').label} hits`} right={`base × 2, +${SLOT_BONUS_GOING_HOME}`} color="#4ade80" />
            <Row left="Slot misses" right="base only" color="rgba(255,255,255,0.8)" />
          </Box>

          <p style={{ margin: '14px 0 6px' }}>{b('Penalties')} — if a survivor in a non-Going-Home slot leaves the game:</p>
          <Box>
            <Row left={slot('immunity').label} right={PENALTY.immunity} color="#f87171" />
            <Row left={slot('reward').label} right={PENALTY.reward} color="#f87171" />
            <Row left={slot('mop').label} right={PENALTY.mop} color="#f87171" />
          </Box>
          <Rule>Penalties are uncapped — a multi-boot week can stack them. {b('Card totals can be negative.')}</Rule>
          <Rule>{b('No-event rule:')} if there was no reward challenge, the Reward slot scores base points only — no double, no penalty. The same goes for Immunity with no immunity challenge, and MOP if nobody scored Other points.</Rule>
          <Rule>{b('Most Other Points')} counts every FSG action that isn&apos;t a reward or immunity challenge win (e.g. tree mail, finding an idol). Ties pay everyone tied.</Rule>
          <Rule>{b('Going Home')} pays if your pick leaves for any reason — voted out, quit, or medically evacuated.</Rule>
          <Rule>Commissioner adjustments are added to a slot and are never multiplied.</Rule>
          <Rule>No card submitted = 0 for the week (you still play your fixture).</Rule>
        </Section>

        <Section id="chips" icon="🎰" title="Chips" color="rgba(5,169,230,0.2)">
          <p style={{ margin: '0 0 8px' }}>Four chips, each usable {b('once per season')}, {b('one per episode')}, in episodes {CHIP_FIRST_EP}–{CHIP_LAST_EP} only. Optional.</p>
          <Box>{PICK_CHIPS.map(c => <Row key={c.id} left={<>{c.icon} {b(c.name)} — {c.desc}</>} right="" />)}</Box>
          <Rule>Triple Down and Hedge target one of your four roster slots. A Hedge backup has to be someone not already on your card.</Rule>
          <Rule>Order: Hedge resolves first, then slot scoring and Triple Down, then your fixture, then Double Fixture / Point Shield.</Rule>
        </Section>

        <Section id="h2h" icon="⚔️" title="Head to Head" color="rgba(248,113,113,0.15)">
          <Rule>{H2H_ROUNDS} rounds — everyone plays everyone once, episodes 2–12. Higher card total wins.</Rule>
          <Rule>Win {b(H2H_POINTS.win)} · Draw {b(H2H_POINTS.draw)} · Loss {b(H2H_POINTS.loss)}. Ties in the table are broken by total card points.</Rule>
          <Rule>💞 {b('Couples Week')} — you play your partner. ⚔️ {b('Rivalry Week')} closes out the fixtures.</Rule>
          <Rule>Shadow record: each week you also see how many of the other managers you outscored.</Rule>
        </Section>

        <Section id="pool" icon="🌊" title="Survivor Pool" color="rgba(26,188,156,0.15)">
          <p style={{ margin: '0 0 10px' }}>Classic elimination pool — pick one survivor each week who you think will NOT be eliminated. Unchanged from last season.</p>
          <Rule>Pick survives → you stay <b style={{ color: '#1ABC9C' }}>Active</b></Rule>
          <Rule>Pick voted out → you&apos;re <b style={{ color: '#E74C3C' }}>Drowned</b></Rule>
          <Rule>Each survivor can only be picked once per manager per season</Rule>
          <Rule>No pick submitted = auto-eliminated · No valid picks left = <b style={{ color: '#95a5a6' }}>Burnt</b></Rule>
          <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(231,76,60,0.05)', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.1)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#E74C3C' }}>🚪 Backdoor</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '4px', lineHeight: 1.5 }}>Once Drowned, guess who WILL be eliminated next. Correct = back in. Wrong = try again. Can Backdoor again if Drowned twice.</div>
          </div>
          <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(255,215,0,0.04)', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.1)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFD54F' }}>🛡️ Immunity Idol</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '4px' }}>Previous season&apos;s champion gets one-time auto-protection if their pool pick is eliminated.</div>
          </div>
          <Rule>Pool standing = weeks survived, which feeds the Championship (below).</Rule>
        </Section>

        <Section id="quinfecta" icon="🎯" title="Quinfecta" color="rgba(230,126,34,0.15)">
          <p style={{ margin: '0 0 8px' }}>Before the finale, predict the finishing order of the final five (1st = Sole Survivor).</p>
          <Box>
            <Row left="Exact place" right={`+${QUINFECTA_EXACT}`} />
            <Row left="One place off" right={`+${QUINFECTA_ADJACENT}`} />
            <Row left="All five exact" right={`+${QUINFECTA_PERFECT_BONUS} bonus`} />
          </Box>
          <Rule>Each place is scored on its own — no sequential tiers. Max {QUINFECTA_EXACT * 5 + QUINFECTA_PERFECT_BONUS}.</Rule>
        </Section>

        <Section id="championship" icon="🏆" title="Championship" color="rgba(255,215,0,0.15)">
          <p style={{ margin: '0 0 8px' }}>Each game is ranked on its own. Your place earns curve points, multiplied by that game&apos;s weight:</p>
          <Box>
            <Row left="Place 1st → 12th" right={PLACEMENT_CURVE.join(' · ')} color="rgba(255,255,255,0.85)" />
            <Row left="Fantasy (Head-to-Head points, tiebreak card points)" right={`× ${WEIGHTS.fantasy}`} />
            <Row left="Pool (weeks survived)" right={`× ${WEIGHTS.pool}`} />
            <Row left="Quinfecta" right={`× ${WEIGHTS.quinfecta}`} />
          </Box>
          <Rule>Max {PLACEMENT_CURVE[0] * (WEIGHTS.fantasy + WEIGHTS.pool + WEIGHTS.quinfecta)} points. Tied managers split the points for the places they share.</Rule>
          <Rule>{b('Couples')} standings add both partners&apos; championship points.</Rule>
        </Section>
      </div>
    </div>
  );
}
