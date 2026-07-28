import axios from 'axios';
import {
  CensusService,
  ElectionAPI,
  ElectionResultsTypeNames,
  ElectionService,
  ElectionStatus,
  FileService,
} from '../../../src';

const URL = 'https://api.vocdoni.io/v2';
const IPFS_URL = 'ipfs://bafybeieh4gpvvpvbclcs2yjyfg3nx4nxg6f2ottrfnhpdrdvzzuxozzhqe';
const REMOTE_URL = 'https://saas-api-stg.vocdoni.net/storage/f7d0a0a1.json';

const metadata = (overrides = {}) => ({
  version: '1.0',
  title: { default: 'A remotely stored election' },
  description: { default: 'Its metadata never reached the chain' },
  media: {},
  questions: [
    {
      title: { default: 'Question' },
      description: { default: 'Description' },
      choices: [
        { title: { default: 'Yes' }, value: 0 },
        { title: { default: 'No' }, value: 1 },
      ],
    },
  ],
  type: { name: ElectionResultsTypeNames.SINGLE_CHOICE_MULTIQUESTION, properties: null },
  ...overrides,
});

// an election info response as returned for a process whose metadata the node
// could not resolve: everything but the `metadata` key
const electionInfo = (overrides = {}) => ({
  electionId: '6b342d99f2188f71faa8771d4aaddcde1066d8e4486b677e928e030000000010',
  organizationId: '6b342d99f2188f71faa8771d4aaddcde1066d8e4',
  status: ElectionStatus.RESULTS,
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-01-08T00:00:00.000Z',
  voteCount: 3,
  finalResults: true,
  result: [['1', '2']],
  manuallyEnded: false,
  chainId: 'vocdoni-stage-11',
  census: {
    censusOrigin: 'OFF_CHAIN_TREE_WEIGHTED',
    censusRoot: 'a3bd4ee45cbbd8ee45cbbd8e5cbbd8ee45cbbd8ee45cbbd8ee45cbbd8ee45cbbd',
    postRegisterCensusRoot: '',
    censusURL: 'https://api.vocdoni.io/v2/censuses/a3bd/export',
    maxCensusSize: 10,
  },
  metadataURL: REMOTE_URL,
  creationTime: '2025-12-31T00:00:00.000Z',
  voteMode: { serial: false, anonymous: false, encryptedVotes: false, uniqueValues: false, costFromWeight: false },
  electionMode: { interruptible: true, dynamicCensus: false, encryptedMetaData: false, preRegister: false },
  tallyMode: { maxCount: 1, maxValue: 1, maxVoteOverwrites: 0, maxTotalCost: 0, costExponent: 10000 },
  ...overrides,
});

// the census is fetched over the network and is irrelevant here: `fetchElection`
// already tolerates it failing
const censusService = { get: () => Promise.reject(new Error('no census service')) } as unknown as CensusService;

const service = () => new ElectionService({ url: URL, censusService });

let info: jest.SpyInstance;
let get: jest.SpyInstance;

beforeEach(() => {
  info = jest.spyOn(ElectionAPI, 'info');
  get = jest.spyOn(axios, 'get');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Election Service metadata resolution tests', () => {
  it('should build its own file service when none is given', () => {
    expect(service().fileService).toBeInstanceOf(FileService);

    const fileService = new FileService({ url: URL });
    expect(new ElectionService({ url: URL, censusService, fileService }).fileService).toBe(fileService);
  });
  it('should resolve the metadata when the api did not inline it', async () => {
    info.mockResolvedValue(electionInfo());
    get.mockResolvedValue({ data: metadata() });

    const election = await service().fetchElection('6b34');

    expect(get).toHaveBeenCalledTimes(1);
    expect(election.title).toEqual({ default: 'A remotely stored election' });
    expect(election.description).toEqual({ default: 'Its metadata never reached the chain' });
    expect(election.resultsType.name).toEqual(ElectionResultsTypeNames.SINGLE_CHOICE_MULTIQUESTION);
    expect(election.questions).toHaveLength(1);
    expect(election.questions[0].choices.map((choice) => choice.results)).toEqual(['1', '2']);
    // the resolved document is part of the raw response too
    expect(election.raw['metadata']).toEqual(metadata());
  });
  it('should not fetch anything when the api inlined the metadata', async () => {
    info.mockResolvedValue(electionInfo({ metadataURL: IPFS_URL, metadata: metadata() }));

    const election = await service().fetchElection('6b34');

    expect(get).not.toHaveBeenCalled();
    expect(election.title).toEqual({ default: 'A remotely stored election' });
  });
  it('should not fetch anything for an ipfs metadata url', async () => {
    info.mockResolvedValue(electionInfo({ metadataURL: IPFS_URL }));

    const election = await service().fetchElection('6b34');

    expect(get).not.toHaveBeenCalled();
    expect(election.title).toBeUndefined();
    expect(election.questions).toEqual([]);
  });
  it('should not fetch anything for an empty metadata url', async () => {
    info.mockResolvedValue(electionInfo({ metadataURL: '' }));

    await service().fetchElection('6b34');

    expect(get).not.toHaveBeenCalled();
  });
  it('should not fetch anything for a host which is not allowed', async () => {
    info.mockResolvedValue(electionInfo({ metadataURL: 'https://evil.example/storage/f7d0a0a1.json' }));

    const election = await service().fetchElection('6b34');

    expect(get).not.toHaveBeenCalled();
    expect(election.title).toBeUndefined();
  });
  it('should leave the election info untouched when the fetch fails', async () => {
    info.mockResolvedValue(electionInfo());
    get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

    const election = await service().fetchElection('6b34');

    expect(get).toHaveBeenCalledTimes(1);
    expect(election.id).toEqual('6b342d99f2188f71faa8771d4aaddcde1066d8e4486b677e928e030000000010');
    expect(election.title).toBeUndefined();
    expect(election.resultsType).toBeUndefined();
    expect(election.questions).toEqual([]);
    expect(election.raw['metadata']).toBeUndefined();
  });
  it('should not throw for a metadata document with no media', async () => {
    const { media, ...noMedia } = metadata();
    expect(media).toBeDefined();
    info.mockResolvedValue(electionInfo());
    get.mockResolvedValue({ data: noMedia });

    const election = await service().fetchElection('6b34');

    expect(election.header).toBeUndefined();
    expect(election.streamUri).toBeUndefined();
    expect(election.title).toEqual({ default: 'A remotely stored election' });
  });
  it('should not throw for a metadata document with no type nor questions', async () => {
    const { type, questions, ...partial } = metadata();
    expect(type).toBeDefined();
    expect(questions).toBeDefined();
    info.mockResolvedValue(electionInfo());
    get.mockResolvedValue({ data: partial });

    const election = await service().fetchElection('6b34');

    expect(election.title).toEqual({ default: 'A remotely stored election' });
    expect(election.resultsType).toBeUndefined();
    expect(election.questions).toEqual([]);
  });
  it('should resolve each metadata url only once', async () => {
    info.mockResolvedValue(electionInfo());
    get.mockResolvedValue({ data: metadata() });
    const electionService = service();

    await Promise.all([electionService.fetchElection('6b34'), electionService.fetchElection('6b34')]);
    await electionService.fetchElection('6b34');

    expect(info).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
