/**
 * Condorcet method (Schulze variant) tally — not a native Vocdoni election
 * type (see condorcet.ts for why), computed here from full rankings.
 *
 * Each ranking is an array of option indices ordered by preference
 * (ranking[0] = 1st choice, ranking[1] = 2nd choice, ...).
 */

export interface SchulzeResult {
  winner: number;
  pairwise: number[][];
  strongestPaths: number[][];
}

/**
 * Counts votes using the Schulze method: builds the pairwise preference
 * matrix, then computes the strongest (widest) path between every pair of
 * candidates (a Floyd–Warshall variant), and picks the candidate whose path
 * to every other candidate is at least as strong as the reverse path.
 *
 * The Schulze method is the most widely used Condorcet-consistent method in
 * practice — it always elects the pairwise (Condorcet) winner when one
 * exists, and resolves cycles ("rock-paper-scissors" preference loops)
 * deterministically, unlike plain pairwise comparison.
 */
export function countSchulze(rankings: number[][], numOptions: number): SchulzeResult {
  const pairwise: number[][] = Array.from({ length: numOptions }, () => Array(numOptions).fill(0));

  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      for (let j = i + 1; j < ranking.length; j++) {
        pairwise[ranking[i]][ranking[j]]++;
      }
    }
  }

  // strongest path (widest bottleneck path) between every pair, Floyd–Warshall style
  const p: number[][] = Array.from({ length: numOptions }, () => Array(numOptions).fill(0));
  for (let i = 0; i < numOptions; i++) {
    for (let j = 0; j < numOptions; j++) {
      if (i !== j) p[i][j] = pairwise[i][j] > pairwise[j][i] ? pairwise[i][j] : 0;
    }
  }
  for (let i = 0; i < numOptions; i++) {
    for (let j = 0; j < numOptions; j++) {
      if (i === j) continue;
      for (let k = 0; k < numOptions; k++) {
        if (i === k || j === k) continue;
        p[j][k] = Math.max(p[j][k], Math.min(p[j][i], p[i][k]));
      }
    }
  }

  let winner = 0;
  for (let i = 0; i < numOptions; i++) {
    let beatsEveryone = true;
    for (let j = 0; j < numOptions; j++) {
      if (i === j) continue;
      if (p[i][j] < p[j][i]) { beatsEveryone = false; break; }
    }
    if (beatsEveryone) { winner = i; break; }
  }

  return { winner, pairwise, strongestPaths: p };
}
