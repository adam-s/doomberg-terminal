/* eslint-disable */
// @ts-nocheck
import { Disposable } from 'vs/base/common/lifecycle';
import { IOptionsMarketData } from '@shared/services/request.types';
import { IMarketDataStrategy } from './IMarketDataStrategy';
import { observableValue } from 'vs/base/common/observable';
import { Chain } from '../chains/chain';
import { OptionsChainsService } from '../chains/optionsChains.service';

export class LiveMarketDataStrategy extends Disposable implements IMarketDataStrategy {
  // -- Private State Observables ------------------------------------------
  private readonly _lastSnapshot$ = observableValue<Map<string, IOptionsMarketData | null>>(
    'lastSnapshot',
    new Map(),
  );

  constructor(private readonly optionsChainsService: OptionsChainsService) {
    super();
  }

  // -- Public API Methods ------------------------------------------------
  public async fetchNextSnapshot(): Promise<Map<string, IOptionsMarketData | null>> {
    try {
      const chains = this.optionsChainsService.chains$.get();
      const currentSnapshot = new Map<string, IOptionsMarketData | null>();

      await this._updateTradesPrices(chains);
      await this._fetchMarketData(chains, currentSnapshot);

      this._lastSnapshot$.set(currentSnapshot, undefined);
      return currentSnapshot;
    } catch (error) {
      console.error('Error fetching live market data:', error);
      return this._lastSnapshot$.get();
    }
  }

  public reset(): void {
    this._lastSnapshot$.set(new Map(), undefined);
  }

  // -- Private Helper Methods --------------------------------------------
  private async _updateTradesPrices(chains: readonly Chain[]): Promise<void> {
    await Promise.all(chains.map(chain => chain.updateLastTradePrice()));
  }

  private async _fetchMarketData(
    chains: readonly Chain[],
    snapshot: Map<string, IOptionsMarketData | null>,
  ): Promise<void> {
    await Promise.all(
      chains.map(async chain => {
        const marketData = await chain.fetchOptionsMarketData();
        for (const [key, data] of marketData) {
          snapshot.set(key, data);
        }
      }),
    );
  }
}
