'use client';

const Flame = () => (
  <svg width="14" height="18" viewBox="0 0 14 18" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M7 0C7 0 14 6 14 11C14 14.866 10.866 18 7 18C3.134 18 0 14.866 0 11C0 6 7 0 7 0Z" fill="url(#fgRL)" />
    <path d="M7 8C7 8 10.5 11 10.5 13.5C10.5 15.433 8.933 17 7 17C5.067 17 3.5 15.433 3.5 13.5C3.5 11 7 8 7 8Z" fill="url(#fiRL)" />
    <defs>
      <linearGradient id="fgRL" x1="7" y1="0" x2="7" y2="18"><stop stopColor="#FF6B35" /><stop offset="1" stopColor="#D32F2F" /></linearGradient>
      <linearGradient id="fiRL" x1="7" y1="8" x2="7" y2="17"><stop stopColor="#FFD54F" /><stop offset="1" stopColor="#FF8F00" /></linearGradient>
    </defs>
  </svg>
);

const Section = ({ id, icon, title, children, color = 'rgba(255,255,255,0.06)' }: {
  id: string; icon: string; title: string; children: React.ReactNode; color?: string;
}) => (
  <div id={id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}`, borderRadius: '14px', padding: '20px', marginBottom: '14px', scrollMarginTop: '80px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
      <span style={{ fontSize: '24px' }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>{title}</h2>
    </div>
    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{children}</div>
  </div>
);

const Rule = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
    <span style={{ color: '#FF6B35', fontSize: '8px', marginTop: '6px', flexShrink: 0 }}>◆</span>
    <div>{children}</div>
  </div>
);

const ScoreRow = ({ action, pts, color = '#FF6B35' }: { action: string; pts: number | string; color?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{action}</span>
    <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '30px', textAlign: 'right' }}>
      {typeof pts === 'number' ? (pts > 0 ? `+${pts}` : pts) : pts}
    </span>
  </div>
);

const TOC_ITEMS = [
  { id: 'overview', icon: '🔥', label: 'Overview' },
  { id: 'fantasy', icon: '🏝️', label: 'Fantasy' },
  { id: 'draft', icon: '📋', label: 'Draft' },
  { id: 'captain', icon: '👑', label: 'Captain' },
  { id: 'chips', icon: '🎰', label: 'Chips' },
  { id: 'pool', icon: '🌊', label: 'Pool' },
  { id: 'quinfecta', icon: '🎯', label: 'Quinfecta' },
  { id: 'net', icon: '💬', label: 'NET' },
  { id: 'scoring', icon: '📊', label: 'Scoring' },
  { id: 'prizes', icon: '💰', label: 'Prizes' },
];

export default function RulesPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
        {/* Hero */}
        <div style={{
          textAlign: 'center', padding: '28px 20px', marginBottom: '18px',
          background: 'linear-gradient(135deg, rgba(255,107,53,0.06), rgba(255,107,53,0.02))',
          border: '1px solid rgba(255,107,53,0.12)', borderRadius: '16px',
        }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, background: 'linear-gradient(135deg, #FF6B35, #FFD54F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            League Rules
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>
            Survivor OOO Fantasy · Season 50 · Commissioner: Ramu
          </p>
        </div>

        {/* Quick Nav */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {TOC_ITEMS.map((t) => (
            <a key={t.id} href={`#${t.id}`} style={{
              padding: '5px 10px', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px',
              fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              {t.icon} {t.label}
            </a>
          ))}
        </div>

        {/* Overview */}
        <Section id="overview" icon="🔥" title="Overview">
          <p style={{ margin: 0 }}>
            A private <b style={{ color: '#FF6B35' }}>12-manager</b> Survivor Fantasy League combining four mini-games into one overall competition.
            Compete individually and as couples (6 pairs) for <b style={{ color: '#FFD54F' }}>$240 in prizes</b>.
          </p>
          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {[
              { i: '🏝️', n: 'Fantasy', d: 'Draft a team, earn points from the show' },
              { i: '🌊', n: 'Pool', d: 'Pick one survivor each week to stay alive' },
              { i: '🎯', n: 'Quinfecta', d: 'Predict the final 5 finish order' },
              { i: '💬', n: 'NET', d: 'Guess who says the episode title' },
            ].map((g) => (
              <div key={g.n} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '14px' }}>{g.i}</span>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>{g.n}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{g.d}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            <b style={{ color: 'rgba(255,255,255,0.5)' }}>All picks due: Wednesday 7:00 PM CT</b> (before episode airs)
          </div>
        </Section>

        {/* Fantasy Scoring */}
        <Section id="fantasy" icon="🏝️" title="Game A — Survivor Fantasy" color="rgba(255,107,53,0.15)">
          <p style={{ margin: '0 0 12px' }}>
            Draft a team of 5 survivors who earn points based on in-game performance.
            Scoring pulled from <b style={{ color: 'rgba(255,255,255,0.6)' }}>FantasySurvivorGame.com</b>.
          </p>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' as const, marginBottom: '4px' }}>
            Scoring Categories
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', overflow: 'hidden', marginBottom: '12px' }}>
            {([
              ['Win Tribe Immunity', 3], ['Win Tribe Reward', 2], ['Win Individual Immunity', 2],
              ['Win Fire Making', 2], ['Read Tree Mail', 2], ['Make Fire at Camp', 2],
              ['Play Idol/Advantage', 2], ['Play Shot in the Dark', 2], ['Merge', 2],
              ['Win Marooning/Supply', 1], ['Win Individual Reward', 1], ['Win Journey Challenge', 1],
              ['Strategize at Water Well', 1], ['Find Food / Go on Journey', 1],
              ['Find Clue / Gain Idol / Gain Advantage', 1],
            ] as [string, number][]).map(([a, p]) => (
              <ScoreRow key={a} action={a} pts={p} />
            ))}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' as const, marginBottom: '4px' }}>
            Custom League Scoring
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <ScoreRow action="Voted Out bonus (1pt per elimination position)" pts="varies" color="#1ABC9C" />
            <ScoreRow action="Sole Survivor bonus" pts={15} color="#FFD700" />
            <ScoreRow action="Idol in pocket penalty" pts={-5} color="#E74C3C" />
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
            ❌ FSG Outwit (vote) pts, Bonus pts, and &quot;Out of Game&quot; pts are NOT used
          </div>
        </Section>

        {/* Draft */}
        <Section id="draft" icon="📋" title="The Draft" color="rgba(26,188,156,0.15)">
          <p style={{ margin: '0 0 12px' }}>
            12 managers draft 5 survivors each from a cast of 24 (minus eliminated). Live over Teams — Commissioner enters picks.
          </p>
          {[
            { r: 'Round 1 — Free Pick', o: 'Order: 1 → 12', d: 'No restrictions. Duplicates allowed. Does NOT count toward retirement.' },
            { r: 'Rounds 2–4 — Snake', o: 'R2: 1→12 · R3: 12→1 · R4: 1→12', d: 'Once a survivor is drafted twice across R2–4, they\'re retired from the board. R1 picks don\'t count toward this limit.' },
            { r: 'Round 5 — Partner Pick (Snake)', o: 'R5: 12→1 (continues snake from R4)', d: 'Your partner picks a survivor FOR you. Can\'t pick a survivor the receiving manager already has. Retirement counter resets.' },
          ].map((r) => (
            <div key={r.r} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1ABC9C' }}>{r.r}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{r.o}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{r.d}</div>
            </div>
          ))}

          {/* Partner Pairings */}
          <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(155,89,182,0.05)', borderRadius: '8px', border: '1px solid rgba(155,89,182,0.1)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#9B59B6', letterSpacing: '1px', marginBottom: '6px' }}>R5 PARTNER PAIRINGS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {[
                ['Alli ↔ Samin'], ['Alan ↔ Gisele'], ['Hari ↔ Michael'],
                ['Stephanie ↔ Amy'], ['Alec ↔ Cassie'], ['Veena ↔ Ramu'],
              ].map(([pair]) => (
                <div key={pair} style={{ padding: '4px 8px', background: 'rgba(155,89,182,0.08)', borderRadius: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  {pair}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(255,107,53,0.05)', borderRadius: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            <b style={{ color: '#FF6B35' }}>Draft Order:</b> 1. Alli, 2. Alan, 3. Hari, 4. Stephanie, 5. Alec, 6. Veena, 7. Ramu, 8. Cassie, 9. Amy, 10. Michael, 11. Gisele, 12. Samin
          </div>
        </Section>

        {/* Captain */}
        <Section id="captain" icon="👑" title="Captain System" color="rgba(255,215,0,0.12)">
          <Rule>Designate one survivor as <b style={{ color: '#FFD54F' }}>Captain</b> each week — their points are <b style={{ color: '#FFD54F' }}>doubled (2x)</b></Rule>
          <Rule>Captain does NOT get 2x on the +15 Sole Survivor bonus</Rule>
          <Rule>Due <b style={{ color: '#FF6B35' }}>Wednesday 7pm CT</b> — can change weekly</Rule>
        </Section>

        {/* Chips */}
        <Section id="chips" icon="🎰" title="Game Chips" color="rgba(255,215,0,0.12)">
          <p style={{ margin: '0 0 12px' }}>5 one-time-use power-ups, each playable only during its window:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
            {[
              { i: '🤝', n: 'Assistant Manager', w: 'W3–4', e: "Copy another manager's team points (excl. bonuses) in addition to yours" },
              { i: '⚡', n: 'Team Boost', w: 'W5–6', e: 'Core team (non-Captain) points tripled (3x)' },
              { i: '👑', n: 'Super Captain', w: 'W7–8', e: 'Captain points quadrupled (4x) instead of doubled' },
              { i: '🔄', n: 'Swap Out', w: 'W9–10', e: 'Swap active survivors on your team for any others' },
              { i: '➕', n: 'Player Add', w: 'W11–12', e: 'Add any active survivor to your team' },
            ].map((c) => (
              <div key={c.n} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '20px' }}>{c.i}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{c.n}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#FFD54F' }}>{c.w}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{c.e}</div>
                </div>
              </div>
            ))}
          </div>
          <Rule>One chip per week max · each used once per season · due Wed 7pm CT</Rule>
        </Section>

        {/* Pool */}
        <Section id="pool" icon="🌊" title="Game B — Survivor Pool" color="rgba(26,188,156,0.15)">
          <p style={{ margin: '0 0 10px' }}>Classic elimination pool — pick one survivor each week who you think will NOT be eliminated.</p>
          <Rule>Pick survives → you stay <b style={{ color: '#1ABC9C' }}>Active</b></Rule>
          <Rule>Pick voted out → you&apos;re <b style={{ color: '#E74C3C' }}>Drowned</b></Rule>
          <Rule>Each survivor can only be picked once per manager per season</Rule>
          <Rule>No pick submitted = auto-eliminated · No valid picks left = <b style={{ color: '#95a5a6' }}>Burnt</b></Rule>

          <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(231,76,60,0.05)', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.1)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#E74C3C' }}>🚪 Backdoor</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', lineHeight: 1.5 }}>
              Once Drowned, guess who WILL be eliminated next. Correct = back in. Wrong = try again. Can Backdoor again if Drowned twice.
            </div>
          </div>
          <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(255,215,0,0.04)', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.1)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFD54F' }}>🛡️ Immunity Idol</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
              Previous season&apos;s Fantasy winner gets one-time auto-protection if their pool pick is eliminated.
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
            <b style={{ color: 'rgba(255,255,255,0.5)' }}>Scoring:</b> (Weeks Survived / Total Weeks) × (25% of Top Fantasy Score)
          </div>
        </Section>

        {/* Quinfecta */}
        <Section id="quinfecta" icon="🎯" title="Game C — Quinfecta" color="rgba(230,126,34,0.15)">
          <p style={{ margin: '0 0 10px' }}>
            Before the finale, predict the exact finish order of the final 5 survivors.{' '}
            <b style={{ color: 'rgba(255,255,255,0.5)' }}>Sequential scoring — NOT cumulative:</b>
          </p>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <ScoreRow action="20th place correct" pts={5} color="#1ABC9C" />
            <ScoreRow action="21st place correct" pts={10} color="#1ABC9C" />
            <ScoreRow action="22nd place correct" pts={25} color="#FFD54F" />
            <ScoreRow action="23rd place correct" pts={50} color="#FFD700" />
            <ScoreRow action="24th (Sole Survivor) correct" pts={50} color="#FFD700" />
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            Must get each stage correct <b style={{ color: 'rgba(255,255,255,0.5)' }}>sequentially</b>. Miss one and you only earn the highest tier reached.
            Example: correct on 20th, 21st, 22nd but miss 23rd = <b style={{ color: '#FFD54F' }}>25 points</b> (not 5+10+25).
            Max possible: <b style={{ color: '#FFD700' }}>50 points</b>.
          </div>
        </Section>

        {/* NET */}
        <Section id="net" icon="💬" title="Game D — NET (Next Episode Title)" color="rgba(155,89,182,0.15)">
          <Rule>Each week, guess which survivor says the quote that becomes the episode title</Rule>
          <Rule>Correct = <b style={{ color: '#FFD54F' }}>+3 points</b> · Incorrect = 0 points</Rule>
          <Rule>Due <b style={{ color: '#FF6B35' }}>Wednesday 7pm CT</b> with other picks</Rule>
        </Section>

        {/* Overall Scoring */}
        <Section id="scoring" icon="📊" title="Overall Scoring">
          <div style={{
            padding: '14px', background: 'rgba(255,107,53,0.06)', borderRadius: '10px',
            border: '1px solid rgba(255,107,53,0.15)', textAlign: 'center', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const }}>
              Total Score Formula
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '6px' }}>
              <span style={{ color: '#FF6B35' }}>Fantasy</span> + <span style={{ color: '#1ABC9C' }}>Pool</span> + <span style={{ color: '#E67E22' }}>Quinfecta</span> + <span style={{ color: '#9B59B6' }}>NET</span>
            </div>
          </div>
          <Rule><b style={{ color: '#FF6B35' }}>Fantasy:</b> Team points with captain 2x, chip effects, voted out bonus, sole survivor bonus</Rule>
          <Rule><b style={{ color: '#1ABC9C' }}>Pool:</b> (Weeks Survived / Total Weeks) × (25% of Top Fantasy Score)</Rule>
          <Rule><b style={{ color: '#E67E22' }}>Quinfecta:</b> 0–50 points from finale predictions</Rule>
          <Rule><b style={{ color: '#9B59B6' }}>NET:</b> 3 points per correct episode title guess</Rule>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            <b>Tiebreaker:</b> Manager with the highest-placing draft pick wins.
          </div>
        </Section>

        {/* Prizes */}
        <Section id="prizes" icon="💰" title="Prizes">
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>
            Entry: $20/person → <b style={{ color: '#FFD54F' }}>$240 total pot</b>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
            {[
              { l: '1st Place', p: '60%', a: '$144', c: '#FFD700' },
              { l: '2nd Place', p: '20%', a: '$48', c: '#C0C0C0' },
              { l: '3rd Place', p: '10%', a: '$24', c: '#CD7F32' },
              { l: 'Top Couple', p: '10%', a: '$24', c: '#E67E22' },
            ].map((p) => (
              <div key={p.l} style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: p.c }}>{p.a}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{p.l} ({p.p})</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Couples */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '18px' }}>💑</span>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff' }}>Couples (S50)</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
            {[['Alli', 'Alec'], ['Stephanie', 'Alan'], ['Amy', 'Hari'], ['Veena', 'Ramu'], ['Cassie', 'Michael'], ['Gisele', 'Samin']].map(([a, b]) => (
              <div key={a} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{a} & {b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
