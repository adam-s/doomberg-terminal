import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IRemoteMarketDataService {
  _serviceBrand: undefined;
  saveFlowData(flowData: unknown): void;
  saveHistoricalData(historicalData: unknown): void;
  savePricebookData(pricebookData: unknown): void;
}

export const IRemoteMarketDataService =
  createDecorator<IRemoteMarketDataService>('remoteMarketDataService');
