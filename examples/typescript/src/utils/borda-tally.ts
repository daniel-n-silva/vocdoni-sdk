/**
 * Borda count tally — not a native Vocdoni election type as a *ranked*
 * ballot (see borda.ts for why), computed here from full rankings.
 *
 * Each ranking is an array of option indices ordered by preference
 * (ranking[0] = 1st choice, ranking[1] = 2nd choice, ...). Each position
 * awards points: 1st choice gets `numOptions - 1` points, last choice gets 0.
 */

export interface BordaResult {
  winner: number;
  points: number[];
}

export function countBorda(rankings: number[][], numOptions: number): BordaResult {
  const points = Array(numOptions).fill(0);
  for (const ranking of rankings) {
    ranking.forEach((option, position) => {
      points[option] += numOptions - 1 - position;
    });
  }
  const winner = points.reduce((best, p, i) => (p > points[best] ? i : best), 0);
  return { winner, points };
}
