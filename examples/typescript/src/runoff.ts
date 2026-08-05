import chalk from 'chalk';
import { Election, Vote } from '@vocdoni/sdk';
import { getDefaultClient, waitForElectionReady } from './utils/utils';
import { getPlainCensus } from './utils/election-process';

/**
 * Example: two-round (runoff) elections built on top of the Vocdoni SDK.
 *
 * Not a native election type — there's no single-election primitive for "if
 * nobody clears 50%, automatically hold a second round between the top two".
 * This example shows the orchestration: two ordinary native single-choice
 * elections, chained programmatically. Nothing here needs a custom tally —
 * `fetchResults()` is enough for both rounds — the missing piece is just the
 * decision logic and the second `createElection()` call.
 *
 * Real-world use: the two-round system is the most common single-winner
 * system worldwide for presidential elections — used by France (president,
 * legislature and regional elections), and at least 40 countries overall,
 * concentrated in Europe, Africa and South America. See
 * https://en.wikipedia.org/wiki/Two-round_system and
 * https://www.france24.com/en/france/20220211-explainer-how-does-france-s-two-round-presidential-election-work
 *
 * https://developer.vocdoni.io/protocol/ballot
 */

const CANDIDATES = ['Alameda', 'Bettencourt', 'Carvalho', 'Dias'];

// deterministic distribution for this demo — nobody clears 50%, so a second
// round between the top two (Alameda, Bettencourt) is expected
const FIRST_ROUND_DISTRIBUTION = [5, 4, 2, 1]; // votes per candidate, in CANDIDATES order

async function runSingleChoiceElection(title: string, options: string[], distribution: number[]) {
  const totalVoters = distribution.reduce((a, b) => a + b, 0);
  const { census, participants } = getPlainCensus(totalVoters);

  const { client } = getDefaultClient();
  await client.createAccount();

  const endDate = new Date();
  endDate.setHours(endDate.getHours() + 10);
  const election = Election.from({ title, description: '', endDate: endDate.getTime(), census });
  election.addQuestion(
    title,
    '',
    options.map((option, value) => ({ title: option, value }))
  );

  const electionId = await client.createElection(election);
  client.setElectionId(electionId);
  console.log(chalk.green('Election created!'), chalk.blue(electionId));
  await waitForElectionReady(client, electionId);

  let voterIndex = 0;
  for (let choice = 0; choice < distribution.length; choice++) {
    for (let i = 0; i < distribution[choice]; i++) {
      const voterClient = getDefaultClient(participants[voterIndex++]).client;
      voterClient.setElectionId(electionId);
      await voterClient.submitVote(new Vote([choice]));
    }
  }

  const finalElection = await client.fetchElection(electionId);
  const voteCounts = finalElection.results[0].map((count) => Number(count));
  const total = voteCounts.reduce((a, b) => a + b, 0);
  return { electionId, voteCounts, total };
}

async function main() {
  console.log(chalk.yellow('Round 1'));
  const round1 = await runSingleChoiceElection(
    'Council presidency, round 1 ' + new Date().toISOString(),
    CANDIDATES,
    FIRST_ROUND_DISTRIBUTION
  );
  console.log('Votes:', CANDIDATES.map((c, i) => `${c}: ${round1.voteCounts[i]}`).join(', '));

  const leaderIndex = round1.voteCounts.reduce((best, v, i) => (v > round1.voteCounts[best] ? i : best), 0);
  const leaderShare = round1.voteCounts[leaderIndex] / round1.total;

  if (leaderShare > 0.5) {
    console.log(chalk.green(`${CANDIDATES[leaderIndex]} wins in round 1 with ${(leaderShare * 100).toFixed(1)}%`));
    return;
  }

  console.log(
    chalk.yellow(`No absolute majority (leader ${CANDIDATES[leaderIndex]} at ${(leaderShare * 100).toFixed(1)}%) — running round 2`)
  );

  const ranked = round1.voteCounts
    .map((votes, index) => ({ index, votes }))
    .sort((a, b) => b.votes - a.votes);
  const [first, second] = ranked;
  const runoffCandidates = [CANDIDATES[first.index], CANDIDATES[second.index]];

  console.log(chalk.yellow('Round 2:'), runoffCandidates.join(' vs '));
  // second-round distribution derived from a plausible transfer of the
  // eliminated candidates' votes — hardcoded here for a reproducible demo
  const round2 = await runSingleChoiceElection(
    'Council presidency, round 2 ' + new Date().toISOString(),
    runoffCandidates,
    [7, 5]
  );
  const winnerIndex = round2.voteCounts[0] > round2.voteCounts[1] ? 0 : 1;
  console.log(
    chalk.green(`Winner: ${runoffCandidates[winnerIndex]}`),
    `(${round2.voteCounts[0]} vs ${round2.voteCounts[1]})`
  );
}

main()
  .then(() => {
    console.log(chalk.green('Done ✅'));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
