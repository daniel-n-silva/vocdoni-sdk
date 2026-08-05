import chalk from 'chalk';
import { MultiChoiceElection, VoteAPI, type IVotePackage } from '@vocdoni/sdk';
import { getDefaultClient, submitVote, waitForElectionReady } from './utils/utils';
import { getPlainCensus } from './utils/election-process';
import { countSchulze } from './utils/schulze-tally';

/**
 * Example: Condorcet method (Schulze variant) built on top of the Vocdoni SDK.
 *
 * Condorcet methods pick the candidate who would beat every other candidate
 * in a head-to-head comparison, if such a candidate exists. Like STV, this is
 * not a native election type in Vocdoni — there is no on-chain tally for it,
 * because it requires the individual rankings (not just an aggregate
 * distribution matrix) to build the pairwise preference matrix.
 *
 * Real-world use: the Schulze method is the most widely adopted Condorcet
 * method in practice — used for internal elections by Debian (since 2003),
 * the Wikimedia Foundation (since 2008), Gentoo, KDE, and the Pirate Party of
 * Sweden and Germany. See https://en.wikipedia.org/wiki/Schulze_method.
 *
 * The approach here is the same as the STV example: use a `MultiChoiceElection`
 * purely as an **auditable registration layer** for each voter's full ranking
 * (the vote array itself *is* the ranking — position = preference order,
 * value = candidate index). The tally is computed off-chain from the raw
 * envelopes (via `VoteAPI.info`, not `fetchResults()`), so anyone can
 * independently re-run it and get the same winner.
 *
 * https://developer.vocdoni.io/protocol/ballot
 */

const OPTIONS = ['Alps retreat', 'Beach retreat', 'Countryside retreat', 'Downtown retreat'];

// each voter's full ranking, position = preference order, value = option index
const RANKINGS = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 0, 1, 3],
  [0, 2, 1, 3],
  [1, 2, 0, 3],
];

async function main() {
  // Reference case: the worked example from the Schulze method Wikipedia
  // page (45 voters, candidates A..E) — well-known result, winner is E.
  const A = 0, B = 1, C = 2, D = 3, E = 4;
  const reference: number[][] = [
    ...Array(5).fill([A, C, B, E, D]),
    ...Array(5).fill([A, D, E, C, B]),
    ...Array(8).fill([B, E, D, A, C]),
    ...Array(3).fill([C, A, B, E, D]),
    ...Array(7).fill([C, A, E, B, D]),
    ...Array(2).fill([C, B, A, D, E]),
    ...Array(7).fill([D, C, E, B, A]),
    ...Array(8).fill([E, B, A, D, C]),
  ];
  const referenceResult = countSchulze(reference, 5);
  if (referenceResult.winner !== E) {
    throw new Error(`Schulze reference case failed: expected winner ${E} (E), got ${referenceResult.winner}`);
  }

  console.log('Creating census with some random wallets...');
  const { census, participants } = getPlainCensus(RANKINGS.length);

  console.log('Creating election...');
  const { client } = getDefaultClient();
  await client.createAccount();

  const election = MultiChoiceElection.from({
    title: 'Condorcet (Schulze) — retreat destination ' + new Date().toISOString(),
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

  // read raw envelopes (not fetchResults) so the tally can be re-run independently by anyone
  const rankingsFromChain = await Promise.all(
    voteIds.map(async (voteId) => {
      const info = await VoteAPI.info(client.url, voteId);
      return (info.package as IVotePackage).votes;
    })
  );

  const result = countSchulze(rankingsFromChain, OPTIONS.length);
  console.log(chalk.green('Winner:'), OPTIONS[result.winner]);
  console.log('Pairwise preference matrix:', JSON.stringify(result.pairwise));
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
