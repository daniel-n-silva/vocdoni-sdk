import chalk from 'chalk';
import { Election, Vote } from '@vocdoni/sdk';
import { getDefaultClient, waitForElectionReady } from './utils/utils';
import { getPlainCensus } from './utils/election-process';
import { allocateSeats } from './utils/party-list-tally';

/**
 * Example: proportional seat allocation (D'Hondt / Sainte-Laguë) built on
 * top of the Vocdoni SDK.
 *
 * Unlike the ranked-ballot examples in this folder (STV, Condorcet, Borda),
 * this one needs no custom ballot encoding at all — it's a completely
 * ordinary native single-choice election (each voter picks one list/party).
 * The only thing missing from the SDK is the seat *allocation* step: turning
 * `fetchResults()`'s vote totals per option into integer seat counts. That
 * step is pure arithmetic on the aggregate — see `utils/party-list-tally.ts`
 * — and needs no raw envelope access at all.
 *
 * Real-world use: D'Hondt is used to elect national/regional legislatures in
 * dozens of countries (Spain, Portugal, Poland, Israel, Japan, the
 * Netherlands, Turkey and many more — see
 * https://en.wikipedia.org/wiki/D%27Hondt_method). Sainte-Laguë (which tends
 * to produce more proportional results, with less bias towards larger
 * parties) is used by Germany, New Zealand, Sweden and Norway — see
 * https://en.wikipedia.org/wiki/Sainte-Lagu%C3%AB_method and
 * https://electoral-reform.org.uk/what-is-the-difference-between-dhondt-sainte-lague-and-hare/
 * for a comparison of the two.
 *
 * https://developer.vocdoni.io/protocol/ballot
 */

const SEATS = 4;
const LISTS = ['List A', 'List B', 'List C'];

// how many of the (deterministic, for this demo) voters choose each list
const VOTE_DISTRIBUTION = [11, 7, 4]; // 11 for List A, 7 for List B, 4 for List C

async function main() {
  // Reference case, hand-verified: votes [550, 350, 200], 4 seats.
  // D'Hondt quotients (divide by 1,2,3,4...): A 550/275/183.3/137.5,
  // B 350/175/116.7/87.5, C 200/100/66.7/50. Top 4: 550(A), 350(B), 275(A),
  // 200(C) -> seats [2, 1, 1].
  const reference = allocateSeats([550, 350, 200], 4, 'dhondt');
  if (reference.join(',') !== '2,1,1') {
    throw new Error(`D'Hondt reference case failed: expected [2,1,1], got ${reference}`);
  }

  const totalVoters = VOTE_DISTRIBUTION.reduce((a, b) => a + b, 0);
  console.log('Creating census with some random wallets...');
  const { census, participants } = getPlainCensus(totalVoters);

  console.log('Creating election...');
  const { client } = getDefaultClient();
  await client.createAccount();

  const endDate = new Date();
  endDate.setHours(endDate.getHours() + 10);
  const election = Election.from({
    title: 'Party list vote — council seats ' + new Date().toISOString(),
    description: 'Pick one list.',
    endDate: endDate.getTime(),
    census,
  });
  election.addQuestion(
    'Which list do you support?',
    '',
    LISTS.map((title, value) => ({ title, value }))
  );

  const electionId = await client.createElection(election);
  client.setElectionId(electionId);
  console.log(chalk.green('Election created!'), chalk.blue(electionId));
  await waitForElectionReady(client, electionId);

  console.log('Submitting votes...');
  let voterIndex = 0;
  for (let list = 0; list < VOTE_DISTRIBUTION.length; list++) {
    for (let i = 0; i < VOTE_DISTRIBUTION[list]; i++) {
      const participant = participants[voterIndex++];
      const voterClient = getDefaultClient(participant).client;
      voterClient.setElectionId(electionId);
      await voterClient.submitVote(new Vote([list]));
    }
  }

  const finalElection = await client.fetchElection(electionId);
  const voteCounts = finalElection.results[0].map((count) => Number(count));
  const seats = allocateSeats(voteCounts, SEATS, 'dhondt');

  console.log(chalk.green('Votes per list:'), JSON.stringify(voteCounts));
  console.log(chalk.green('Seats per list (D\'Hondt):'), LISTS.map((l, i) => `${l}: ${seats[i]}`).join(', '));
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
