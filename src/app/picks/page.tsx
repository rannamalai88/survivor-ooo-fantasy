'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import { supabase } from '@/lib/supabase/client';
import { TRIBE_COLORS, CHIPS } from '@/lib/constants';

interface Survivor { id: string; name: string; tribe: string; is_active: boolean; photo_url: string | null; cast_id: number; }
interface TeamMember extends Survivor { is_team_active: boolean; }
interface ExistingPick { id: string; captain_id: string | null; pool_pick_id: string | null; pool_backdoor_id: string | null; net_pick_id: string | null; chip_played: number | null; chip_target: string | null; submitted_at: string | null; is_locked: boolean; }

const TC: Record<string, string> = TRIBE_COLORS;

const Av = ({ name, tribe, photoUrl, sz = 28 }: { name: string; tribe: string; photoUrl?: string | null; sz?: number }) => {
  const ini = name[0] === '"' ? 'Q' : name[0];
  const color = TC[tribe] || '#888';
  return (
    <div style={{ width: sz, height: sz, borderRadius: '50%', background: `linear-gradient(135deg,${color}44,${color}77)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color}`, overflow: 'hidden' }}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <span style={{ fontSize: sz * 0.42, fontWeight: 800, color: '#fff' }}>{ini}</span>
      )}
    </div>
  );
};

const Flame = () => (
  <svg width="14" height="18" viewBox="0 0 14 18" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M7 0C7 0 14 6 14 11C14 14.866 10.866 18 7 18C3.134 18 0 14.866 0 11C0 6 7 0 7 0Z" fill="url(#fg_pk)" />
    <path d="M7 8C7 8 10.5 11 10.5 13.5C10.5 15.433 8.933 17 7 17C5.067 17 3.5 15.433 3.5 13.5C3.5 11 7 8 7 8Z" fill="url(#fi_pk)" />
    <defs>
      <linearGradient id="fg_pk" x1="7" y1="0" x2="7" y2="18"><stop stopColor="#FF6B35" /><stop offset="1" stopColor="#D32F2F" /></linearGradient>
      <linearGradient id="fi_pk" x1="7" y1="8" x2="7" y2="17"><stop stopColor="#FFD54F" /><stop offset="1" stopColor="#FF8F00" /></linearGradient>
    </defs>
  </svg>
);

const Section = ({ title, icon, children, badge, badgeColor }: { title: string; icon: string; children: React.ReactNode; badge?: string; badgeColor?: string; }) => (
  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '20px', marginBottom: '14px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const }}>{title}</h3>
      </div>
      {badge && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: `${badgeColor || '#FF6B35'}15`, color: badgeColor || '#FF6B35', border: `1px solid ${badgeColor || '#FF6B35'}30`, letterSpacing: '1px' }}>{badge}</span>}
    </div>
    {children}
  </div>
);

const SurvivorOption = ({ s, selected, onClick, disabled }: { s: Survivor; selected: boolean; onClick: () => void; disabled: boolean; }) => (
  <div onClick={disabled ? undefined : onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: selected ? `${TC[s.tribe]}12` : 'rgba(255,255,255,0.02)', border: selected ? `1px solid ${TC[s.tribe]}50` : '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', cursor: disabled ? 'default' : 'pointer', opacity: disabled && !selected ? 0.3 : 1, transition: 'all 0.2s' }}>
    <Av name={s.name} tribe={s.tribe} photoUrl={s.photo_url} sz={28} />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? '#fff' : 'rgba(255,255,255,0.7)' }}>{s.name}</div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: TC[s.tribe], letterSpacing: '1px' }}>{s.tribe.toUpperCase()}</div>
    </div>
    {selected && <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: TC[s.tribe], display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: '11px', fontWeight: 800 }}>✓</span></div>}
  </div>
);

const TribeFilter = ({ value, onChange, tribes }: { value: string; onChange: (v: string) => void; tribes: string[] }) => (
  <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
    {['All', ...tribes].map(t => (
      <button key={t} onClick={() => onChange(t)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, border: 'none', cursor: 'pointer', background: value === t ? (t === 'All' ? 'rgba(255,107,53,0.15)' : `${TC[t]}20`) : 'rgba(255,255,255,0.03)', color: value === t ? (t === 'All' ? '#FF6B35' : TC[t]) : 'rgba(255,255,255,0.2)', transition: 'all 0.2s' }}>{t}</button>
    ))}
  </div>
);

function PicksContent() {
  const { manager, managers } = useAuth();

  const [season, setSeason] = useState<any>(null);
  const [myTeam, setMyTeam] = useState<TeamMember[]>([]);
  const [allSurvivors, setAllSurvivors] = useState<Survivor[]>([]);
  const [existingPick, setExistingPick] = useState<ExistingPick | null>(null);
  const [poolStatus, setPoolStatus] = useState<string>('active');
  const [usedPoolPicks, setUsedPoolPicks] = useState<string[]>([]);
  const [usedChips, setUsedChips] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [captain, setCaptain] = useState<string | null>(null);
  const [poolPick, setPoolPick] = useState<string | null>(null);
  const [backdoorPick, setBackdoorPick] = useState<string | null>(null);
  const [netPick, setNetPick] = useState<string | null>(null);
  const [chipPlay, setChipPlay] = useState<number | null>(null);
  const [chipTarget, setChipTarget] = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState('All');
  const [netFilter, setNetFilter] = useState('All');
  const [timeLeft, setTimeLeft] = useState('');
  const [isPastDeadline, setIsPastDeadline] = useState(false);

  useEffect(() => { if (manager) loadData(); }, [manager]);

  async function loadData() {
    if (!manager) return;
    setLoading(true);
    try {
      const { data: seasonData } = await supabase.from('seasons').select('*').in('status', ['active', 'drafting']).order('number', { ascending: false }).limit(1).single();
      if (!seasonData) { setLoading(false); return; }
      setSeason(seasonData);
      const sid = seasonData.id;
      const ep = seasonData.current_episode || 1;

      const { data: survivors } = await supabase.from('survivors').select('*').eq('season_id', sid).order('cast_id');
      setAllSurvivors(survivors || []);

      const { data: teamData } = await supabase.from('teams').select('*, survivors(*)').eq('season_id', sid).eq('manager_id', manager.id).eq('is_active', true);
      if (teamData) setMyTeam(teamData.map((t: any) => ({ ...t.survivors, is_team_active: t.is_active })));

      const { data: pickData } = await supabase.from('weekly_picks').select('*').eq('season_id', sid).eq('manager_id', manager.id).eq('episode', ep).maybeSingle();
      if (pickData) { setExistingPick(pickData); setCaptain(pickData.captain_id); setPoolPick(pickData.pool_pick_id); setBackdoorPick(pickData.pool_backdoor_id); setNetPick(pickData.net_pick_id); setChipPlay(pickData.chip_played); setChipTarget(pickData.chip_target); }

      const { data: poolData } = await supabase.from('pool_status').select('*').eq('season_id', sid).eq('manager_id', manager.id).maybeSingle();
      if (poolData) setPoolStatus(poolData.status || 'active');

      const { data: prevPicks } = await supabase.from('weekly_picks').select('pool_pick_id').eq('season_id', sid).eq('manager_id', manager.id).lt('episode', ep).not('pool_pick_id', 'is', null);
      if (prevPicks) setUsedPoolPicks(prevPicks.map((p: any) => p.pool_pick_id).filter(Boolean));

      const { data: chipsData } = await supabase.from('chips_used').select('chip_id, episode').eq('season_id', sid).eq('manager_id', manager.id);
      // Only chips used in PREVIOUS episodes count as "used" — current episode chip stays editable
      if (chipsData) setUsedChips(chipsData.filter((c: any) => c.episode < ep).map((c: any) => c.chip_id));
    } catch (err) { console.error('Error loading picks:', err); }
    setLoading(false);
  }

  useEffect(() => {
    if (!season) return;
    function getDeadline() {
      const now = new Date();
      const day = now.getDay();
      const daysUntil = (3 - day + 7) % 7 || (now.getUTCHours() >= 24 ? 7 : 0);
      const wed = new Date(now); wed.setDate(now.getDate() + daysUntil);
      wed.setUTCHours(24, 0, 0, 0);
      return wed;
    }
    const dl = getDeadline();
    function tick() {
      const diff = dl.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('LOCKED'); setIsPastDeadline(true); return; }
      const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    tick(); const iv = setInterval(tick, 60000); return () => clearInterval(iv);
  }, [season]);

  const currentEp = season?.current_episode || 1;
  const currentWeek = currentEp;
  const tribes = useMemo(() => [...new Set(allSurvivors.map(s => s.tribe))].sort(), [allSurvivors]);
  const activeSurvivors = allSurvivors.filter(s => s.is_active);
  const activeTeam = myTeam.filter(s => s.is_active);
  const poolSurvivors = activeSurvivors.filter(s => !usedPoolPicks.includes(s.id));
  const filteredPool = poolFilter === 'All' ? poolSurvivors : poolSurvivors.filter(s => s.tribe === poolFilter);
  const filteredNet = netFilter === 'All' ? activeSurvivors : activeSurvivors.filter(s => s.tribe === netFilter);
  const availableChips = CHIPS.filter(c => { if (usedChips.includes(c.id)) return false; const [lo, hi] = c.window.replace('Week ', '').split('-').map(Number); return currentWeek >= lo && currentWeek <= hi; });
  const activeChipWindow = availableChips.length > 0;
  const picksComplete = captain !== null && (poolStatus !== 'active' || poolPick !== null) && netPick !== null;
  const isLocked = existingPick?.is_locked || isPastDeadline;

  async function savePicks() {
    if (!manager || !season || isLocked) return;
    setSaving(true); setSaveMessage(null);
    const row = { season_id: season.id, manager_id: manager.id, episode: currentEp, captain_id: captain, pool_pick_id: poolStatus === 'active' ? poolPick : null, pool_backdoor_id: poolStatus === 'drowned' ? backdoorPick : null, net_pick_id: netPick, chip_played: chipPlay, chip_target: chipTarget, submitted_at: new Date().toISOString(), is_locked: false };
    try {
      if (existingPick) { const { error } = await supabase.from('weekly_picks').update(row).eq('id', existingPick.id); if (error) throw error; }
      else { const { error } = await supabase.from('weekly_picks').insert(row); if (error) throw error; }
      // Always delete then re-insert so chip choice stays editable until locked
      await supabase.from('chips_used').delete().eq('season_id', season.id).eq('manager_id', manager.id).eq('episode', currentEp);
      if (chipPlay) { await supabase.from('chips_used').insert({ season_id: season.id, manager_id: manager.id, chip_id: chipPlay, episode: currentEp, target: chipTarget }); }
      setSaveMessage('Picks submitted! You can update them until the deadline.');
      await loadData();
    } catch (err: any) { setSaveMessage(`Error: ${err.message || 'Could not save'}`); }
    setSaving(false);
  }

  const deadlineStr = useMemo(() => {
    const now = new Date(); const d = (3 - now.getDay() + 7) % 7; const w = new Date(now); w.setDate(now.getDate() + (d === 0 ? 0 : d));
    return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][w.getDay()]}, ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][w.getMonth()]} ${w.getDate()} · 7:00 PM CT`;
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading picks...</div></div>;
  if (!season) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-center"><div className="text-3xl mb-3">🏝</div><div className="text-white/40 text-sm">No active season found</div></div></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: '540px', margin: '0 auto', padding: '20px 16px 100px' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <Flame />
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>Weekly Picks</h1>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,107,53,0.1)', color: '#FF6B35', border: '1px solid rgba(255,107,53,0.2)' }}>EP. {currentEp}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>Due: {deadlineStr}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: isPastDeadline ? 'rgba(255,80,80,0.1)' : 'rgba(255,215,0,0.08)', color: isPastDeadline ? '#FF5050' : '#FFD54F' }}>
              {isPastDeadline ? '🔒 LOCKED' : `⏱ ${timeLeft}`}
            </span>
          </div>
        </div>

        {saveMessage && <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', background: saveMessage.startsWith('Error') ? 'rgba(255,80,80,0.08)' : 'rgba(26,188,156,0.08)', border: saveMessage.startsWith('Error') ? '1px solid rgba(255,80,80,0.2)' : '1px solid rgba(26,188,156,0.2)', color: saveMessage.startsWith('Error') ? '#FF5050' : '#1ABC9C' }}>{saveMessage}</div>}
        {existingPick && !saveMessage && <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', fontSize: '12px', background: 'rgba(26,188,156,0.06)', border: '1px solid rgba(26,188,156,0.15)', color: 'rgba(26,188,156,0.7)' }}>✅ Picks submitted — you can update until the deadline</div>}

        <Section title="Captain Designation" icon="👑" badge="REQUIRED" badgeColor="#FFD54F">
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '0 0 12px', lineHeight: 1.5 }}>Choose one of your <b style={{ color: 'rgba(255,255,255,0.5)' }}>active</b> survivors. Points <b style={{ color: '#FFD54F' }}>doubled (2x)</b>.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeTeam.length === 0 ? <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', padding: '20px', textAlign: 'center' }}>No active survivors on your team</div> :
            activeTeam.map(s => <SurvivorOption key={s.id} s={s} selected={captain === s.id} onClick={() => !isLocked && setCaptain(s.id)} disabled={isLocked} />)}
          </div>
        </Section>

        <Section title="Survivor Pool" icon="🌊" badge={poolStatus === 'active' ? 'ACTIVE' : poolStatus === 'drowned' ? 'DROWNED' : 'BURNT'} badgeColor={poolStatus === 'active' ? '#1ABC9C' : poolStatus === 'drowned' ? '#FF6B35' : '#FF5050'}>
          {poolStatus === 'active' ? (<>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '0 0 12px', lineHeight: 1.5 }}>Pick one survivor you think <b style={{ color: 'rgba(255,255,255,0.5)' }}>will NOT be eliminated</b>. No reusing previous picks.</p>
            <TribeFilter value={poolFilter} onChange={setPoolFilter} tribes={tribes} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '6px', maxHeight: '280px', overflowY: 'auto', padding: '2px' }}>
              {filteredPool.map(s => <SurvivorOption key={s.id} s={s} selected={poolPick === s.id} onClick={() => !isLocked && setPoolPick(s.id)} disabled={isLocked} />)}
            </div>
          </>) : poolStatus === 'drowned' ? (<>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '0 0 12px', lineHeight: 1.5 }}>You have been <b style={{ color: '#FF6B35' }}>Drowned</b>! Pick who <b style={{ color: '#FF6B35' }}>WILL be eliminated</b> for a Backdoor attempt.</p>
            <TribeFilter value={poolFilter} onChange={setPoolFilter} tribes={tribes} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '6px', maxHeight: '280px', overflowY: 'auto', padding: '2px' }}>
              {(poolFilter === 'All' ? activeSurvivors : activeSurvivors.filter(s => s.tribe === poolFilter)).map(s => <SurvivorOption key={s.id} s={s} selected={backdoorPick === s.id} onClick={() => !isLocked && setBackdoorPick(s.id)} disabled={isLocked} />)}
            </div>
          </>) : <p style={{ fontSize: '12px', color: 'rgba(255,80,80,0.5)', margin: 0 }}>You have been <b>Burnt</b> — no more pool picks this season.</p>}
        </Section>

        <Section title="Name Episode Title (NET)" icon="💬" badge="REQUIRED" badgeColor="#1ABC9C">
          {season?.next_episode_title ? (
            <div style={{ marginBottom: '12px', padding: '10px 14px', background: 'rgba(26,188,156,0.06)', border: '1px solid rgba(26,188,156,0.15)', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(26,188,156,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: '3px' }}>This week&apos;s episode title</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>&ldquo;{season.next_episode_title}&rdquo;</div>
            </div>
          ) : null}
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '0 0 12px', lineHeight: 1.5 }}>Which survivor says the <b style={{ color: 'rgba(255,255,255,0.5)' }}>episode title quote</b>? Worth <b style={{ color: '#1ABC9C' }}>3 points</b>.</p>
          <TribeFilter value={netFilter} onChange={setNetFilter} tribes={tribes} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '6px', maxHeight: '280px', overflowY: 'auto', padding: '2px' }}>
            {filteredNet.map(s => <SurvivorOption key={s.id} s={s} selected={netPick === s.id} onClick={() => !isLocked && setNetPick(s.id)} disabled={isLocked} />)}
          </div>
        </Section>

        <Section title="Game Chips" icon="🎰" badge={activeChipWindow ? 'AVAILABLE' : 'NO CHIP THIS WEEK'} badgeColor={activeChipWindow ? '#FFD54F' : 'rgba(255,255,255,0.25)'}>
          {activeChipWindow ? (<>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '0 0 14px', lineHeight: 1.5 }}>Optional chip play. <b style={{ color: 'rgba(255,255,255,0.5)' }}>Cannot be undone</b> after submission.</p>
            {availableChips.map(c => (
              <div key={c.id} onClick={() => { if (isLocked) return; setChipPlay(chipPlay === c.id ? null : c.id); setChipTarget(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: chipPlay === c.id ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.02)', border: chipPlay === c.id ? '1px solid rgba(255,215,0,0.25)' : '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', cursor: isLocked ? 'default' : 'pointer', marginBottom: '6px' }}>
                <span style={{ fontSize: '24px' }}>{c.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: '14px', fontWeight: 700, color: chipPlay === c.id ? '#FFD54F' : '#fff' }}>{c.name}</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{c.desc}</div></div>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: chipPlay === c.id ? '2px solid #FFD54F' : '2px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: chipPlay === c.id ? '#FFD54F' : 'transparent' }}>
                  {chipPlay === c.id && <span style={{ fontSize: '12px', color: '#0a0a0f', fontWeight: 800 }}>✓</span>}
                </div>
              </div>
            ))}
            {chipPlay === 1 && (
              <div style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: '10px', padding: '14px', marginTop: '8px' }}>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>Select which manager&apos;s team to copy:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '6px' }}>
                  {managers.filter(m => m.id !== manager?.id).map(m => (
                    <div key={m.id} onClick={() => !isLocked && setChipTarget(m.name)} style={{ padding: '10px', textAlign: 'center', borderRadius: '8px', cursor: isLocked ? 'default' : 'pointer', background: chipTarget === m.name ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.02)', border: chipTarget === m.name ? '1px solid rgba(255,215,0,0.3)' : '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: '13px', fontWeight: chipTarget === m.name ? 700 : 500, color: chipTarget === m.name ? '#FFD54F' : 'rgba(255,255,255,0.5)' }}>{m.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>) : (<>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', margin: '0 0 10px' }}>No chip available this week.</p>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {CHIPS.map(c => { const [lo, hi] = c.window.replace('Week ', '').split('-').map(Number); const used = usedChips.includes(c.id); const future = currentWeek < lo;
                return <div key={c.id} style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '5px', background: used ? 'rgba(255,80,80,0.05)' : 'rgba(255,255,255,0.02)', color: used ? 'rgba(255,80,80,0.4)' : future ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.03)', textDecoration: used ? 'line-through' : 'none' }}>{c.icon} W{lo}-{hi} {c.name}</div>;
              })}
            </div>
          </>)}
        </Section>

        <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(transparent,#0a0a0f 20%)', padding: '20px 0 10px', marginTop: '8px' }}>
          <button onClick={() => { if (picksComplete && !isLocked) savePicks(); }} disabled={!picksComplete || isLocked || saving}
            style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', cursor: picksComplete && !isLocked && !saving ? 'pointer' : 'default', fontWeight: 800, fontSize: '15px', letterSpacing: '1.5px', background: isLocked ? 'rgba(255,80,80,0.08)' : picksComplete ? 'linear-gradient(135deg,#FF6B35,#FF8F00)' : 'rgba(255,255,255,0.04)', color: isLocked ? 'rgba(255,80,80,0.5)' : picksComplete ? '#fff' : 'rgba(255,255,255,0.15)', boxShadow: picksComplete && !isLocked ? '0 4px 20px rgba(255,107,53,0.3)' : 'none', opacity: saving ? 0.6 : 1 }}>
            {isLocked ? '🔒 PICKS LOCKED' : saving ? 'Saving...' : existingPick ? '🔥 UPDATE PICKS' : picksComplete ? '🔥 SUBMIT PICKS' : 'Complete all required picks to submit'}
          </button>
          {!picksComplete && !isLocked && (
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px' }}>
              {!captain && <span style={{ fontSize: '10px', color: 'rgba(255,107,53,0.5)' }}>⚠ Captain</span>}
              {poolStatus === 'active' && !poolPick && <span style={{ fontSize: '10px', color: 'rgba(255,107,53,0.5)' }}>⚠ Pool</span>}
              {!netPick && <span style={{ fontSize: '10px', color: 'rgba(255,107,53,0.5)' }}>⚠ NET</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WeeklyPicksPage() {
  return <AuthGuard><PicksContent /></AuthGuard>;
}
