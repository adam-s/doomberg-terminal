export const ChainConfig = {
  // Filter settings
  DEFAULT_STRIKE_COUNT: 40, // Number of strikes to show around current price
  DEFAULT_STRIKE_RANGE: 25, // Price range to show around current price ($)

  // History settings
  MAX_MARKET_DATA_HISTORY: 10, // Number of market data snapshots to keep

  // Update intervals
  MARKET_DATA_FETCH_INTERVAL: 2500,
  PRICE_UPDATE_INTERVAL: 2500,

  // Symbols - Changed from tuple to regular array
  DEFAULT_SYMBOLS: ['QQQ', 'SPY', 'DIA'],
} as const;

// Add a type for symbols if needed
export type SupportedSymbol = (typeof ChainConfig.DEFAULT_SYMBOLS)[number];
