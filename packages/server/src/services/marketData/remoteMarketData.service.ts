import { Disposable } from 'vs/base/common/lifecycle';
import { Logger, LogComponent } from '@shared/utils/logging';
import {
  IRemoteMarketDataService,
  RequestMetadata,
  MarketDataRecord,
  HistoricalDataParams,
} from '@shared/serviceContracts/remoteMarketData.service';
import { MarketDataCapture, MarketDataModel } from '../../data-layer/marketData/marketData.model';
import { IDatabaseService } from '../database/database.service';

export class RemoteMarketDataService extends Disposable implements IRemoteMarketDataService {
  declare readonly _serviceBrand: undefined;

  // Use the logging class for debug and error output
  private _logger = Logger.forComponent('RemoteMarketDataService' as LogComponent);
  private _queue: RequestMetadata[] = [];
  private _isProcessing = false;
  private _maxQueueSize = 100;
  private _marketDataModel: MarketDataModel;

  constructor(@IDatabaseService private readonly databaseService: IDatabaseService) {
    super();
    // Create MarketDataModel with pool from DatabaseService
    this._marketDataModel = new MarketDataModel(this.databaseService.getPool());
    this._logger.debug('Initialized RemoteMarketDataService');
  }

  async captureRequestData(data: RequestMetadata): Promise<void> {
    try {
      if (this._queue.length >= this._maxQueueSize) {
        this._logger.debug(
          `WARN: Queue size limit reached (${this._maxQueueSize}), dropping request`,
        );
        return;
      }
      this._queue.push(data);
      this._logger.debug(`Enqueued ${data.method}, queue size: ${this._queue.length}`);
      if (!this._isProcessing) {
        this._processQueue().catch(error => {
          this._logger.error('Error processing queue:', error);
        });
      }
    } catch (error) {
      this._logger.error('Error in captureRequestData:', error);
    }
  }

  /**
   * Ensures a value is a proper Date object
   * @param date Date or date string or timestamp
   * @returns Date object
   */
  private _ensureDate(date: Date | string | number | undefined): Date | undefined {
    if (date === undefined) {
      return undefined;
    }

    if (date instanceof Date) {
      return date;
    }

    try {
      return new Date(date);
    } catch (error) {
      this._logger.error(`Invalid date value: ${date}`, error);
      return undefined;
    }
  }

  /**
   * Loads market data from the database for a specific time window
   */
  async loadMarketData(params: HistoricalDataParams): Promise<MarketDataRecord[]> {
    try {
      // Ensure we have proper Date objects
      const startTime = this._ensureDate(params.startTime);
      const endTime = this._ensureDate(params.endTime);
      if (!startTime) {
        throw new Error('Invalid startTime provided to loadMarketData');
      }

      this._logger.debug(
        `Loading market data from ${startTime.toISOString()} to ${endTime?.toISOString() || 'now'}`,
      );

      const records = await this._marketDataModel.getHistoricalData({
        startTime,
        endTime,
        endpoint: params.endpoint,
        symbol: params.symbol,
        limit: params.limit,
      });

      this._logger.debug(`Loaded ${records.length} market data records`);

      // Transform the results into MarketDataRecord objects
      return records.map(record => {
        // Create a RequestMetadataRecord from requestMetadata
        const metadata = record.requestMetadata || {
          method: record.endpoint,
          arguments: [],
        };

        // Ensure time is a proper Date object
        const time = record.time instanceof Date ? record.time : new Date(record.time);

        return {
          id: record.id || 0,
          time,
          endpoint: record.endpoint,
          symbol: record.symbol || 'unknown',
          response: record.response,
          request_metadata: {
            method: metadata.method,
            arguments: metadata.arguments,
            requestId: metadata.requestId,
            timeTaken: metadata.timeTaken,
          },
        };
      });
    } catch (error) {
      this._logger.error('Error loading market data:', error);
      throw error;
    }
  }

  /**
   * Query market data for a specific endpoint and symbol on a specific date
   * This is particularly useful for endpoints that aren't called frequently but
   * contain essential data (e.g., options chains)
   */
  async queryEndpointData(params: {
    endpoint: string;
    symbol?: string;
    replayDate?: Date;
    limit?: number;
  }): Promise<MarketDataRecord[]> {
    try {
      const { endpoint, symbol, replayDate, limit } = params;

      // Convert replayDate to proper Date object before using it
      const safeReplayDate = this._ensureDate(replayDate);

      this._logger.debug(
        `Querying data for endpoint: ${endpoint}${symbol ? `, symbol: ${symbol}` : ''}${
          safeReplayDate ? `, date: ${safeReplayDate.toISOString()}` : ''
        }`,
      );

      const records = await this._marketDataModel.queryEndpointData({
        endpoint,
        symbol,
        date: safeReplayDate,
        limit: limit || 1, // Default to most recent record
      });

      this._logger.debug(`Found ${records.length} records for endpoint ${endpoint}`);

      // Transform the results into MarketDataRecord objects
      return records.map(record => {
        // Create a RequestMetadataRecord from requestMetadata
        const metadata = record.requestMetadata || {
          method: record.endpoint,
          arguments: [],
        };

        // Ensure time is a proper Date object
        const time = record.time instanceof Date ? record.time : new Date(record.time);

        return {
          id: record.id || 0,
          time,
          endpoint: record.endpoint,
          symbol: record.symbol || 'unknown',
          response: record.response,
          request_metadata: {
            method: metadata.method,
            arguments: metadata.arguments,
            requestId: metadata.requestId,
            timeTaken: metadata.timeTaken,
          },
        };
      });
    } catch (error) {
      this._logger.error(`Error querying endpoint data for ${params.endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Get distinct symbols stored in the database
   */
  async getDistinctSymbols(): Promise<string[]> {
    try {
      return await this._marketDataModel.getDistinctSymbols();
    } catch (error) {
      this._logger.error('Error getting distinct symbols:', error);
      return [];
    }
  }

  /**
   * Get distinct endpoints stored in the database
   */
  async getDistinctEndpoints(): Promise<string[]> {
    try {
      return await this._marketDataModel.getDistinctEndpoints();
    } catch (error) {
      this._logger.error('Error getting distinct endpoints:', error);
      return [];
    }
  }

  private async _processQueue(): Promise<void> {
    if (this._isProcessing) return;
    this._isProcessing = true;
    this._logger.debug(`Starting queue processing, items: ${this._queue.length}`);
    try {
      while (this._queue.length > 0) {
        const item = this._queue.shift();
        if (!item) continue;
        const requestId = item._metadata?.requestId || 'unknown';
        this._logger.debug(`Processing ${item.method} (${requestId})`);

        let symbol = 'unknown';
        if (
          item.method === 'fetchOptionsChains' &&
          Array.isArray(item.arguments) &&
          item.arguments.length > 0
        ) {
          symbol = item.arguments[0] as string;
        } else if (
          (item.method === 'fetchMarketDataQuotes' || item.method === 'fetchOptionsMarketData') &&
          Array.isArray(item.arguments) &&
          item.arguments.length > 0
        ) {
          // Handle array of symbols in first argument
          const firstArg = item.arguments[0];
          if (Array.isArray(firstArg) && firstArg.length > 0) {
            symbol = 'multiple'; // Indicate multiple symbols
          } else if (typeof firstArg === 'string') {
            symbol = firstArg;
          }
        }

        try {
          // Create MarketDataCapture object
          const marketData: MarketDataCapture = {
            endpoint: item.method,
            symbol: symbol,
            time: new Date(),
            response: item.result || {},
            requestMetadata: {
              method: item.method,
              arguments: item.arguments,
              requestId: item._metadata?.requestId,
              timeTaken: item._metadata?.timeTaken,
            },
          };

          // Store data in database
          await this._marketDataModel.storeMarketData(marketData);
          this._logger.debug(
            `Stored data for symbol: ${symbol}, method: ${item.method}, time taken: ${item._metadata?.timeTaken?.toFixed(2) || 'unknown'}ms`,
          );
        } catch (error) {
          this._logger.error(`Failed to store market data: ${error}`, error);
        }

        // Introduce a small delay to yield the event loop
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } catch (error) {
      this._logger.error('Error processing queue item:', error);
    } finally {
      this._isProcessing = false;
      this._logger.debug('Queue processing completed');
    }
  }
}
