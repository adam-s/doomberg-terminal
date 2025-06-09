import { IOptionsMarketData } from '@shared/services/request.types';
import { Disposable } from 'vs/base/common/lifecycle';

export interface IMarketDataStrategy extends Disposable {
  fetchNextSnapshot(): Promise<Map<string, IOptionsMarketData | null>>;
  reset(): void;
}
