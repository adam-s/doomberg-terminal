/**
 * Reasons for exiting a position
 */
export enum ExitReason {
  // Flow-based reasons
  FLOW_THRESHOLD = 'FLOW_THRESHOLD',
  CUMULATIVE_FLOW = 'CUMULATIVE_FLOW',

  // Price-based reasons
  TAKE_PROFIT = 'TAKE_PROFIT',
  TRAILING_STOP = 'TRAILING_STOP',

  // Other reasons
  SYSTEM = 'SYSTEM',
  MANUAL = 'MANUAL',

  // Add a generic "none" reason for clarity when checking
  NONE = 'NONE',
}
