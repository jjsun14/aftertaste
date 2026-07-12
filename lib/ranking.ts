/**
 * Shared tier-insertion planning — the single source of truth for what
 * happens after StepCompare's binary search finishes.
 *
 * Used by:
 *  - add.tsx        (new memory, selfId = 'NEW')
 *  - rerank/[id]    (existing memory re-entering its tier)
 *  - import graduation (future)
 *
 * Handles the two tie concerns:
 *  - "Too Close" tie creation: reuse the partner's tiedGroupId, or mint a
 *    fresh one and assign it to BOTH sides.
 *  - Orphan cleanup (rerank only): if self leaves an old tie group and
 *    exactly one member remains, a tie of one is meaningless — clear it.
 */
import {
  newTiedGroupId,
  recalculateTierScores,
  type Memory,
  type Tier,
} from '@/data/mockData';

export interface TierInsertionPlan {
  /** Redistributed composite score for the inserted memory. */
  selfScore: number;
  /** Tie group the inserted memory belongs to (null = untied). */
  selfTiedGroupId: string | null;
  /** Score (and, where changed, tie-group) writes for the peer memories. */
  peerUpdates: { id: string; compositeScore: number; tiedGroupId?: string | null }[];
}

export function planTierInsertion(opts: {
  /** Id spliced into the ranked list ('NEW' for a not-yet-saved memory). */
  selfId: string;
  /** Insertion position from StepCompare's binary search. */
  insertionIndex: number;
  /** Same-tier, same-eatery-type peers, sorted ascending by score. */
  rankedGroup: Memory[];
  tier: Tier;
  /** Set when the user tapped "Too Close" on this peer. */
  tiedWithMemoryId?: string;
  /** Self's previous tie group (rerank), for orphan cleanup. */
  selfOldTiedGroupId?: string | null;
  /** Score to fall back to if redistribution can't produce one. */
  fallbackScore: number;
}): TierInsertionPlan {
  const {
    selfId,
    insertionIndex,
    rankedGroup,
    tier,
    tiedWithMemoryId,
    selfOldTiedGroupId,
    fallbackScore,
  } = opts;

  // Resolve self's tie group (and possibly the partner's).
  // Three cases:
  //   1. Not tied: selfTiedGroupId = null, no partner update.
  //   2. Tied with a partner that already has a group: reuse its id.
  //   3. Tied with a previously-untied partner: mint a new group id and
  //      assign it to BOTH self and the partner.
  let selfTiedGroupId: string | null = null;
  let partnerUpdate: { id: string; tiedGroupId: string } | null = null;
  if (tiedWithMemoryId) {
    const partner = rankedGroup.find((m) => m.id === tiedWithMemoryId);
    if (partner?.tiedGroupId) {
      selfTiedGroupId = partner.tiedGroupId;
    } else if (partner) {
      const fresh = newTiedGroupId();
      selfTiedGroupId = fresh;
      partnerUpdate = { id: partner.id, tiedGroupId: fresh };
    }
  }

  // If self previously belonged to a different tie group and only one
  // member of that group remains, clear the leftover's tiedGroupId.
  const orphanedTiedIds = new Set<string>();
  if (selfOldTiedGroupId && selfOldTiedGroupId !== selfTiedGroupId) {
    const remaining = rankedGroup.filter((m) => m.tiedGroupId === selfOldTiedGroupId);
    if (remaining.length === 1) {
      orphanedTiedIds.add(remaining[0].id);
    }
  }

  // Build ranked items with tie groups so recalc can collapse tied slots.
  const rankedItems: { id: string; tiedGroupId?: string | null }[] = rankedGroup.map((m) => {
    if (orphanedTiedIds.has(m.id)) return { id: m.id, tiedGroupId: null };
    if (partnerUpdate && m.id === partnerUpdate.id) {
      return { id: m.id, tiedGroupId: partnerUpdate.tiedGroupId };
    }
    return { id: m.id, tiedGroupId: m.tiedGroupId ?? null };
  });
  rankedItems.splice(insertionIndex, 0, { id: selfId, tiedGroupId: selfTiedGroupId });

  const newScores = recalculateTierScores(rankedItems, tier);
  const selfScore = newScores.find((s) => s.id === selfId)?.compositeScore ?? fallbackScore;

  // Attach tie-group writes for peers whose membership changed.
  const peerUpdates = newScores
    .filter((s) => s.id !== selfId)
    .map((s) => {
      if (partnerUpdate && s.id === partnerUpdate.id) {
        return { ...s, tiedGroupId: partnerUpdate.tiedGroupId };
      }
      if (orphanedTiedIds.has(s.id)) return { ...s, tiedGroupId: null };
      return s;
    });

  return { selfScore, selfTiedGroupId, peerUpdates };
}
