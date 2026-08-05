import chalk from 'chalk';
import { MultiChoiceElection, VoteAPI, type IVotePackage } from '@vocdoni/sdk';
import { getDefaultClient, submitVote, waitForElectionReady } from './utils/utils';
import { getPlainCensus } from './utils/election-process';
import { countMeek } from './utils/stv-meek-tally';

/**
 * Example: multi-seat STV using Meek's method, built on top of the Vocdoni SDK.
 *
 * Like the `stv.ts` example in this folder (single-seat / IRV), this is not
 * a native election type — there is no on-chain tally for it. This example
 * additionally generalizes to multiple seats and uses Meek's method rather
 * than the more common "Gregory" surplus-transfer rule — see
 * `utils/stv-meek-tally.ts` for what specifically differs and why.
 *
 * Real-world use: Meek's method is used for local government elections in
 * New Zealand under the Local Electoral Act 2001 (first used for a real
 * public election in 2004 — a world first for a computer-counted Meek STV
 * election), and has been used since the 1980s by organisations including
 * the Royal Statistical Society. See
 * https://www.dia.govt.nz/diawebsite.nsf/wpg_URL/Resource-material-STV-Information-Index
 * and I.D. Hill's "Implementing STV by Meek's method"
 * (https://www.votingmatters.org.uk/ISSUE22/I22P2.pdf) for the reference
 * algorithm this implementation follows (with damped fixed-point iteration
 * for the keep-value convergence — a standard technique to avoid the
 * oscillation a naive full-step update can fall into).
 *
 * As with the other ranked examples, the tally is computed off-chain from
 * the raw envelopes (via `VoteAPI.info`, not `fetchResults()`), so anyone
 * can independently re-run it and get the same result.
 *
 * https://developer.vocdoni.io/protocol/ballot
 */

const SEATS = 2;
const OPTIONS = ['Alps retreat', 'Beach retreat', 'Countryside retreat'];

// each voter's full ranking, position = preference order, value = option index
const RANKINGS = [
  [0, 1, 2],
  [0, 1, 2],
  [0, 1, 2],
  [1, 0, 2],
  [2, 0, 1],
];

async function main() {
  // Reference case, hand-traced and independently verified: 3 options, 2
  // seats, 5 ballots (3 first-preference for option 0, one each for 1 and
  // 2). Option 0 has a clear surplus over quota; once its keep-value
  // converges, its transferred surplus plus option 1's own first
  // preference clears the (also re-converged) quota for option 1 too.
  // Expected: elected = {0, 1}, quota = 5/3 (active vote never exhausts,
  // since every ballot ranks all 3 options).
  const reference = countMeek(
    [
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
      [1, 0, 2],
      [2, 0, 1],
    ],
    3,
    2
  );
  const referenceOk =
    reference.elected.slice().sort().join(',') === '0,1' && Math.abs(reference.quota - 5 / 3) < 1e-6;
  if (!referenceOk) {
    throw new Error(`Meek reference case failed: expected elected [0,1], quota 5/3, got ${JSON.stringify(reference)}`);
  }

  console.log('Creating census with some random wallets...');
  const { census, participants } = getPlainCensus(RANKINGS.length);

  console.log('Creating election...');
  const { client } = getDefaultClient();
  await client.createAccount();

  const election = MultiChoiceElection.from({
    title: 'STV (Meek) — retreat destination, 2 seats ' + new Date().toISOString(),
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

  const result = countMeek(rankingsFromChain, OPTIONS.length, SEATS);
  console.log(chalk.green('Elected:'), result.elected.map((i) => OPTIONS[i]).join(', '));
  console.log('Quota:', result.quota);
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
