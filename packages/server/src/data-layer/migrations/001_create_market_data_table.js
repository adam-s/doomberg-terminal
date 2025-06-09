/* eslint-disable camelcase */
exports.up = async pgm => {
  // Create extension if it doesn't exist
  pgm.sql('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');

  // Create the main market data table with a composite primary key
  pgm.createTable(
    'market_data',
    {
      id: { type: 'serial' },
      time: { type: 'timestamptz', notNull: true },
      endpoint: { type: 'text', notNull: true },
      symbol: { type: 'text' },
      response: { type: 'jsonb', notNull: true },
      request_metadata: { type: 'jsonb' },
    },
    {
      constraints: {
        primaryKey: ['id', 'time'],
      },
    },
  );

  // Convert to TimescaleDB hypertable
  pgm.sql("SELECT create_hypertable('market_data', 'time');");

  // Create indexes for efficient querying
  pgm.createIndex('market_data', ['endpoint']);
  pgm.createIndex('market_data', ['symbol']);
  pgm.createIndex('market_data', ['time']);
};

exports.down = async pgm => {
  // Revert all changes
  pgm.dropTable('market_data');
};
