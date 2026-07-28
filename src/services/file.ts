import { Service, ServiceProperties } from './service';
import { FileAPI } from '../api';
import invariant from 'tiny-invariant';
import { Buffer } from 'buffer';
import { ElectionMetadata } from '../types';
import { METADATA_ALLOWED_HOSTS, METADATA_FETCH_TIMEOUT, METADATA_MAX_SIZE } from '../util/constants';

/**
 * Policy applied when resolving metadata documents which are not stored on
 * IPFS (and are therefore not resolved by the API itself).
 *
 * @typedef MetadataOptions
 * @property {string[] | null} allowed_hosts Hosts allowed to serve metadata documents. Subdomains of the listed hosts
 * are allowed too, `['*']` allows any host and `[]` disables remote resolution entirely.
 * @property {number | null} timeout Milliseconds to wait for a metadata document before giving up
 * @property {number | null} max_size Maximum accepted metadata document size, in bytes
 */
export type MetadataOptions = {
  allowed_hosts?: string[];
  timeout?: number;
  max_size?: number;
};

interface FileServiceProperties {
  metadata: MetadataOptions;
}

type FileServiceParameters = ServiceProperties & FileServiceProperties;

export class FileService extends Service implements FileServiceProperties {
  public metadata: MetadataOptions;

  private readonly metadataCache: Map<string, Promise<ElectionMetadata | null>> = new Map();

  /**
   * Instantiate the election service.
   *
   * @param params - The service parameters
   */
  constructor(params: Partial<FileServiceParameters>) {
    super();
    Object.assign(this, params);
    this.metadata = {
      allowed_hosts: this.metadata?.allowed_hosts ?? METADATA_ALLOWED_HOSTS,
      timeout: this.metadata?.timeout ?? METADATA_FETCH_TIMEOUT,
      max_size: this.metadata?.max_size ?? METADATA_MAX_SIZE,
    };
  }

  /**
   * Fetches the CID expected for the specified data content.
   *
   * @param data - The data of which we want the CID of
   * @returns Resulting CID
   */
  calculateCID(data: string): Promise<string> {
    invariant(this.url, 'No URL set');
    const b64Data = Buffer.from(data, 'utf8').toString('base64');
    return FileAPI.cid(this.url, b64Data).then((response) => response.cid);
  }

  /**
   * Tells whether the SDK is willing to resolve the given metadata URI itself.
   *
   * Only `https://` URIs served by an allowed host qualify: `ipfs://` URIs are
   * already resolved by the API, and metadata URIs come from the chain, so any
   * other location is a request we don't want to make on the consumer behalf.
   *
   * @param uri - The metadata URI, as reported by the API
   */
  isResolvableMetadataUrl(uri: string): boolean {
    if (!uri) return false;

    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch (_) {
      return false;
    }

    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();

    return this.metadata.allowed_hosts.some((allowed) => {
      if (allowed === '*') return true;
      const allowedHost = allowed.toLowerCase();
      return host === allowedHost || host.endsWith('.' + allowedHost);
    });
  }

  /**
   * Fetches an election metadata document stored outside IPFS.
   *
   * Resolution is best effort: any failure (disallowed host, timeout, network
   * or CORS error, malformed payload) resolves to `null` rather than rejecting,
   * so an unreachable document degrades the resulting election instead of
   * breaking it.
   *
   * Successful resolutions are cached in memory by URI, since elections are
   * usually fetched in batches.
   *
   * @param uri - The metadata URI, as reported by the API
   * @returns The metadata document, or null when it could not be resolved
   */
  fetchMetadata(uri: string): Promise<ElectionMetadata | null> {
    if (!this.isResolvableMetadataUrl(uri)) return Promise.resolve(null);
    if (this.metadataCache.has(uri)) return this.metadataCache.get(uri);

    const request = FileAPI.fetch(uri, this.metadata.timeout, this.metadata.max_size)
      .then((data) => FileService.normalizeMetadata(data))
      .catch(() => null)
      .then((metadata) => {
        // remembering a failure would turn a transient error into a permanent
        // one for the whole lifetime of the client
        if (metadata === null) this.metadataCache.delete(uri);
        return metadata;
      });

    this.metadataCache.set(uri, request);

    return request;
  }

  /**
   * Shapes a freshly fetched document into something the rest of the SDK can
   * safely read, discarding anything which is not metadata shaped.
   *
   * Anything but a plain object is dropped: a host answering with an error page
   * or a bare string is telling us it has no metadata to serve, and attaching
   * that to the election would be worse than leaving it empty.
   *
   * @param data - The fetched document
   */
  private static normalizeMetadata(data: any): ElectionMetadata | null {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;

    // `media` is optional for everyone producing metadata but not for everyone
    // reading it, so make sure it is always there
    return { ...data, media: data.media ?? {} } as ElectionMetadata;
  }
}
