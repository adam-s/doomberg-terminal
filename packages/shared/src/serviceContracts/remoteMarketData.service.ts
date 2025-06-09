import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface RequestMetadata {
  method: string;
  arguments: unknown[];
  timestamp: string;
  result: unknown;
  _metadata?: {
    requestId: string;
    timeTaken: number;
  };
}

/**
 * Metadata about an API request
 */
export interface RequestMetadataRecord {
  method: string;
  arguments: unknown[];
  requestId?: string; // Make requestId optional to match actual data
  timeTaken?: number; // Make timeTaken optional to match actual data
}

/**
 * Market data record for replay functionality
 */
export interface MarketDataRecord {
  id: number;
  time: Date;
  endpoint: string;
  symbol: string;
  response: unknown;
  request_metadata: RequestMetadataRecord;
}

/**
 * Parameters for querying historical market data
 */
export interface HistoricalDataParams {
  startTime: Date;
  endTime?: Date;
  endpoint?: string;
  symbol?: string;
  limit?: number;
}

export interface IRemoteMarketDataService {
  _serviceBrand: undefined;

  /**
   * Captures request data for storage
   */
  captureRequestData: (data: RequestMetadata) => Promise<void>;

  /**
   * Loads market data from the database for a specific time window
   * @param startTime Beginning of time window
   * @param endTime End of time window
   */
  loadMarketData(params: HistoricalDataParams): Promise<MarketDataRecord[]>;

  /**
   * Query market data for a specific endpoint and symbol on a specific date
   * Useful for direct access to infrequently called endpoints
   */
  queryEndpointData(params: {
    endpoint: string;
    symbol?: string;
    replayDate?: Date;
    limit?: number;
  }): Promise<MarketDataRecord[]>;

  /**
   * Get distinct symbols stored in the database
   */
  getDistinctSymbols(): Promise<string[]>;

  /**
   * Get distinct endpoints (API methods) stored in the database
   */
  getDistinctEndpoints(): Promise<string[]>;
}

export const IRemoteMarketDataService =
  createDecorator<IRemoteMarketDataService>('remoteMarketDataService');
