// =============================================================================
// lib/fsg-checks.ts — cross-checks between FSG's independent data sources
// =============================================================================
// Spec §3.3: parse the recap's summary headers AND the itemized list, and the
// season page's cumulative Surv Pts, then assert they agree. Mismatches are
// surfaced to the commissioner rather than scored silently.
// =============================================================================

import type { ParsedEpisode, ParsedSeasonRow } from './fsg-parser';

export interface SurvivorRef { id: string; fsgId: number; name: string; tribe: string; originalTribe: string | null }

const norm = (s: string) => s.toLowerCase().replace(/["']/g, '').trim();

/** Header boxes (Immunity: Savu / Reward: Rob, Jenna / Voted Out: Aaliyah) vs itemized lines. */
export function checkSummary(ep: ParsedEpisode, byFsgId: Map<number, SurvivorRef>): string[] {
  const issues: string[] = [];
  const nameOf = (fsgId: number) => byFsgId.get(fsgId)?.name ?? `#${fsgId}`;

  const winners = (cat: 'reward' | 'immunity') =>
    [...new Set(ep.events.filter(e => e.category === cat).map(e => e.fsgId))];

  const matchesHeaderValue = (fsgId: number, value: string) => {
    const s = byFsgId.get(fsgId);
    if (!s) return false;
    const v = norm(value);
    return norm(s.name) === v || norm(s.tribe) === v || (s.originalTribe ? norm(s.originalTribe) === v : false);
  };

  const compare = (label: string, values: string[], ids: number[]) => {
    for (const v of values) {
      if (!ids.some(id => matchesHeaderValue(id, v))) {
        issues.push(`Episode ${ep.episode}: header says ${label} "${v}", but no itemized ${label.toLowerCase()} winner matches.`);
      }
    }
    for (const id of ids) {
      if (!values.some(v => matchesHeaderValue(id, v))) {
        issues.push(`Episode ${ep.episode}: ${nameOf(id)} has an itemized ${label.toLowerCase()} win, but the header (${values.join(', ') || 'none'}) doesn't list them or their tribe.`);
      }
    }
  };

  const header = (label: string) => ep.summary.filter(b => b.label === label).flatMap(b => b.values);
  const combined = header('Rew/Imm');

  const immHeader = [...header('Immunity'), ...combined];
  const rewHeader = [...header('Reward'), ...combined];
  if (combined.length) {
    compare('Reward/Immunity', combined, [...new Set([...winners('reward'), ...winners('immunity')])]);
  } else {
    if (immHeader.length || winners('immunity').length) compare('Immunity', immHeader, winners('immunity'));
    if (rewHeader.length || winners('reward').length) compare('Reward', rewHeader, winners('reward'));
  }

  const votedHeader = header('Voted Out');
  const departed = ep.departures.map(d => d.fsgId);
  for (const v of votedHeader) {
    if (!departed.some(id => matchesHeaderValue(id, v))) {
      issues.push(`Episode ${ep.episode}: header says "${v}" was voted out, but no departure line matches.`);
    }
  }
  return issues;
}

/**
 * Season page Surv Pts is cumulative. Every survivor's parsed points summed
 * across all recap episodes must equal it. Out Pts is ignored on purpose.
 */
export function checkCumulative(episodes: ParsedEpisode[], season: ParsedSeasonRow[], byFsgId: Map<number, SurvivorRef>): string[] {
  const issues: string[] = [];
  const parsed = new Map<number, number>();
  for (const ep of episodes) for (const e of ep.events) parsed.set(e.fsgId, (parsed.get(e.fsgId) || 0) + e.points);
  for (const row of season) {
    const sum = parsed.get(row.fsgId) || 0;
    if (sum !== row.survPts) {
      issues.push(`${byFsgId.get(row.fsgId)?.name ?? row.name}: FSG shows ${row.survPts} Surv Pts but the recap actions add up to ${sum}.`);
    }
  }
  return issues;
}
