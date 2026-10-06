'use client';

// League rules for S51. Every number here comes from src/lib/constants.ts,
// so the rules page and the scoring engine can't drift apart.

import { useSeason } from '@/hooks/useSeason';
import { Page, PageHeader } from '@/components/ui';
import {
  ROSTER_SLOTS, PICK_CHIPS, PENALTY_IMMUNITY_BOOTED, PENALTY_GOING_HOME_IMMUNE, SLOT_BONUS_GOING_HOME, SLOT_BONUS_TITLE, H2H_POINTS,
  PLACEMENT_CURVE, WEIGHTS, QUINFECTA_EXACT, QUINFECTA_ADJACENT, QUINFECTA_PERFECT_BONUS,
  CHIP_FIRST_EP, CHIP_LAST_EP, CAST_SIZE, H2H_ROUNDS,
} from '@/lib/constants';

const Section = ({ id, icon, title, children }: { id: string; icon: string; title: string; children: React.ReactNode; color?: string }) => (
  <section id={id} className="rounded-2xl bg-surface border border-line shadow-card p-4 sm:p-5 mb-3 scroll-mt-20">
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-2xl">{icon}</span>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
    </div>
    <div className="text-sm text-muted leading-relaxed">{children}</div>
  </section>
);

const Rule = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2.5 py-2 border-b border-line last:border-b-0">
    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
    <div>{children}</div>
  </div>
);

// Row value colour: positive / negative / plain ink / accent (default)
const toneFor = (color?: string) => !color ? 'text-accent' : color.includes('4ade80') ? 'text-positive' : color.includes('f87171') ? 'text-negative' : 'text-ink';
const Row = ({ left, right, color }: { left: React.ReactNode; right: React.ReactNode; color?: string }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-line last:border-b-0">
    <span className="text-[13px] text-muted">{left}</span>
    <span className={`text-[13px] font-bold text-right num ${toneFor(color)}`}>{right}</span>
  </div>
);

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl bg-raised/50 border border-line overflow-hidden my-2">{children}</div>
);

const b = (t: React.ReactNode) => <b className="text-ink font-semibold">{t}</b>;

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
    <Page>
      <PageHeader title="League rules" subtitle={`Survivor OOO Fantasy · ${season?.name ?? ''} · Commissioner: Ramu`} />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TOC.map(t => (
          <a key={t.id} href={`#${t.id}`} className="h-8 px-3 rounded-lg bg-raised text-xs font-semibold text-muted hover:text-ink inline-flex items-center gap-1.5">{t.icon} {t.label}</a>
        ))}
      </div>

        <Section id="overview" icon="🔥" title="Overview">
          <Rule>No draft, no rosters, no captains. {b('Every week resets.')} In episodes 2–12 you fill a 5-slot pick card from the {CAST_SIZE} castaways still in the game.</Rule>
          <Rule>{b('The finale (Episode 13) has no card')} — head-to-head is over. It&apos;s just your Pool pick and your Quinfecta, both settled after the finale airs.</Rule>
          <Rule>Your card total decides your {b('Head-to-Head')} fixture against one other manager that week.</Rule>
          <Rule>The {b('Survivor Pool')} and {b('Quinfecta')} run alongside, and all three feed the {b('Championship')}.</Rule>
          <Rule>Picks lock {b('Wednesday 7:00pm CT')} each episode. After that your card is read-only and everyone&apos;s cards appear on Matchups.</Rule>
          <Rule>Scores come from FantasySurvivorGame.com&apos;s episode recap. Every point you earn is itemized on your score breakdown.</Rule>
        </Section>

        <Section id="card" icon="🃏" title="The Pick Card" color="rgba(255,107,53,0.15)">
          <p className="mb-2">Four roster slots plus Title. The four roster picks must be {b('four different survivors')}.</p>
          <Box>
            {ROSTER_SLOTS.map(s => <Row key={s.key} left={<>{s.icon} {b(s.label)} — {s.desc}</>} right="" />)}
            <Row left={<>💬 {b('Title')} — who says the line that becomes the episode title. Anyone still in the game, or Jeff. Can repeat a roster pick.</>} right={`+${SLOT_BONUS_TITLE}`} />
          </Box>

          <p className="mt-4 mb-1.5">{b('How a roster slot scores')}</p>
          <Box>
            <Row left="Your survivor's FSG points for the episode" right="base" color="rgba(255,255,255,0.8)" />
            <Row left="Slot hits (the survivor did the thing the slot asks for)" right="base × 2" color="#4ade80" />
            <Row left={`${slot('going_home').label} hits`} right={`base × 2, +${SLOT_BONUS_GOING_HOME}`} color="#4ade80" />
            <Row left={`${slot('going_home').label} misses — it's all-or-nothing`} right="0" color="rgba(255,255,255,0.8)" />
            <Row left="Any other slot misses" right="base only" color="rgba(255,255,255,0.8)" />
          </Box>

          <p className="mt-4 mb-1.5">{b('Penalties')} — they change once the merge has aired:</p>
          <Box>
            <Row left={<>{b('Pre-merge')} · your Immunity pick goes home</>} right={PENALTY_IMMUNITY_BOOTED} color="#f87171" />
            <Row left={<>{b('Post-merge')} · your Immunity pick goes home</>} right={PENALTY_IMMUNITY_BOOTED} color="#f87171" />
            <Row left={<>{b('Post-merge')} · your Going Home pick wins immunity</>} right={PENALTY_GOING_HOME_IMMUNE} color="#f87171" />
            <Row left="Reward and Most Other Points" right="never penalised" color="rgba(255,255,255,0.8)" />
          </Box>
          <Rule>Why the split: pre-merge, tribe immunity covers about half the cast, so penalising a Going Home pick who &ldquo;won immunity&rdquo; would be a coin flip. Post-merge it&apos;s individual immunity and a real read.</Rule>
          <Rule>Post-merge rules start with the episode {b('after')} the merge airs, never the merge episode itself — picks lock before it airs, so nobody is scored under a rule they couldn&apos;t see. Your pick card always says which rules are live.</Rule>
          <Rule>Penalties are uncapped — a multi-boot week can stack them. {b('Card totals can be negative.')}</Rule>
          <Rule>{b('No-event rule:')} if there was no reward challenge, the Reward slot scores base points only — no double, no penalty. The same goes for Immunity with no immunity challenge, and MOP if nobody scored Other points. If nobody leaves the game, every Going Home slot scores 0.</Rule>
          <Rule>{b('Most Other Points')} counts every FSG action that isn&apos;t a reward or immunity challenge win (e.g. tree mail, finding an idol). Ties pay everyone tied.</Rule>
          <Rule>{b('Going Home')} pays if your pick leaves for any reason — voted out, quit, or medically evacuated. A wrong pick scores 0, so it&apos;s a pure read on who&apos;s going, not a fifth scoring slot. Post-merge, a Going Home pick who wins immunity is still penalised: {`0 − ${Math.abs(PENALTY_GOING_HOME_IMMUNE)} = ${PENALTY_GOING_HOME_IMMUNE}`}.</Rule>
          <Rule>Rule changes never rewrite the past: episodes scored before a change keep their original results. Each score breakdown shows the rules version it was scored under.</Rule>
          <Rule>Commissioner adjustments are added to a slot and are never multiplied.</Rule>
          <Rule>No card submitted = 0 for the week (you still play your fixture).</Rule>
          <Rule>The card runs episodes 2–12 only. There is no card in the finale.</Rule>
        </Section>

        <Section id="chips" icon="🎰" title="Chips" color="rgba(5,169,230,0.2)">
          <p className="mb-2">Four chips, each usable {b('once per season')}, {b('one per episode')}, in episodes {CHIP_FIRST_EP}–{CHIP_LAST_EP} only. Optional.</p>
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
          <p className="mb-2">Classic elimination pool — pick one survivor each week who you think will NOT be eliminated. Unchanged from last season.</p>
          <Rule>Pick survives → you stay <b className="text-positive">Active</b></Rule>
          <Rule>Pick voted out → you&apos;re <b className="text-negative">Drowned</b></Rule>
          <Rule>Each survivor can only be picked once per manager per season</Rule>
          <Rule>No pick submitted = auto-eliminated · No valid picks left = <b className="text-ink">Burnt</b></Rule>
          <div className="mt-3 rounded-xl border border-negative/25 bg-negative/5 p-3">
            <div className="text-[13px] font-semibold text-ink">🚪 Backdoor</div>
            <div className="text-[13px] text-muted mt-1">Once Drowned, guess who WILL be eliminated next. Correct = back in. Wrong = try again. Can Backdoor again if Drowned twice.</div>
          </div>
          <div className="mt-2 rounded-xl border border-accent/25 bg-accent/5 p-3">
            <div className="text-[13px] font-semibold text-ink">🛡️ Dynasty Immunity Idol</div>
            <div className="text-[13px] text-muted mt-1">Previous season&apos;s champion gets one-time auto-protection: the first time their pool pick is eliminated, they stay Active and the week counts as survived. The idol is then used up. It doesn&apos;t cover a missed pick.</div>
          </div>
          <Rule>Pool standing = weeks survived, which feeds the Championship (below).</Rule>
        </Section>

        <Section id="quinfecta" icon="🎯" title="Quinfecta" color="rgba(230,126,34,0.15)">
          <p className="mb-2">Before the finale, predict the finishing order of the final five (1st = Sole Survivor).</p>
          <Box>
            <Row left="Exact place" right={`+${QUINFECTA_EXACT}`} />
            <Row left="One place off" right={`+${QUINFECTA_ADJACENT}`} />
            <Row left="All five exact" right={`+${QUINFECTA_PERFECT_BONUS} bonus`} />
          </Box>
          <Rule>Each place is scored on its own — no sequential tiers. Max {QUINFECTA_EXACT * 5 + QUINFECTA_PERFECT_BONUS}.</Rule>
        </Section>

        <Section id="championship" icon="🏆" title="Championship" color="rgba(255,215,0,0.15)">
          <p className="mb-2">Each game is ranked on its own. Your place earns curve points, multiplied by that game&apos;s weight:</p>
          <Box>
            <Row left="Place 1st → 12th" right={PLACEMENT_CURVE.join(' · ')} color="rgba(255,255,255,0.85)" />
            <Row left="Fantasy (Head-to-Head points, tiebreak card points)" right={`× ${WEIGHTS.fantasy}`} />
            <Row left="Pool (weeks survived)" right={`× ${WEIGHTS.pool}`} />
            <Row left="Quinfecta" right={`× ${WEIGHTS.quinfecta}`} />
          </Box>
          <Rule>Max {PLACEMENT_CURVE[0] * (WEIGHTS.fantasy + WEIGHTS.pool + WEIGHTS.quinfecta)} points. Tied managers split the points for the places they share.</Rule>
          <Rule>{b('Couples')} standings add both partners&apos; championship points.</Rule>
        </Section>
    </Page>
  );
}
