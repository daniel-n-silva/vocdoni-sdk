import chalk from 'chalk';
import { MultiChoiceElection, VoteAPI, type IVotePackage } from '@vocdoni/sdk';
import { getDefaultClient, submitVote, waitForElectionReady } from './utils/utils';
import { getPlainCensus } from './utils/election-process';
import { countBorda } from './utils/borda-tally';

/**
 * Example: Borda count built on top of the Vocdoni SDK.
 *
 * Note: the SDK already has a native "ranked" election type
 * (see `ranked.ts` / https://developer.vocdoni.io/protocol/ballot#linear-weighted-choice)
 * whose *raw* per-choice, per-rank aggregate is structurally close to a Borda
 * count. This example takes the more general route instead — registering
 * each voter's *full ranking* (not per-choice point values) via
 * `MultiChoiceElection`, the same pattern as the STV and Condorcet examples
 * in this folder — because it composes directly with those: the same raw
 * envelope can be fed into IRV, STV, Condorcet or Borda tallies without
 * changing how the election is built or how voters vote.
 *
 * Real-world use: Borda count (and close variants) is used for real national
 * elections in Nauru (national parliament, since 1971) and in Kiribati (to
 * shortlist presidential candidates before a national plurality vote), and
 * a similar positional method is used by the Eurovision Song Contest jury
 * vote. See https://en.wikipedia.org/wiki/Borda_count.
 *
 * As with the other ranked examples, the tally is computed off-chain from
 * the raw envelopes (via `VoteAPI.info`, not `fetchResults()`), so anyone
 * can independently re-run it and get the same winner.
 *
 * https://developer.vocdoni.io/protocol/ballot
 */

const OPTIONS = ['Alps retreat', 'Beach retreat', 'Countryside retreat', 'Downtown retreat'];

// each voter's full ranking, position = preference order, value = option index
const RANKINGS = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [1, 0, 2, 3],
  [0, 1, 3, 2],
  [2, 0, 1, 3],
];

async function main() {
  // Reference case, hand-verified: 3 options, 4 ballots.
  // Points per ballot: 1st = 2, 2nd = 1, 3rd = 0.
  // [0,1,2] -> 0:2 1:1 2:0
  // [0,2,1] -> 0:2 2:1 1:0
  // [1,0,2] -> 1:2 0:1 2:0
  // [0,1,2] -> 0:2 1:1 2:0
  // totals: 0 = 2+2+1+2 = 7, 1 = 1+0+2+1 = 4, 2 = 0+1+0+0 = 1 -> winner 0
  const reference = countBorda(
    [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [0, 1, 2],
    ],
    3
  );
  if (reference.winner !== 0 || reference.points.join(',') !== '7,4,1') {
    throw new Error(`Borda reference case failed: expected winner 0 with points [7,4,1], got ${reference.winner} / ${reference.points}`);
  }

  console.log('Creating census with some random wallets...');
  const { census, participants } = getPlainCensus(RANKINGS.length);

  console.log('Creating election...');
  const { client } = getDefaultClient();
  await client.createAccount();

  const election = MultiChoiceElection.from({
    title: 'Borda count — retreat destination ' + new Date().toISOString(),
    description: 'Rank all options — the raw ranking is the vote array itself.',
    endDate: new Date(new Date().getTime() + 10 * 60 * 60 * 1000).getTime(),
    census,
    maxNumberOfChoices: OPTIONS.length,
  });
  election.minNumberOfChoices = OPTIONS.length;
  election.canRepeatChoices = false;
  election.addQuestion(
    'Rank these retreat destinations by preference',
    '',
    OPTIONS.map((title, value) => ({ title, value }))
  );

  const electionId = await client.createElection(election);
  client.setElectionId(electionId);
  console.log(chalk.green('Election created!'), chalk.blue(electionId));
  await waitForElectionReady(client, electionId);

  const voteIds = await Promise.all(
    participants.map((participant, i) => submitVote(participant, electionId, RANKINGS[i]))
  );

  const rankingsFromChain = await Promise.all(
    voteIds.map(async (voteId) => {
      const info = await VoteAPI.info(client.url, voteId);
      return (info.package as IVotePackage).votes;
    })
  );

  const result = countBorda(rankingsFromChain, OPTIONS.length);
  console.log(chalk.green('Winner:'), OPTIONS[result.winner]);
  console.log('Points per option:', JSON.stringify(result.points));
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
