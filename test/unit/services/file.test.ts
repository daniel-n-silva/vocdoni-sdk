import axios from 'axios';
import { FileService } from '../../../src';
import { METADATA_FETCH_TIMEOUT, METADATA_MAX_SIZE } from '../../../src/util/constants';

const IPFS_URL = 'ipfs://bafybeieh4gpvvpvbclcs2yjyfg3nx4nxg6f2ottrfnhpdrdvzzuxozzhqe';
const REMOTE_URL = 'https://saas-api-stg.vocdoni.net/storage/f7d0a0a1.json';

const metadata = () => ({
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
  type: { name: 'single-choice-multiquestion', properties: null },
});

let get: jest.SpyInstance;

beforeEach(() => {
  get = jest.spyOn(axios, 'get');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('File Service tests', () => {
  it('should have the correct type and properties', () => {
    const service = new FileService({});
    expect(service).toBeInstanceOf(FileService);
    expect(service.url).toBeUndefined();
    expect(service.metadata).toEqual({
      allowed_hosts: ['vocdoni.io', 'vocdoni.net'],
      timeout: METADATA_FETCH_TIMEOUT,
      max_size: METADATA_MAX_SIZE,
    });
  });
  it('should only override the given metadata options', () => {
    const service = new FileService({ metadata: { timeout: 1000 } });
    expect(service.metadata.timeout).toEqual(1000);
    expect(service.metadata.allowed_hosts).toEqual(['vocdoni.io', 'vocdoni.net']);
    expect(service.metadata.max_size).toEqual(METADATA_MAX_SIZE);
  });
  it('should only consider allowed https urls resolvable', () => {
    const service = new FileService({});
    expect(service.isResolvableMetadataUrl(REMOTE_URL)).toBe(true);
    expect(service.isResolvableMetadataUrl('https://vocdoni.io/metadata.json')).toBe(true);
    expect(service.isResolvableMetadataUrl('https://API.VOCDONI.IO/metadata.json')).toBe(true);
    // not https
    expect(service.isResolvableMetadataUrl(IPFS_URL)).toBe(false);
    expect(service.isResolvableMetadataUrl('http://saas-api-stg.vocdoni.net/storage/x.json')).toBe(false);
    // not an allowed host
    expect(service.isResolvableMetadataUrl('https://evil.example/metadata.json')).toBe(false);
    expect(service.isResolvableMetadataUrl('https://notvocdoni.io/metadata.json')).toBe(false);
    expect(service.isResolvableMetadataUrl('https://vocdoni.io.evil.example/metadata.json')).toBe(false);
    // not an url at all
    expect(service.isResolvableMetadataUrl('')).toBe(false);
    expect(service.isResolvableMetadataUrl(null)).toBe(false);
    expect(service.isResolvableMetadataUrl('not an url')).toBe(false);
  });
  it('should honor the configured allowed hosts', () => {
    const custom = new FileService({ metadata: { allowed_hosts: ['storage.example'] } });
    expect(custom.isResolvableMetadataUrl('https://storage.example/metadata.json')).toBe(true);
    expect(custom.isResolvableMetadataUrl(REMOTE_URL)).toBe(false);

    const wildcard = new FileService({ metadata: { allowed_hosts: ['*'] } });
    expect(wildcard.isResolvableMetadataUrl('https://storage.example/metadata.json')).toBe(true);
    expect(wildcard.isResolvableMetadataUrl(IPFS_URL)).toBe(false);

    const disabled = new FileService({ metadata: { allowed_hosts: [] } });
    expect(disabled.isResolvableMetadataUrl(REMOTE_URL)).toBe(false);
  });
  it('should fetch an allowed metadata document', async () => {
    get.mockResolvedValue({ data: metadata() });
    const service = new FileService({});

    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toEqual(metadata());
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(REMOTE_URL, {
      timeout: METADATA_FETCH_TIMEOUT,
      maxContentLength: METADATA_MAX_SIZE,
    });
  });
  it('should not fetch anything for non resolvable urls', async () => {
    const service = new FileService({});

    await expect(service.fetchMetadata(IPFS_URL)).resolves.toBeNull();
    await expect(service.fetchMetadata('https://evil.example/metadata.json')).resolves.toBeNull();
    await expect(service.fetchMetadata('')).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
  it('should normalize a document with no media', async () => {
    const { media, ...noMedia } = metadata();
    expect(media).toBeDefined();
    get.mockResolvedValue({ data: noMedia });

    await expect(new FileService({}).fetchMetadata(REMOTE_URL)).resolves.toEqual({ ...noMedia, media: {} });
  });
  it('should resolve to null on failed or unusable responses', async () => {
    const service = new FileService({});

    get.mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));
    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toBeNull();

    get.mockResolvedValueOnce({ data: '<!doctype html><html lang="en"></html>' });
    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toBeNull();

    get.mockResolvedValueOnce({ data: [] });
    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toBeNull();

    get.mockResolvedValueOnce({ data: null });
    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toBeNull();
  });
  it('should cache successful resolutions', async () => {
    get.mockResolvedValue({ data: metadata() });
    const service = new FileService({});

    // concurrent calls share the very same request
    await Promise.all([service.fetchMetadata(REMOTE_URL), service.fetchMetadata(REMOTE_URL)]);
    await service.fetchMetadata(REMOTE_URL);

    expect(get).toHaveBeenCalledTimes(1);
  });
  it('should not cache failed resolutions', async () => {
    const service = new FileService({});

    get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toBeNull();

    get.mockResolvedValueOnce({ data: metadata() });
    await expect(service.fetchMetadata(REMOTE_URL)).resolves.toEqual(metadata());

    expect(get).toHaveBeenCalledTimes(2);
  });
});
