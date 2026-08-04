import chalk from 'chalk';
import { MultiChoiceElection, VoteAPI, type IVotePackage } from '@vocdoni/sdk';
import { getDefaultClient, getRandomVoters, submitVote, waitForElectionReady } from './utils/utils';
import { getPlainCensus } from './utils/election-process';
import { countSTV } from './utils/stv-tally';

/**
 * Example: Single Transferable Vote (STV) built on top of the Vocdoni SDK.
 *
 * STV is not a native election type in Vocdoni — there is no envelope type or
 * on-chain tally for it (the built-in "ranked" example, `ranked.ts`, is a
 * Borda-count-style distribution: it sums points per rank per choice, but it
 * doesn't do elimination rounds or vote transfers, and its native
 * `fetchResults()` aggregate can't be used to run STV, because STV needs the
 * *individual* rankings, not just an aggregate distribution matrix).
 *
 * The approach here: use a `MultiChoiceElection` purely as an **auditable
 * registration layer** for each voter's full ranking (the vote array itself
 * *is* the ranking — position = preference order, value = candidate index).
 * The actual STV tally (elimination rounds, vote transfers) is computed
 * off-chain, reading the raw envelopes via `VoteAPI.info` (not
 * `fetchResults()`), so anyone can independently re-run the same tally from
 * the public envelopes and get the same winner.
 *
 * https://developer.vocdoni.io/protocol/ballot
 */

const VOTERS_NUM = 5;
const OPTIONS = ['Sierra retreat', 'Beach retreat', 'City retreat', 'No retreat this year'];

// each voter's full ranking, position = preference order, value = option index
const RANKINGS = [
  [0, 1, 2, 3],
  [1, 0, 2, 3],
  [2, 1, 0, 3],
  [1, 2, 0, 3],
  [3, 0, 1, 2],
];

async function main() {
  const reference = countSTV(
    [
      [1, 0, 2],
      [1, 2, 0],
      [0, 1, 2],
      [2, 0, 1],
    ],
    3
  );
  if (reference.winner !== 1) {
    throw new Error(`STV reference case failed: expected winner 1, got ${reference.winner}`);
  }

  console.log('Creating census with some random wallets...');
  const { census, participants } = getPlainCensus(VOTERS_NUM);

  console.log('Creating election...');
  const { client } = getDefaultClient();
  await client.createAccount();

  const election = MultiChoiceElection.from({
    title: 'STV — retreat destination ' + new Date().toISOString(),
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

  // read raw envelopes (not fetchResults) so the STV tally can be re-run independently by anyone
  const rankingsFromChain = await Promise.all(
    voteIds.map(async (voteId) => {
      const info = await VoteAPI.info(client.url, voteId);
      return (info.package as IVotePackage).votes;
    })
  );

  const result = countSTV(rankingsFromChain, OPTIONS.length);
  console.log(chalk.green('Winner:'), OPTIONS[result.winner]);
  console.log('Rounds:', JSON.stringify(result.rounds, null, 2));
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
