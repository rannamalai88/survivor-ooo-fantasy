'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────────
export interface Survivor {
  id: string;
  cast_id: number;
  name: string;
  full_name: string;
  tribe: string;
  photo_url: string;
  is_active: boolean;
}

export interface Manager {
  id: string;
  name: string;
  draft_position: number;
  is_commissioner: boolean;
  partner_id: string | null;
}

export interface DraftPick {
  id: string;
  manager_id: string;
  survivor_id: string;
  round: number;
  pick_number: number;
  picked_by_id: string;
  created_at: string;
}

export interface DraftSlot {
  round: number;
  pick_number: number;       // overall 1-60
  manager_index: number;     // 0-11 (who RECEIVES the survivor)
  picker_index: number;      // 0-11 (who MAKES the pick — different in R5)
}

// ─── Build draft order ─────────────────────────────────────
// R5 partner map: draft position pairing 1↔12, 2↔11, 3↔10, 4↔9, 5↔8, 6↔7
const R5_PARTNER_MAP: Record<number, number> = {
  0: 11, 1: 10, 2: 9, 3: 8, 4: 7, 5: 6,
  6: 5, 7: 4, 8: 3, 9: 2, 10: 1, 11: 0,
};

function buildDraftOrder(): DraftSlot[] {
  const slots: DraftSlot[] = [];
  let pickNum = 1;

  for (let round = 1; round <= 5; round++) {
    if (round === 5) {
      // Partner pick: snake continues from R4 (which was 1→12), so R5 is 12→1
      const indices = Array.from({ length: 12 }, (_, i) => i);
      indices.reverse(); // 11→0
      for (const i of indices) {
        slots.push({
          round: 5,
          pick_number: pickNum++,
          manager_index: i,              // receives the survivor
          picker_index: R5_PARTNER_MAP[i], // partner makes the pick
        });
      }
    } else {
      // R1: 1→12, R2: 1→12, R3: 12→1 (snake), R4: 1→12
      const indices = Array.from({ length: 12 }, (_, i) => i);
      if (round === 3) indices.reverse();
      for (const i of indices) {
        slots.push({
          round,
          pick_number: pickNum++,
          manager_index: i,
          picker_index: i,
        });
      }
    }
  }

  return slots;
}

export const DRAFT_ORDER = buildDraftOrder();

// ─── Hook ───────────────────────────────────────────────────
export function useDraft(seasonId: string) {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Fetch initial data ─────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch survivors
        const { data: survData, error: survErr } = await supabase
          .from('survivors')
          .select('*')
          .eq('season_id', seasonId)
          .order('cast_id');
        if (survErr) throw survErr;

        // Fetch managers
        const { data: mgrData, error: mgrErr } = await supabase
          .from('managers')
          .select('*')
          .eq('season_id', seasonId)
          .order('draft_position');
        if (mgrErr) throw mgrErr;

        // Fetch existing picks
        const { data: pickData, error: pickErr } = await supabase
          .from('draft_picks')
          .select('*')
          .eq('season_id', seasonId)
          .order('pick_number');
        if (pickErr) throw pickErr;

        setSurvivors(survData || []);
        setManagers(mgrData || []);
        setPicks(pickData || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load draft data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [seasonId]);

  // ─── Real-time subscription ──────────────────────────────
  useEffect(() => {
    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`draft_picks_${seasonId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draft_picks',
          filter: `season_id=eq.${seasonId}`,
        },
        (payload) => {
          const newPick = payload.new as DraftPick;
          setPicks((prev) => {
            // Avoid duplicates (in case commissioner's own insert already added it)
            if (prev.some((p) => p.id === newPick.id)) return prev;
            return [...prev, newPick].sort((a, b) => a.pick_number - b.pick_number);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'draft_picks',
          filter: `season_id=eq.${seasonId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setPicks((prev) => prev.filter((p) => p.id !== deletedId));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [seasonId]);

  // ─── Derived state ───────────────────────────────────────
  const currentPickIndex = picks.length; // 0-indexed into DRAFT_ORDER
  const currentSlot = currentPickIndex < DRAFT_ORDER.length ? DRAFT_ORDER[currentPickIndex] : null;
  const isDraftComplete = currentPickIndex >= DRAFT_ORDER.length;

  // Managers sorted by draft position (index = draft_position - 1)
  const sortedManagers = useMemo(
    () => [...managers].sort((a, b) => a.draft_position - b.draft_position),
    [managers]
  );

  // Map manager index → manager object
  const managerByIndex = useCallback(
    (idx: number) => sortedManagers[idx] || null,
    [sortedManagers]
  );

  // Retirement counter for Rounds 2-4 (how many times each survivor_id has been picked)
  const retirementCount = useMemo(() => {
    const counts: Record<string, number> = {};
    picks.forEach((pick) => {
      // Only count R2-R4 picks toward retirement (2-pick limit)
      if (pick.round >= 2 && pick.round <= 4) {
        counts[pick.survivor_id] = (counts[pick.survivor_id] || 0) + 1;
      }
    });
    return counts;
  }, [picks]);

  // Set of survivor IDs picked in Round 4 (used for R5 eligibility)
  const round4Picks = useMemo(() => {
    const r4set = new Set<string>();
    picks.forEach((pick) => {
      if (pick.round === 4) {
        r4set.add(pick.survivor_id);
      }
    });
    return r4set;
  }, [picks]);

  // Check if a survivor is available for the current pick
  const isSurvivorAvailable = useCallback(
    (survivorId: string): boolean => {
      if (!currentSlot || isDraftComplete) return false;

      // Eliminated survivors are never available
      const survivor = survivors.find((s) => s.id === survivorId);
      if (!survivor || !survivor.is_active) return false;

      // R1: no restrictions (free pick, duplicates allowed)
      if (currentSlot.round === 1) return true;

      // R2-R4: survivor is retired after 2 picks across these rounds
      if (currentSlot.round >= 2 && currentSlot.round <= 4) {
        return (retirementCount[survivorId] || 0) < 2;
      }

      // R5: Partner Pick — Anti-Collusion Rule
      // Eligible pool: survivors picked in R4 OR not yet retired (< 2 picks in R2-4)
      // Cannot pick someone already on the receiving manager's team
      if (currentSlot.round === 5) {
        const receivingManager = managerByIndex(currentSlot.manager_index);
        if (!receivingManager) return false;

        // Can't pick someone already on the receiving manager's team (R1-R4)
        const managersPicks = picks.filter((p) => p.manager_id === receivingManager.id);
        if (managersPicks.some((p) => p.survivor_id === survivorId)) return false;

        // Must be in eligible pool: picked in R4 OR not retired
        const wasPickedInR4 = round4Picks.has(survivorId);
        const notRetired = (retirementCount[survivorId] || 0) < 2;
        return wasPickedInR4 || notRetired;
      }

      return true;
    },
    [currentSlot, isDraftComplete, retirementCount, round4Picks, survivors, picks, managerByIndex]
  );

  // Helper: get R5 eligibility reason for UI display
  const getR5EligibilityTag = useCallback(
    (survivorId: string): string | null => {
      if (!currentSlot || currentSlot.round !== 5) return null;
      const wasPickedInR4 = round4Picks.has(survivorId);
      const pickCount = retirementCount[survivorId] || 0;
      if (wasPickedInR4 && pickCount >= 2) return 'R4 pick';
      if (wasPickedInR4) return 'R4 pick';
      if (pickCount < 2) return 'Available';
      return null; // Not eligible
    },
    [currentSlot, round4Picks, retirementCount]
  );

  // Get picks for a specific manager
  const picksForManager = useCallback(
    (managerId: string): DraftPick[] => picks.filter((p) => p.manager_id === managerId),
    [picks]
  );

  // Get the survivor object by ID
  const survivorById = useCallback(
    (id: string): Survivor | undefined => survivors.find((s) => s.id === id),
    [survivors]
  );

  // ─── Commissioner actions ────────────────────────────────

  // Make a pick (commissioner only)
  const makePick = useCallback(
    async (survivorId: string): Promise<{ success: boolean; error?: string }> => {
      if (!currentSlot) return { success: false, error: 'Draft is complete' };

      const manager = managerByIndex(currentSlot.manager_index);
      const picker = managerByIndex(currentSlot.picker_index);
      if (!manager || !picker) return { success: false, error: 'Invalid manager' };

      // Validate availability
      if (!isSurvivorAvailable(survivorId)) {
        return { success: false, error: 'Survivor is not available' };
      }

      try {
        const { data, error: insertErr } = await supabase
          .from('draft_picks')
          .insert({
            season_id: seasonId,
            manager_id: manager.id,
            survivor_id: survivorId,
            round: currentSlot.round,
            pick_number: currentSlot.pick_number,
            picked_by_id: picker.id,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        // Also insert into teams table
        await supabase.from('teams').insert({
          season_id: seasonId,
          manager_id: manager.id,
          survivor_id: survivorId,
          acquired_via: 'draft',
          acquired_round: currentSlot.round,
          is_active: true,
        });

        // Optimistically update local state (realtime will also fire)
        if (data) {
          setPicks((prev) => {
            if (prev.some((p) => p.id === data.id)) return prev;
            return [...prev, data].sort((a, b) => a.pick_number - b.pick_number);
          });
        }

        return { success: true };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to make pick',
        };
      }
    },
    [currentSlot, managerByIndex, isSurvivorAvailable, seasonId]
  );

  // Undo last pick (commissioner only)
  const undoLastPick = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (picks.length === 0) return { success: false, error: 'No picks to undo' };

    const lastPick = picks[picks.length - 1];

    try {
      // Delete from draft_picks
      const { error: delErr } = await supabase
        .from('draft_picks')
        .delete()
        .eq('id', lastPick.id);
      if (delErr) throw delErr;

      // Delete from teams
      await supabase
        .from('teams')
        .delete()
        .eq('season_id', seasonId)
        .eq('manager_id', lastPick.manager_id)
        .eq('survivor_id', lastPick.survivor_id)
        .eq('acquired_via', 'draft')
        .eq('acquired_round', lastPick.round);

      // Optimistically update
      setPicks((prev) => prev.filter((p) => p.id !== lastPick.id));

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to undo pick',
      };
    }
  }, [picks, seasonId]);

  return {
    // Data
    survivors,
    managers: sortedManagers,
    picks,
    loading,
    error,

    // Current state
    currentSlot,
    currentPickIndex,
    isDraftComplete,
    retirementCount,

    // Helpers
    managerByIndex,
    isSurvivorAvailable,
    getR5EligibilityTag,
    picksForManager,
    survivorById,

    // Commissioner actions
    makePick,
    undoLastPick,

    // Constants
    DRAFT_ORDER,
    R5_PARTNER_MAP,
  };
}
