/**
 * Proportional seat allocation (D'Hondt / Sainte-Laguë highest-averages
 * methods) — not a native Vocdoni election type as a *seat allocation* (see
 * party-list.ts for why), computed here from the native aggregate vote
 * totals per option.
 *
 * Unlike the other examples in this folder, this one needs no custom ballot
 * encoding or off-chain per-voter tally at all: each voter casts one native
 * single-choice vote for their preferred list, `fetchResults()` already
 * gives the correct aggregate vote total per list, and only the seat
 * *allocation* step (turning vote totals into integer seat counts) is
 * missing from the SDK.
 */

export type DivisorMethod = 'dhondt' | 'sainte-lague';

export function allocateSeats(votes: number[], seats: number, method: DivisorMethod): number[] {
  const result = new Array(votes.length).fill(0);
  for (let s = 0; s < seats; s++) {
    let best = -1;
    let bestQuotient = -1;
    for (let i = 0; i < votes.length; i++) {
      const divisor = method === 'dhondt' ? result[i] + 1 : 2 * result[i] + 1;
      const quotient = votes[i] / divisor;
      if (quotient > bestQuotient) {
        bestQuotient = quotient;
        best = i;
      }
    }
    result[best]++;
  }
  return result;
}
