/**
 * Single Transferable Vote, Meek's method — not a native Vocdoni election
 * type (see stv-meek.ts for why), computed here from full rankings.
 *
 * Each ranking is an array of option indices ordered by preference
 * (ranking[0] = 1st choice, ranking[1] = 2nd choice, ...).
 *
 * Meek's method differs from the more common "Gregory" / senatorial-rules
 * STV (see the `stv.ts` example in this folder, which is single-seat / IRV,
 * and its multi-seat Gregory generalization) in one important way: the
 * transfer value ("keep value") of every elected candidate is recalculated
 * by iteration on *every* count, rather than fixed once at the moment of
 * election. This means later transfers correctly account for a candidate's
 * full accumulated support, not just the batch of ballots that happened to
 * put them over quota — and the quota itself shrinks as ballots become
 * "non-transferable" (exhausted), rather than staying fixed at the initial
 * Droop quota. It's more computationally expensive (an iterative
 * fixed-point search instead of a single pass) but more accurate, and is
 * generally considered the more rigorous of the two families.
 */

const PRECISION = 1e-7;
const MAX_ITERATIONS = 1000;
// Naive full-step updates (newKeep = quota / votes) can oscillate between two
// states instead of converging, because changing one candidate's keep value
// changes the votes (and quota) that the next iteration's keep is computed
// from. Damping (a fractional step towards the target each iteration) is the
// standard fix — it trades iteration count for guaranteed convergence.
const DAMPING = 0.5;

export interface MeekResult {
  elected: number[];
  quota: number;
}

export function countMeek(rankings: number[][], numOptions: number, seats: number): MeekResult {
  const elected = new Set<number>();
  const excluded = new Set<number>();
  const keep = new Array(numOptions).fill(1);
  let quota = 0;

  while (elected.size < seats) {
    let votes: number[] = [];

    // iterate keep-values to a fixed point for the currently-elected set
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      votes = new Array(numOptions).fill(0);
      let activeVote = 0;

      for (const ranking of rankings) {
        let remaining = 1;
        for (const option of ranking) {
          if (remaining <= PRECISION) break;
          if (excluded.has(option)) continue;
          const k = elected.has(option) ? keep[option] : 1;
          const value = remaining * k;
          votes[option] += value;
          activeVote += value;
          remaining *= 1 - k;
          if (!elected.has(option)) break; // hopeful absorbs all remaining value and stops the chain
        }
      }

      const newQuota = activeVote / (seats + 1);
      let converged = Math.abs(newQuota - quota) < PRECISION;
      quota = newQuota;
      for (const c of elected) {
        const target = votes[c] > PRECISION ? Math.min(1, quota / votes[c]) : keep[c];
        const newKeep = keep[c] + DAMPING * (target - keep[c]);
        if (Math.abs(newKeep - keep[c]) > PRECISION) converged = false;
        keep[c] = newKeep;
      }
      if (converged) break;
    }

    const hopefuls = Array.from({ length: numOptions }, (_, i) => i).filter(
      (o) => !elected.has(o) && !excluded.has(o)
    );
    const newlyElected = hopefuls.filter((o) => votes[o] >= quota - PRECISION);

    if (newlyElected.length > 0) {
      newlyElected.forEach((o) => {
        elected.add(o);
        keep[o] = votes[o] > PRECISION ? Math.min(1, quota / votes[o]) : 1;
      });
      continue;
    }

    if (elected.size + hopefuls.length <= seats) {
      hopefuls.forEach((o) => elected.add(o));
      break;
    }

    const worst = hopefuls.reduce((w, o) => (votes[o] < votes[w] ? o : w));
    excluded.add(worst);
    keep[worst] = 0;
  }

  return { elected: Array.from(elected), quota };
}
