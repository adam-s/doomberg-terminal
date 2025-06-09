import { Pool } from 'pg';

/**
 * Interface for market data request metadata
 */
export interface RequestMetadata {
  method: string;
  arguments: unknown[];
  requestId?: string;
  timeTaken?: number;
}

/**
 * Interface for market data capture record
 */
export interface MarketDataCapture {
  id?: number;
  endpoint: string;
  symbol?: string;
  time: Date;
  response: unknown;
  requestMetadata?: RequestMetadata;
}

/**
 * Parameters for querying historical market data
 */
export interface HistoricalDataParams {
  endpoint?: string;
  symbol?: string;
  startTime: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * Market Data Service for storing and retrieving market data
 */
export class MarketDataModel {
  constructor(private readonly pool: Pool) {}

  /**
   * Store market data in the database
   * @param data Market data to store
   * @returns The stored market data record
   */
  async storeMarketData(data: MarketDataCapture): Promise<MarketDataCapture> {
    const query = `
      INSERT INTO market_data 
      (endpoint, symbol, time, response, request_metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, endpoint, symbol, time, response, request_metadata as "requestMetadata"
    `;

    const values = [
      data.endpoint,
      data.symbol,
      data.time,
      JSON.stringify(data.response),
      data.requestMetadata ? JSON.stringify(data.requestMetadata) : null,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Retrieve historical market data based on provided parameters
   * @param params Parameters for filtering historical data
   * @returns Array of market data captures matching the criteria
   */
  async getHistoricalData(params: HistoricalDataParams): Promise<MarketDataCapture[]> {
    const { endpoint, symbol, startTime, endTime = new Date(), limit = 1000 } = params;

    let query = `
      SELECT 
        id, 
        endpoint, 
        symbol, 
        time, 
        response, 
        request_metadata as "requestMetadata"
      FROM market_data
      WHERE time >= $1 AND time <= $2
    `;

    // Fix: Explicitly type the array to accept different parameter types
    const queryParams: (Date | string | number)[] = [startTime, endTime];
    let paramIndex = 3;

    if (endpoint) {
      query += ` AND endpoint = $${paramIndex}`;
      queryParams.push(endpoint);
      paramIndex++;
    }

    if (symbol) {
      query += ` AND symbol = $${paramIndex}`;
      queryParams.push(symbol);
      paramIndex++;
    }

    query += ` ORDER BY time ASC LIMIT $${paramIndex}`;
    queryParams.push(limit);

    const result = await this.pool.query(query, queryParams);

    return result.rows.map(row => ({
      ...row,
      response: typeof row.response === 'string' ? JSON.parse(row.response) : row.response,
      requestMetadata:
        typeof row.requestMetadata === 'string'
          ? JSON.parse(row.requestMetadata)
          : row.requestMetadata,
    }));
  }

  /**
   * Replay market data from a specific start time
   * @param startTime The timestamp to start replaying data from
   * @param endpoint Optional endpoint filter
   * @param symbol Optional symbol filter
   * @param batchSize Number of records to fetch at once
   * @returns Generator that yields market data in chronological order
   */
  async *replayMarketData(
    startTime: Date,
    endpoint?: string,
    symbol?: string,
    batchSize = 100,
  ): AsyncGenerator<MarketDataCapture> {
    let lastTimestamp = startTime;
    let hasMoreData = true;

    while (hasMoreData) {
      const params: HistoricalDataParams = {
        startTime: lastTimestamp,
        endpoint,
        symbol,
        limit: batchSize,
      };

      const batch = await this.getHistoricalData(params);

      if (batch.length === 0) {
        hasMoreData = false;
        continue;
      }

      // Process and yield each item
      for (const item of batch) {
        yield item;
        // Update the lastTimestamp to fetch next batch after this timestamp
        if (item.time > lastTimestamp) {
          lastTimestamp = new Date(item.time.getTime() + 1); // Add 1ms to avoid duplicates
        }
      }

      // If we got fewer items than requested, we've reached the end
      if (batch.length < batchSize) {
        hasMoreData = false;
      }
    }
  }

  /**
   * Get distinct symbols stored in the database
   * @returns Array of distinct symbols
   */
  async getDistinctSymbols(): Promise<string[]> {
    const query = `
      SELECT DISTINCT symbol 
      FROM market_data 
      WHERE symbol IS NOT NULL
      ORDER BY symbol
    `;

    const result = await this.pool.query(query);
    return result.rows.map(row => row.symbol);
  }

  /**
   * Get distinct endpoints stored in the database
   * @returns Array of distinct endpoints
   */
  async getDistinctEndpoints(): Promise<string[]> {
    const query = `
      SELECT DISTINCT endpoint 
      FROM market_data 
      ORDER BY endpoint
    `;

    const result = await this.pool.query(query);
    return result.rows.map(row => row.endpoint);
  }

  /**
   * Query market data for a specific endpoint and symbol on a specific date
   * @param params Query parameters
   * @returns Array of market data captures matching the criteria
   */
  async queryEndpointData(params: {
    endpoint: string;
    symbol?: string;
    date?: Date;
    limit?: number;
  }): Promise<MarketDataCapture[]> {
    const { endpoint, symbol, date, limit = 1 } = params;

    let query = `
      SELECT 
        id, 
        endpoint, 
        symbol, 
        time, 
        response, 
        request_metadata as "requestMetadata"
      FROM market_data
      WHERE endpoint = $1
    `;

    const queryParams: (string | Date | number)[] = [endpoint];
    let paramIndex = 2;

    if (symbol) {
      query += ` AND symbol = $${paramIndex}`;
      queryParams.push(symbol);
      paramIndex++;
    }

    // If date is provided, get records from that specific date
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      query += ` AND time >= $${paramIndex} AND time <= $${paramIndex + 1}`;
      queryParams.push(startOfDay, endOfDay);
      paramIndex += 2;
    }

    // Order by most recent first to get the latest data
    query += ` ORDER BY time DESC`;

    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
    }

    const result = await this.pool.query(query, queryParams);

    return result.rows.map(row => ({
      ...row,
      response: typeof row.response === 'string' ? JSON.parse(row.response) : row.response,
      requestMetadata:
        typeof row.requestMetadata === 'string'
          ? JSON.parse(row.requestMetadata)
          : row.requestMetadata,
    }));
  }
}
