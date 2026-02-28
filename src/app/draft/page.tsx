'use client';

import { useState, useMemo } from 'react';
import { useDraft, DRAFT_ORDER, type Survivor, type DraftPick } from '@/hooks/useDraft';

// ─── Constants ──────────────────────────────────────────────
const SEASON_ID = process.env.NEXT_PUBLIC_SEASON_ID || '550e8400-e29b-41d4-a716-446655440000';

const TC: Record<string, string> = {
  Vatu: '#9B59B6',
  Kalo: '#1ABC9C',
  Cila: '#E67E22',
};

const ROUND_LABELS: Record<number, string> = {
  1: 'FREE PICK',
  2: 'SNAKE →',
  3: 'SNAKE ←',
  4: 'SNAKE →',
  5: 'PARTNER PICK',
};

const ROUND_SHORT: Record<number, string> = {
  1: 'FREE',
  2: 'SNAKE',
  3: 'SNAKE',
  4: 'SNAKE',
  5: 'PAIR',
};

// ─── Sub-Components ─────────────────────────────────────────

function Flame({ size = 14 }: { size?: number }) {
  const h = (size / 14) * 18;
  return (
    <svg width={size} height={h} viewBox="0 0 14 18" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M7 0C7 0 14 6 14 11C14 14.866 10.866 18 7 18C3.134 18 0 14.866 0 11C0 6 7 0 7 0Z" fill="url(#fg)" />
      <path d="M7 8C7 8 10.5 11 10.5 13.5C10.5 15.433 8.933 17 7 17C5.067 17 3.5 15.433 3.5 13.5C3.5 11 7 8 7 8Z" fill="url(#fi)" />
      <defs>
        <linearGradient id="fg" x1="7" y1="0" x2="7" y2="18"><stop stopColor="#FF6B35" /><stop offset="1" stopColor="#D32F2F" /></linearGradient>
        <linearGradient id="fi" x1="7" y1="8" x2="7" y2="17"><stop stopColor="#FFD54F" /><stop offset="1" stopColor="#FF8F00" /></linearGradient>
      </defs>
    </svg>
  );
}

function SurvivorAvatar({ survivor, size = 48 }: { survivor: Survivor; size?: number }) {
  const initial = survivor.name[0] === '"' ? 'Q' : survivor.name[0];
  const tribe = survivor.tribe;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        border: `2px solid ${TC[tribe]}`,
        background: `linear-gradient(135deg, ${TC[tribe]}44, ${TC[tribe]}77)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, position: 'relative',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={survivor.photo_url}
        alt={survivor.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <span style={{ fontSize: size * 0.4, fontWeight: 800, color: '#fff', position: 'relative', zIndex: 0 }}>{initial}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────
export default function DraftPage() {
  const draft = useDraft(SEASON_ID);
  const [view, setView] = useState<'board' | 'teams'>('board');
  const [tribeFilter, setTribeFilter] = useState<string>('All');
  const [selectedSurvivorId, setSelectedSurvivorId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  // Commissioner mode — for now, always enabled (auth comes later)
  const isCommissioner = true;

  const { survivors, managers, picks, loading, error, currentSlot, currentPickIndex,
    isDraftComplete, retirementCount, isSurvivorAvailable, survivorById,
    managerByIndex, makePick, undoLastPick, picksForManager } = draft;

  // Filtered survivors
  const filteredSurvivors = useMemo(() => {
    if (tribeFilter === 'All') return survivors;
    return survivors.filter((s) => s.tribe === tribeFilter);
  }, [survivors, tribeFilter]);

  // Currently on the clock
  const onTheClockManager = currentSlot ? managerByIndex(currentSlot.manager_index) : null;
  const pickerManager = currentSlot ? managerByIndex(currentSlot.picker_index) : null;
  const isPartnerRound = currentSlot?.round === 5;

  // Selected survivor for confirmation
  const selectedSurvivor = selectedSurvivorId ? survivorById(selectedSurvivorId) : null;

  // Handle pick
  const handlePick = async () => {
    if (!selectedSurvivorId || isPicking) return;
    setIsPicking(true);
    setPickError(null);
    const result = await makePick(selectedSurvivorId);
    if (!result.success) {
      setPickError(result.error || 'Pick failed');
    } else {
      setSelectedSurvivorId(null);
      setShowConfirm(false);
    }
    setIsPicking(false);
  };

  // Handle undo
  const handleUndo = async () => {
    const result = await undoLastPick();
    if (!result.success) {
      setPickError(result.error || 'Undo failed');
    }
    setShowUndo(false);
  };

  // Get picks grouped by manager
  const getManagerPick = (managerId: string, round: number): DraftPick | undefined => {
    return picks.find((p) => p.manager_id === managerId && p.round === round);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <Flame size={28} />
          <div style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', fontWeight: 600 }}>LOADING DRAFT...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center', color: '#ff6b6b' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Error loading draft</div>
          <div style={{ fontSize: 13, marginTop: 8, color: 'rgba(255,255,255,0.4)' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ─── Nav ──────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(90deg, #0d0d15 0%, #141420 50%, #0d0d15 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Flame />
          <div>
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '3px', background: 'linear-gradient(135deg, #FF6B35, #FFD54F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SURVIVOR OOO
            </span>
            <span style={{ fontSize: '10px', display: 'block', letterSpacing: '4px', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginTop: '-2px' }}>
              LIVE DRAFT · S50
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px' }}>
          {(['board', 'teams'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 16px',
                background: view === v ? 'rgba(255,107,53,0.15)' : 'transparent',
                color: view === v ? '#FF6B35' : 'rgba(255,255,255,0.4)',
                border: view === v ? '1px solid rgba(255,107,53,0.3)' : '1px solid transparent',
                borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px',
                letterSpacing: '1px', textTransform: 'uppercase' as const, transition: 'all 0.2s',
              }}
            >
              {v === 'board' ? 'Draft Board' : 'Teams'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Status Bar ───────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Round */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase' as const }}>Round</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: isDraftComplete ? '#1ABC9C' : '#FF6B35', lineHeight: 1 }}>
                {isDraftComplete ? '✓' : currentSlot?.round}
              </span>
              {!isDraftComplete && currentSlot && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' }}>
                  {ROUND_LABELS[currentSlot.round]}
                </span>
              )}
              {isDraftComplete && <span style={{ fontSize: '13px', fontWeight: 600, color: '#1ABC9C' }}>COMPLETE</span>}
            </div>
          </div>

          {/* On the Clock */}
          {!isDraftComplete && pickerManager && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase' as const }}>On the Clock</div>
              <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px', color: '#fff' }}>{pickerManager.name}</div>
              {isPartnerRound && onTheClockManager && (
                <div style={{ fontSize: '11px', color: '#FF6B35', fontWeight: 600, marginTop: '1px' }}>
                  picking for {onTheClockManager.name}
                </div>
              )}
            </div>
          )}

          {/* Pick counter */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase' as const }}>Pick</div>
            <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>
              <span style={{ color: '#FF6B35' }}>{Math.min(currentPickIndex + 1, 60)}</span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>/60</span>
            </div>
          </div>
        </div>

        {/* Undo button (commissioner only) */}
        {isCommissioner && picks.length > 0 && !showUndo && (
          <button
            onClick={() => setShowUndo(true)}
            style={{
              padding: '6px 14px', background: 'transparent',
              color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            ↩ Undo
          </button>
        )}
        {showUndo && picks.length > 0 && (() => {
          const lastPick = picks[picks.length - 1];
          const lastSurvivor = survivorById(lastPick.survivor_id);
          return (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                Undo <b>{lastSurvivor?.name}</b>?
              </span>
              <button onClick={handleUndo} style={{
                padding: '5px 12px', background: 'rgba(255,80,80,0.15)', color: '#ff6b6b',
                border: '1px solid rgba(255,80,80,0.3)', borderRadius: '5px', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700,
              }}>Yes</button>
              <button onClick={() => setShowUndo(false)} style={{
                padding: '5px 12px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
              }}>No</button>
            </div>
          );
        })()}
      </div>

      {/* ─── Progress Bar ─────────────────────────────── */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{
          height: '100%',
          width: `${(currentPickIndex / 60) * 100}%`,
          background: 'linear-gradient(90deg, #FF6B35, #FFD54F)',
          transition: 'width 0.4s ease',
          borderRadius: '0 2px 2px 0',
        }} />
      </div>

      {/* ─── Error Banner ─────────────────────────────── */}
      {pickError && (
        <div style={{
          padding: '8px 20px', background: 'rgba(255,80,80,0.1)',
          borderBottom: '1px solid rgba(255,80,80,0.2)',
          fontSize: '12px', color: '#ff6b6b', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>⚠️ {pickError}</span>
          <button onClick={() => setPickError(null)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>
      )}

      {/* ─── Main Content ─────────────────────────────── */}
      <div style={{ padding: '16px 20px' }}>
        {view === 'board' ? (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

            {/* ─── Survivors Grid ───────────────────── */}
            <div style={{ flex: '1 1 520px', minWidth: '300px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
              }}>
                <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const }}>
                  Survivors
                </h2>
                {/* Tribe filter */}
                <div style={{ display: 'flex', gap: '3px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '2px' }}>
                  {['All', 'Vatu', 'Kalo', 'Cila'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTribeFilter(t)}
                      style={{
                        padding: '4px 12px', fontSize: '11px', fontWeight: 600, border: 'none',
                        borderRadius: '5px', cursor: 'pointer', transition: 'all 0.2s',
                        background: tribeFilter === t ? (t === 'All' ? 'rgba(255,255,255,0.1)' : `${TC[t]}22`) : 'transparent',
                        color: tribeFilter === t ? (t === 'All' ? '#fff' : TC[t]) : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Survivor cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '6px' }}>
                {filteredSurvivors.map((s) => {
                  const available = isSurvivorAvailable(s.id);
                  const retired = (retirementCount[s.id] || 0) >= 2;
                  const isSel = selectedSurvivorId === s.id;
                  const count = retirementCount[s.id] || 0;
                  const rd = currentSlot?.round || 0;

                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        if (available && !isDraftComplete && isCommissioner) {
                          setSelectedSurvivorId(s.id);
                          setShowConfirm(true);
                          setPickError(null);
                        }
                      }}
                      style={{
                        position: 'relative',
                        background: isSel ? `${TC[s.tribe]}15` : 'rgba(255,255,255,0.03)',
                        border: isSel ? `2px solid ${TC[s.tribe]}` : '2px solid rgba(255,255,255,0.04)',
                        borderRadius: '10px', padding: '10px 6px 8px', textAlign: 'center',
                        cursor: available && !isDraftComplete && isCommissioner ? 'pointer' : 'default',
                        opacity: (!available || isDraftComplete) && !isSel ? 0.25 : 1,
                        transition: 'all 0.2s', overflow: 'hidden',
                      }}
                    >
                      <div style={{ position: 'relative', width: '56px', height: '56px', margin: '0 auto' }}>
                        <SurvivorAvatar survivor={s} size={56} />
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '6px', color: '#fff' }}>{s.name}</div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: TC[s.tribe], letterSpacing: '1px', marginTop: '1px' }}>
                        {s.tribe.toUpperCase()}
                      </div>
                      {/* Retirement counter badge */}
                      {rd >= 2 && rd <= 4 && count > 0 && s.is_active && (
                        <div style={{
                          position: 'absolute', top: '4px', right: '4px',
                          fontSize: '8px', fontWeight: 800, padding: '2px 5px', borderRadius: '4px',
                          background: retired ? 'rgba(255,80,80,0.2)' : 'rgba(255,107,53,0.15)',
                          color: retired ? '#ff6b6b' : '#FF6B35',
                        }}>
                          {retired ? 'OUT' : `${count}/2`}
                        </div>
                      )}
                      {/* Eliminated badge */}
                      {!s.is_active && (
                        <div style={{
                          position: 'absolute', top: '4px', right: '4px',
                          fontSize: '7px', fontWeight: 800, padding: '2px 5px', borderRadius: '4px',
                          background: 'rgba(255,80,80,0.2)', color: '#ff6b6b',
                          letterSpacing: '0.5px',
                        }}>
                          ELIM
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─── Sidebar ────────────────────────────── */}
            <div style={{ flex: '0 0 260px', minWidth: '240px' }}>

              {/* Confirm Panel */}
              {showConfirm && selectedSurvivor && !isDraftComplete && isCommissioner && currentSlot && (() => {
                const s = selectedSurvivor;
                return (
                  <div style={{
                    background: `linear-gradient(135deg, ${TC[s.tribe]}08, ${TC[s.tribe]}15)`,
                    border: `1px solid ${TC[s.tribe]}40`,
                    borderRadius: '12px', padding: '20px', marginBottom: '14px',
                    textAlign: 'center', backdropFilter: 'blur(10px)',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '3px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, marginBottom: '12px' }}>
                      Confirm Pick
                    </div>
                    <div style={{ width: '72px', height: '72px', margin: '0 auto' }}>
                      <SurvivorAvatar survivor={s} size={72} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '10px' }}>{s.full_name}</div>
                    <div style={{ fontSize: '10px', color: TC[s.tribe], fontWeight: 700, letterSpacing: '1px', marginTop: '2px' }}>
                      {s.tribe.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '8px' }}>
                      {isPartnerRound && pickerManager && onTheClockManager
                        ? <>{pickerManager.name} → {onTheClockManager.name}</>
                        : <>Round {currentSlot.round} — {pickerManager?.name}</>
                      }
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'center' }}>
                      <button
                        onClick={handlePick}
                        disabled={isPicking}
                        style={{
                          padding: '9px 28px',
                          background: isPicking ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, ${TC[s.tribe]}, ${TC[s.tribe]}cc)`,
                          color: '#fff', border: 'none', borderRadius: '8px',
                          cursor: isPicking ? 'wait' : 'pointer',
                          fontWeight: 700, fontSize: '13px', letterSpacing: '1px',
                          boxShadow: `0 4px 12px ${TC[s.tribe]}40`, transition: 'all 0.2s',
                        }}
                      >
                        {isPicking ? 'DRAFTING...' : 'DRAFT'}
                      </button>
                      <button
                        onClick={() => { setSelectedSurvivorId(null); setShowConfirm(false); }}
                        style={{
                          padding: '9px 16px', background: 'rgba(255,255,255,0.05)',
                          color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Pick History Log */}
              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const }}>
                  Pick History
                </h3>
                <div style={{ maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
                  {picks.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
                      Awaiting first pick...
                    </div>
                  )}
                  {[...picks].reverse().map((pick, ri) => {
                    const idx = picks.length - 1 - ri;
                    const slot = DRAFT_ORDER[idx];
                    const s = survivorById(pick.survivor_id);
                    const manager = managerByIndex(slot?.manager_index ?? 0);
                    const picker = managerByIndex(slot?.picker_index ?? 0);
                    if (!s || !slot) return null;

                    return (
                      <div
                        key={pick.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '7px 8px',
                          background: ri === 0 ? 'rgba(255,107,53,0.06)' : 'transparent',
                          borderRadius: '8px', marginBottom: '1px',
                          borderLeft: ri === 0 ? '2px solid #FF6B35' : '2px solid transparent',
                        }}
                      >
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', minWidth: '18px', fontWeight: 700 }}>
                          #{slot.pick_number}
                        </span>
                        <SurvivorAvatar survivor={s} size={24} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
                            R{slot.round} · {manager?.name}
                            {slot.round === 5 && picker && ` (by ${picker.name})`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── Teams View ────────────────────────────── */
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const }}>
              Team Rosters
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {managers.map((m) => {
                const mPicks = picksForManager(m.id);
                const isUp = currentSlot && managerByIndex(currentSlot.picker_index)?.id === m.id;
                return (
                  <div
                    key={m.id}
                    style={{
                      background: isUp ? 'rgba(255,107,53,0.05)' : 'rgba(255,255,255,0.02)',
                      borderRadius: '12px', padding: '14px',
                      border: isUp ? '1px solid rgba(255,107,53,0.2)' : '1px solid rgba(255,255,255,0.04)',
                      transition: 'all 0.3s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: isUp ? '#FF6B35' : '#fff' }}>{m.name}</span>
                      {isUp && (
                        <span style={{
                          fontSize: '8px', fontWeight: 800, letterSpacing: '2px', color: '#FF6B35',
                          background: 'rgba(255,107,53,0.1)', padding: '3px 8px', borderRadius: '4px',
                        }}>PICKING</span>
                      )}
                    </div>
                    {[1, 2, 3, 4, 5].map((round) => {
                      const pick = mPicks.find((p) => p.round === round);
                      const s = pick ? survivorById(pick.survivor_id) : null;
                      return (
                        <div key={round} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.03)',
                        }}>
                          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', minWidth: '22px', fontWeight: 700 }}>R{round}</span>
                          {s ? (
                            <>
                              <SurvivorAvatar survivor={s} size={22} />
                              <span style={{ fontSize: '12px', fontWeight: 500 }}>{s.name}</span>
                              <span style={{ fontSize: '9px', color: TC[s.tribe], marginLeft: 'auto', fontWeight: 700 }}>
                                {s.tribe.toUpperCase()}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.08)' }}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Draft Grid (below content on board view) ─── */}
      {view === 'board' && (
        <div style={{ padding: '0 20px 24px' }}>
          <h3 style={{ margin: '16px 0 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const }}>
            Draft Grid
          </h3>
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{
                    padding: '8px 12px', textAlign: 'left' as const,
                    color: 'rgba(255,255,255,0.35)', fontWeight: 700, fontSize: '10px',
                    letterSpacing: '1px', position: 'sticky' as const, left: 0,
                    background: '#0d0d15', zIndex: 1, minWidth: '80px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    MANAGER
                  </th>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <th key={r} style={{
                      padding: '8px 14px', textAlign: 'center' as const,
                      color: 'rgba(255,255,255,0.35)', fontWeight: 700, fontSize: '10px',
                      letterSpacing: '1px', minWidth: '90px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      R{r} <span style={{ color: 'rgba(255,255,255,0.15)' }}>{ROUND_SHORT[r]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => {
                  const isUp = currentSlot && managerByIndex(currentSlot.picker_index)?.id === m.id;
                  return (
                    <tr key={m.id} style={{
                      background: isUp ? 'rgba(255,107,53,0.04)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}>
                      <td style={{
                        padding: '6px 12px', fontWeight: 700, fontSize: '12px',
                        position: 'sticky' as const, left: 0,
                        background: isUp ? '#12110f' : '#0d0d15', zIndex: 1,
                        color: isUp ? '#FF6B35' : '#fff',
                      }}>
                        {m.name}
                      </td>
                      {[1, 2, 3, 4, 5].map((round) => {
                        const pick = getManagerPick(m.id, round);
                        const s = pick ? survivorById(pick.survivor_id) : null;
                        return (
                          <td key={round} style={{ padding: '5px 8px', textAlign: 'center' as const }}>
                            {s ? (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                background: `${TC[s.tribe]}15`,
                                padding: '3px 8px 3px 3px', borderRadius: '20px',
                                border: `1px solid ${TC[s.tribe]}40`,
                              }}>
                                <SurvivorAvatar survivor={s} size={18} />
                                <span style={{ fontSize: '11px', fontWeight: 600, color: TC[s.tribe] }}>{s.name}</span>
                              </div>
                            ) : (
                              <span style={{ color: 'rgba(255,255,255,0.06)' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
