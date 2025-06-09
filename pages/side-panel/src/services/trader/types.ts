export type ContractType = 'CALL' | 'PUT';

interface OrderDetailsBase {
  id: string;
  quantity: number;
  fast?: boolean;
  optionId?: string; // Make optional
  strikePrice?: number; // Make optional
  executionPrice?: number; // Make optional
}

export interface SellOrderDetails extends OrderDetailsBase {
  type: 'sell';
}

export interface BuyOrderDetails extends OrderDetailsBase {
  type: 'buy';
  contractType: ContractType;
}

export type OrderDetails = BuyOrderDetails | SellOrderDetails;

// Add the trader data interfaces here
import { SymbolType, OptionType, IMarketDataItem } from '@src/services/trader/chain';

export interface BuyTraderData {
  symbol?: SymbolType;
  marketDataItems?: IMarketDataItem[];
  askPrice?: number;
  expirationDates?: string[];
  selectedExpirationDate?: string;
  optionType?: OptionType;
  setSelectedExpirationDate?: (expirationDate: string) => void;
  setOptionType?: (optionType: OptionType) => void;
  refreshChain?: (symbol?: SymbolType, optionType?: OptionType) => void;
  createOrder?: (orderDetails: OrderDetails) => void;
  findClosestOptionByDelta?: (
    contractType: OptionType,
    deltaTarget: number,
  ) => IMarketDataItem | undefined;
}

export interface SellTraderData {
  id?: string;
  symbol?: SymbolType;
  optionType?: OptionType;
  positionType?: string;
  strikePrice?: number;
  expirationDate?: string;
  quantity?: number;
  bidPrice?: number;
  profitLoss?: number;
  createOrder?: (orderDetails: OrderDetails) => void;
}
