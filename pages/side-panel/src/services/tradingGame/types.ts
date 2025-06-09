/**
 * Reasons for exiting a position
 */
export enum ExitReason {
  // Price-based reasons
  TAKE_PROFIT = 'TAKE_PROFIT',
  TRAILING_STOP = 'TRAILING_STOP',

  // Other reasons
  SYSTEM = 'SYSTEM',
  MANUAL = 'MANUAL',

  // Add a generic "none" reason for clarity when checking
  NONE = 'NONE',
}
