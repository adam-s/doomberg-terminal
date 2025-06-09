import { Pool, PoolConfig } from 'pg';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Logger, LogComponent } from '@shared/utils/logging';

/**
 * Interface for the database service
 */
export interface IDatabaseService {
  _serviceBrand: undefined;

  /**
   * Get the PostgreSQL connection pool
   */
  getPool(): Pool;

  /**
   * Test the database connection
   * @returns Promise that resolves when connection is successful
   */
  testConnection(): Promise<void>;

  /**
   * Close all connections in the pool
   */
  closePool(): Promise<void>;
}

/**
 * Service decorator for the database service
 */
export const IDatabaseService = createDecorator<IDatabaseService>('databaseService');

/**
 * Implementation of the database service that manages a PostgreSQL connection pool
 */
export class DatabaseService extends Disposable implements IDatabaseService {
  declare readonly _serviceBrand: undefined;

  private _logger = Logger.forComponent('DatabaseService' as LogComponent);
  private _pool: Pool;

  constructor() {
    super();
    this._pool = this._createPool();

    // Register dispose logic
    this._register({
      dispose: () => {
        this.closePool().catch(err =>
          this._logger.error('Error closing database pool during disposal:', err),
        );
      },
    });

    this._logger.debug('DatabaseService initialized');
  }

  /**
   * Get the PostgreSQL connection pool
   */
  getPool(): Pool {
    return this._pool;
  }

  /**
   * Test the database connection
   * @returns Promise that resolves when connection is successful
   */
  async testConnection(): Promise<void> {
    try {
      const client = await this._pool.connect();
      try {
        await client.query('SELECT NOW()');
        this._logger.debug('Database connection test successful');
      } finally {
        client.release();
      }
    } catch (error) {
      this._logger.error('Database connection test failed:', error);
      throw new Error(
        `Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Close all connections in the pool
   */
  async closePool(): Promise<void> {
    if (this._pool) {
      this._logger.debug('Closing database connection pool');
      await this._pool.end();
    }
  }

  /**
   * Create a new PostgreSQL connection pool using environment variables
   */
  private _createPool(): Pool {
    const poolConfig: PoolConfig = {};

    // Use DATABASE_URL if provided, otherwise build connection from individual params
    if (process.env.DATABASE_URL) {
      poolConfig.connectionString = process.env.DATABASE_URL;
    } else {
      poolConfig.host = process.env.DB_HOST || 'localhost';
      poolConfig.port = parseInt(process.env.DB_PORT || '5433', 10);
      poolConfig.database = process.env.DB_NAME || 'postgres';
      poolConfig.user = process.env.DB_USER || 'postgres';
      poolConfig.password = process.env.DB_PASSWORD || 'password';
    }

    // Connection pool configuration
    poolConfig.min = parseInt(process.env.DB_POOL_MIN || '2', 10);
    poolConfig.max = parseInt(process.env.DB_POOL_MAX || '10', 10);

    // Error handling
    const pool = new Pool(poolConfig);

    pool.on('error', err => {
      this._logger.error('Unexpected error on idle client:', err);
    });

    return pool;
  }
}
