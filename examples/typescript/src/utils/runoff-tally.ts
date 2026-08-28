/**
 * Decision logic for a two-round (runoff) election.
 *
 * Both rounds are ordinary native single-choice elections. These helpers
 * take the final per-candidate vote totals (`results[0]`, read after the
 * round has ended) as bigint, so there is no rounding. The runoff rule —
 * the majority denominator and how ties are broken — is fixed up front; in
 * the example it is committed to the round-1 election metadata.
 */

export interface RunoffRules {
  /**
   * A round-1 candidate wins outright with strictly more than this fraction
   * of the valid votes. 0.5 = absolute majority.
   */
  majorityThreshold: number;
}

const SCALE = 1_000_000n;

/** Candidate index with the most votes; ties broken by lower index. */
export const leader = (votes: bigint[]): number => {
  let best = 0;
  for (let i = 1; i < votes.length; i++) {
    if (votes[i] > votes[best]) best = i;
  }
  return best;
};

/** True when no candidate clears the threshold, so a second round is held. */
export const needsRunoff = (votes: bigint[], rules: RunoffRules): boolean => {
  const total = votes.reduce((a, b) => a + b, 0n);
  if (total === 0n) return false;
  const top = votes[leader(votes)];
  // top / total > threshold  <=>  top * SCALE > round(threshold * SCALE) * total
  const thr = BigInt(Math.round(rules.majorityThreshold * Number(SCALE)));
  return top * SCALE <= thr * total;
};

/**
 * The two candidates that go through to round 2, higher total first.
 * Ties for either place are broken by lower candidate index.
 */
export const runoffContenders = (votes: bigint[]): [number, number] => {
  const order = votes
    .map((v, index) => ({ v, index }))
    .sort((a, b) => (a.v === b.v ? a.index - b.index : a.v < b.v ? 1 : -1));
  return [order[0].index, order[1].index];
};

/** Winner of a two-candidate round; tie broken by lower index. */
export const roundWinner = (votes: bigint[]): number => (votes[1] > votes[0] ? 1 : 0);
