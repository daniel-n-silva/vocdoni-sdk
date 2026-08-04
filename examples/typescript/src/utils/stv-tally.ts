/**
 * Single Transferable Vote (instant-runoff) tally — not a native Vocdoni
 * election type (see stv.ts for why), computed here from full rankings.
 *
 * Each ranking is an array of option indices ordered by preference
 * (ranking[0] = 1st choice, ranking[1] = 2nd choice, ...).
 */

export interface Round {
  eliminated: number | null;
  counts: Record<number, number>;
}

export interface StvResult {
  winner: number;
  rounds: Round[];
}

/**
 * Counts votes by successive elimination: each round, tally the still-valid
 * first preference (the first option in each ranking that hasn't been
 * eliminated yet); eliminate the option with the fewest votes; repeat until
 * one remains.
 */
export function countSTV(rankings: number[][], numOptions: number): StvResult {
  const eliminated = new Set<number>();
  const rounds: Round[] = [];

  while (eliminated.size < numOptions - 1) {
    const counts: Record<number, number> = {};
    for (let o = 0; o < numOptions; o++) if (!eliminated.has(o)) counts[o] = 0;

    for (const ranking of rankings) {
      const firstValid = ranking.find((option) => !eliminated.has(option));
      if (firstValid !== undefined) counts[firstValid]++;
    }

    const remaining = Object.keys(counts).map(Number);
    if (remaining.length === 1) {
      rounds.push({ eliminated: null, counts });
      return { winner: remaining[0], rounds };
    }

    const leastVoted = remaining.reduce((worst, o) => (counts[o] < counts[worst] ? o : worst));
    eliminated.add(leastVoted);
    rounds.push({ eliminated: leastVoted, counts });
  }

  const winner = Array.from({ length: numOptions }, (_, i) => i).find((o) => !eliminated.has(o))!;
  return { winner, rounds };
}
