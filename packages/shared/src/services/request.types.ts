export interface IActiveInstruments {
  id: string;
  url: string;
  quote: string;
  fundamentals: string;
  splits: string;
  state: string;
  market: string;
  simple_name: string;
  name: string;
  tradeable: boolean;
  tradability: string;
  symbol: string;
  bloomberg_unique: string;
  margin_initial_ratio: string;
  maintenance_ratio: string;
  country: string;
  day_trade_ratio: string;
  list_date: string;
  min_tick_size: string | null;
  type: string;
  tradable_chain_id: string;
  rhs_tradability: string;
  affiliate_tradability: string;
  fractional_tradability: string;
  default_collar_fraction: string;
  ipo_access_status: string | null;
  ipo_access_cob_deadline: string | null;
  ipo_s1_url: string | null;
  ipo_roadshow_url: string | null;
  is_spac: boolean;
  is_test: boolean;
  ipo_access_supports_dsp: boolean;
  extended_hours_fractional_tradability: boolean;
  internal_halt_reason: string;
  internal_halt_details: string;
  internal_halt_sessions: string | null;
  internal_halt_start_time: string | null;
  internal_halt_end_time: string | null;
  internal_halt_source: string;
  all_day_tradability: string;
  notional_estimated_quantity_decimals: number;
  tax_security_type: string;
  reserved_buying_power_percent_queued: string;
  reserved_buying_power_percent_immediate: string;
  otc_market_tier: string;
}

export interface IActiveInstrumentsResponse {
  next: string | null;
  previous: string | null;
  results: IActiveInstruments[];
}

export interface IHistoricalDataPoint {
  begins_at: string;
  open_price: string;
  close_price: string;
  high_price: string;
  low_price: string;
  volume: number;
  session: string;
  interpolated: boolean;
}

export interface IMarketDataHistoricals {
  quote: string;
  symbol: string;
  interval: string;
  span: string;
  bounds: string;
  previous_close_price: string;
  previous_close_time: string;
  open_price: string;
  open_time: string;
  instrument: string;
  historicals: IHistoricalDataPoint[];
  InstrumentID: string;
}

export interface IMarketDataHistoricalsResponse {
  results: IMarketDataHistoricals;
}

export interface IMarketDataQuotesResult {
  ask_price: string;
  ask_size: number;
  venue_ask_time: string;
  bid_price: string;
  bid_size: number;
  venue_bid_time: string;
  last_trade_price: string;
  venue_last_trade_time: string;
  last_extended_hours_trade_price: string | null;
  last_non_reg_trade_price: string | null;
  venue_last_non_reg_trade_time: string | null;
  previous_close: string;
  adjusted_previous_close: string;
  previous_close_date: string;
  symbol: string;
  trading_halted: boolean;
  has_traded: boolean;
  last_trade_price_source: string;
  last_non_reg_trade_price_source: string;
  updated_at: string;
  instrument: string;
  instrument_id: string;
  state: string;
}

export interface IMarketDataQuotesResponse {
  results: IMarketDataQuotesResult[];
}

interface IMinTicks {
  above_tick: string;
  below_tick: string;
  cutoff_price: string;
}

interface IUnderlyingInstrument {
  id: string;
  instrument: string;
  quantity: number;
}

interface IUnderlying {
  type: string;
  id: string;
  quantity: number;
}

export interface IOptionsChain {
  id: string;
  symbol: string;
  can_open_position: boolean;
  cash_component: null | string;
  expiration_dates: string[];
  trade_value_multiplier: string;
  underlying_instruments: IUnderlyingInstrument[];
  min_ticks: IMinTicks;
  late_close_state: string;
  underlyings: IUnderlying[];
  settle_on_open: boolean;
}

export interface IOptionsChainsResponse {
  next: string | null;
  previous: string | null;
  results: IOptionsChain[];
}

export interface IOptionsInstrument {
  chain_id: string;
  chain_symbol: string;
  created_at: string;
  expiration_date: string;
  id: string;
  issue_date: string;
  min_ticks: IMinTicks;
  rhs_tradability: 'position_closing_only' | 'untradable' | 'tradable';
  state: 'active' | 'inactive';
  strike_price: string;
  tradability: 'position_closing_only' | 'untradable' | 'tradable';
  type: 'call' | 'put';
  updated_at: string;
  url: string;
  sellout_datetime: string | null;
}

export interface IOptionsInstrumentsResponse {
  next: string | null;
  previous: string | null;
  results: IOptionsInstrument[];
}

export interface IOptionsMarketData {
  adjusted_mark_price: string;
  adjusted_mark_price_round_down: string;
  ask_price: string;
  ask_size: number;
  bid_price: string;
  bid_size: number;
  break_even_price: string;
  high_price: string;
  instrument: string;
  instrument_id: string;
  last_trade_price: string;
  last_trade_size: number;
  low_price: string;
  mark_price: string;
  open_interest: number;
  previous_close_date: string;
  previous_close_price: string;
  updated_at: string;
  volume: number;
  symbol: string;
  occ_symbol: string;
  state: string;
  chance_of_profit_long: string;
  chance_of_profit_short: string;
  delta: string;
  gamma: string;
  implied_volatility: string;
  rho: string;
  theta: string;
  vega: string;
  pricing_model: string;
  high_fill_rate_buy_price: string;
  high_fill_rate_sell_price: string;
  low_fill_rate_buy_price: string;
  low_fill_rate_sell_price: string;
}

export interface IOptionsMarketDataResponse {
  results: IOptionsMarketData[];
}

export interface IOptionsAggregatedPositions {
  id: string;
  chain: string;
  account: string;
  account_number: string;
  symbol: string;
  strategy: string;
  average_open_price: string;
  legs: {
    id: string;
    ratio_quantity: number;
    position: string;
    position_type: string;
    option: string;
    option_id: string;
    expiration_date: string;
    strike_price: string;
    option_type: string;
    settle_on_open: boolean;
  }[];
  quantity: string;
  intraday_average_open_price: string;
  intraday_quantity: string;
  direction: string;
  intraday_direction: string;
  trade_value_multiplier: string;
  created_at: string;
  updated_at: string;
  strategy_code: string;
  clearing_running_quantity: string;
  clearing_cost_basis: string;
  clearing_intraday_running_quantity: string;
  clearing_intraday_cost_basis: string;
  clearing_direction: string;
  clearing_intraday_direction: string;
  underlying_type: string;
}
export interface IOptionsAggregatedPositionsResponse {
  next: string | null;
  previous: string | null;
  results: IOptionsAggregatedPositions[];
}

export interface IOptionsOrderLegExecution {
  // Add execution properties as needed
}

export interface IOptionsOrderLeg {
  executions: IOptionsOrderLegExecution[];
  id: string;
  option: string;
  position_effect: 'open' | 'close';
  ratio_quantity: number;
  side: string;
  expiration_date: string;
  strike_price: string;
  option_type: string;
  long_strategy_code: string;
  short_strategy_code: string;
}

export enum OrderState {
  Queued = 'queued',
  Cancelled = 'cancelled',
  Filled = 'filled',
  Unconfirmed = 'unconfirmed',
  New = 'new',
  Confirmed = 'confirmed',
  PartiallyFilled = 'partially_filled',
  PendingCancelled = 'pending_cancelled',
}

export type OptionsOrderDerivedState = OrderState;

export interface IOptionsOrder {
  account_number: string;
  cancel_url: string;
  canceled_quantity: string;
  created_at: string;
  direction: string;
  id: string;
  legs: IOptionsOrderLeg[];
  pending_quantity: string;
  premium: string;
  processed_premium: string;
  net_amount: string;
  net_amount_direction: string;
  price: string;
  processed_quantity: string;
  quantity: string;
  ref_id: string;
  regulatory_fees: string;
  contract_fees: string;
  gold_savings: string;
  state: OrderState;
  time_in_force: string;
  trigger: string;
  type: string;
  updated_at: string;
  chain_id: string;
  chain_symbol: string;
  response_category: string | null;
  opening_strategy: string | null;
  closing_strategy: string | null;
  stop_price: string | null;
  form_source: string;
  client_bid_at_submission: string;
  client_ask_at_submission: string;
  client_time_at_submission: string | null;
  average_net_premium_paid: string;
  estimated_total_net_amount: string;
  estimated_total_net_amount_direction: string;
  is_replaceable: boolean;
  strategy: string;
  derived_state: OptionsOrderDerivedState;
}

export interface IOptionsOrderResponse {
  account_number: string;
  cancel_url: string | null;
  canceled_quantity: string;
  created_at: string;
  direction: string;
  id: string;
  legs: Array<{
    executions: unknown[];
    id: string;
    option: string;
    position_effect: 'open' | 'close';
    ratio_quantity: number;
    side: string;
    expiration_date: string;
    strike_price: string;
    option_type: string;
    long_strategy_code: string;
    short_strategy_code: string;
  }>;
  pending_quantity: string;
  premium: string;
  processed_premium: string;
  net_amount: string;
  net_amount_direction: string;
  price: string;
  processed_quantity: string;
  quantity: string;
  ref_id: string;
  regulatory_fees: string;
  contract_fees: string;
  gold_savings: string;
  state: OrderState;
  time_in_force: string;
  trigger: string;
  type: string;
  updated_at: string;
  chain_id: string;
  chain_symbol: string;
  response_category: string | null;
  opening_strategy: string | null;
  closing_strategy: string | null;
  stop_price: string | null;
  form_source: string;
  client_bid_at_submission: string;
  client_ask_at_submission: string;
  client_time_at_submission: string | null;
  average_net_premium_paid: string;
  estimated_total_net_amount: string;
  estimated_total_net_amount_direction: string;
  is_replaceable: boolean;
  strategy: string;
  derived_state: OptionsOrderDerivedState;
}

export interface IOptionsOrderCreateLeg {
  option: string;
  position_effect: 'open' | 'close';
  ratio_quantity: number;
  side: 'buy' | 'sell';
}

export interface IOptionsOrderCreatePayload {
  account: string;
  check_overrides: [];
  client_ask_at_submission: string;
  client_bid_at_submission: string;
  direction: 'credit' | 'debit';
  form_source: 'option_chain' | 'strategy_detail';
  legs: IOptionsOrderCreateLeg[];
  override_day_trade_checks: boolean;
  price: string;
  quantity: string;
  ref_id: string;
  time_in_force: 'gfd';
  trigger: 'immediate';
  type: 'limit';
}

export interface IOptionsOrderReviewLegMetadata {
  option_quote: {
    ask_price: string;
    ask_size: number;
    bid_price: string;
    bid_size: number;
    open_interest: number;
  };
}

export interface IOptionsOrderReviewLeg {
  option: string;
  position_effect: 'open' | 'close'; // Updated to support both operations
  ratio_quantity: number;
  side: 'buy' | 'sell';
  leg_metadata: IOptionsOrderReviewLegMetadata;
  option_id: string;
}

export interface IOptionsOrderReviewMetadata {
  brokerage_account_type: string;
  is_direction_explicit: boolean;
  number_of_accounts: number;
  number_of_checks_seen: number;
  options_buying_power: string;
}

export interface IOptionsOrderReviewPayload {
  account: string;
  check_overrides: [];
  client_ask_at_submission: string;
  client_bid_at_submission: string;
  direction: 'debit' | 'credit'; // Updated to support both operations
  form_source: 'option_chain' | 'strategy_detail'; // Updated to support both operations
  legs: IOptionsOrderReviewLeg[];
  override_day_trade_checks: boolean;
  price: string;
  quantity: string;
  ref_id: string;
  time_in_force: 'gfd';
  trigger: 'immediate';
  type: 'limit';
  metadata: IOptionsOrderReviewMetadata; // Fixed: Using correct metadata type
}

export interface IOptionsOrderReviewResponse {
  alert: string | null;
}

export interface IOptionsOrderCollateralCash {
  amount: string;
  direction: 'debit' | 'credit';
  infinite: boolean;
}

export interface IOptionsOrderCollateralResponse {
  account_number: string;
  cash: IOptionsOrderCollateralCash;
  equities: [];
}

export interface ICashBalances {
  uncleared_deposits: string;
  cash: string;
  cash_held_for_dividends: string;
  cash_held_for_restrictions: string;
  cash_held_for_crypto_orders: string;
  crypto_buying_power: string;
  cash_held_for_nummus_restrictions: string;
  portfolio_cash: string;
  cash_held_for_orders: string;
  cash_available_for_withdrawal: string;
  buying_power: string;
  unsettled_funds: string;
  unsettled_debit: string;
  outstanding_interest: string;
  cash_held_for_options_collateral: string;
  created_at: string;
  updated_at: string;
  uncleared_nummus_deposits: string;
  cash_pending_from_options_events: string;
  settled_amount_borrowed: string;
  pending_deposit: string;
  backup_withholding_total: string;
  funding_hold_balance: string;
  net_moving_cash: string;
  instant_used: string;
  eligible_deposit_as_instant: string;
  is_primary_account: boolean;
  marked_pattern_day_trader_date: string;
  pattern_day_trader_expiry_date: string;
  instant_allocated: string;
  is_pdt_forever: boolean;
}

export interface IInstantEligibility {
  reason: string;
  reinstatement_date: string | null;
  reversal: string | null;
  state: string;
  updated_at: string | null;
  additional_deposit_needed: string;
  compliance_user_major_oak_email: string | null;
  created_at: string;
  created_by: string | null;
}

export interface IAccount {
  url: string;
  portfolio_cash: string;
  can_downgrade_to_cash: string;
  user: string;
  account_number: string;
  type: string;
  brokerage_account_type: string;
  created_at: string;
  updated_at: string;
  deactivated: boolean;
  deposit_halted: boolean;
  withdrawal_halted: boolean;
  only_position_closing_trades: boolean;
  buying_power: string;
  onbp: string;
  cash_available_for_withdrawal: string;
  cash_available_for_withdrawal_without_margin: string;
  cash: string;
  amount_eligible_for_deposit_cancellation: string;
  cash_held_for_orders: string;
  uncleared_deposits: string;
  sma: string | null;
  sma_held_for_orders: string | null;
  unsettled_funds: string;
  unsettled_debit: string;
  crypto_buying_power: string;
  max_ach_early_access_amount: string;
  cash_balances: ICashBalances;
  margin_balances: null;
  sweep_enabled: boolean;
  sweep_enrolled: boolean;
  instant_eligibility: IInstantEligibility;
  option_level: string;
  is_pinnacle_account: boolean;
  rhs_account_number: number;
  state: string;
  active_subscription_id: string;
  locked: boolean;
  permanently_deactivated: boolean;
  ipo_access_restricted: boolean;
  ipo_access_restricted_reason: string | null;
  received_ach_debit_locked: boolean;
  drip_enabled: boolean;
  eligible_for_fractionals: boolean;
  eligible_for_drip: boolean;
  eligible_for_cash_management: boolean;
  cash_management_enabled: boolean;
  option_trading_on_expiration_enabled: boolean;
  cash_held_for_options_collateral: string;
  fractional_position_closing_only: boolean;
  user_id: string;
  equity_trading_lock: string;
  option_trading_lock: string;
  disable_adt: boolean;
  management_type: string;
  dynamic_instant_limit: string;
  affiliate: string;
  second_trade_suitability_completed: boolean;
  has_futures_account: boolean;
}

export interface IAccountsResponse {
  next: string | null;
  previous: string | null;
  results: IAccount[];
}

export interface IOptionsOrdersResponse {
  next: string | null;
  previous: string | null;
  results: IOptionsOrder[];
}

export interface IPricebookSnapshotResponse {
  asks: {
    side: 'ask';
    price: {
      amount: string;
      currency_code: string;
    };
    quantity: number;
  }[];
  bids: {
    side: 'bid';
    price: {
      amount: string;
      currency_code: string;
    };
    quantity: number;
  }[];
  instrument_id: string;
  updated_at: string;
}
