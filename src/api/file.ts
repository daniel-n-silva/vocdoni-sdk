import axios from 'axios';
import { API } from './api';

enum FileAPIMethods {
  CID = '/files/cid',
}

interface IFileCIDResponse {
  /**
   * The calculated CID of the data
   */
  cid: string;
}

export abstract class FileAPI extends API {
  /**
   * Cannot be constructed.
   */
  private constructor() {
    super();
  }

  /**
   * CID generator method via API.
   *
   * @param url - API endpoint URL
   * @param payload - Full payload string of which we want the CID of
   * @returns promised IFileCIDResponse
   */
  public static cid(url: string, payload: string): Promise<IFileCIDResponse> {
    return axios
      .post<IFileCIDResponse>(url + FileAPIMethods.CID, { payload })
      .then((response) => response.data)
      .catch(this.isApiError);
  }

  /**
   * Fetches a document from an arbitrary location.
   *
   * Unlike the rest of the API methods this one does not talk to the vocdoni
   * API, so its errors are not mapped to SDK errors: callers are expected to
   * treat any rejection as "the document is not available".
   *
   * @param url - Absolute URL of the document
   * @param timeout - Milliseconds to wait before giving up
   * @param maxSize - Maximum accepted response size, in bytes
   * @returns The parsed response body
   */
  public static fetch(url: string, timeout: number, maxSize: number): Promise<any> {
    return axios.get(url, { timeout, maxContentLength: maxSize }).then((response) => response.data);
  }
}
