/* eslint-disable camelcase */
exports.up = async pgm => {
  // Enable TimescaleDB's built-in compression feature
  pgm.sql(`
    ALTER TABLE market_data SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'endpoint,symbol',
      timescaledb.compress_orderby = 'time'
    );
  `);

  // Add compression policy to compress chunks older than 7 days
  pgm.sql(`SELECT add_compression_policy('market_data', INTERVAL '7 days');`);

  // Note: Not creating a composite index since individual indexes on 'time' and 'symbol'
  // were already created in the first migration
};

exports.down = async pgm => {
  // Remove the compression policy
  pgm.sql(`SELECT remove_compression_policy('market_data');`);

  // Disable compression
  pgm.sql(`ALTER TABLE market_data SET (timescaledb.compress = false);`);
};
