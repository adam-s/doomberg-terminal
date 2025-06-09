import { Disposable } from 'vs/base/common/lifecycle';
import { IOptionDataService } from '../chains/optionData.service';
import { IObservable, observableValue, derived, autorun } from 'vs/base/common/observable';

import {
  IMarketDataItem,
  IPairedOptionData,
  IVolatilitySkewPoint,
  ISmaState,
  OptionType,
  SentimentDataPoint,
  SMADataPoint,
  SentimentDataConfig,
  DEFAULT_CONFIG,
  processMarketData,
  groupMarketDataByExpiration,
  pairOptions,
  calculateSentiment,
  didSmaStateMapChange,
  createVolatilitySkewPoints,
  calculateCurrentSMA, // Added
  calculateSMAHistory, // Added
  calculateEMAHistory, // Added
} from './sentimentUtils';

/**
 * Interface defining the public API for sentiment calculations
 */
export interface ISentimentData extends Disposable {
  readonly symbol: string;
  readonly optionDataService: IOptionDataService;

  // Original observables (all options combined)
  readonly sentimentHistory$: IObservable<SentimentDataPoint[]>;
  readonly sentiment$: IObservable<number>;
  readonly pairedOptions$: IObservable<IPairedOptionData[]>;
  readonly sentimentSMA10$: IObservable<number>;
  readonly sentimentSMAHistory$: IObservable<SMADataPoint[]>;

  // Observables grouped by expiration date
  readonly pairedOptionsByExpiration$: IObservable<Map<string, IPairedOptionData[]>>;
  readonly sentimentByExpiration$: IObservable<Map<string, number>>;
  readonly sentimentHistoryByExpiration$: IObservable<Map<string, SentimentDataPoint[]>>;
  readonly sentimentSMA10ByExpiration$: IObservable<Map<string, number>>;
  readonly sentimentSMAHistoryByExpiration$: IObservable<Map<string, SMADataPoint[]>>;
  readonly volatilitySkewByExpiration$: IObservable<Map<string, IVolatilitySkewPoint[]>>;

  start(): Promise<void>;
  stop(): void;
}

/**
 * Implementation of sentiment calculations and tracking
 */
export class SentimentData extends Disposable implements ISentimentData {
  public readonly config: SentimentDataConfig;
  public readonly symbol: string;

  // Derived observables for processing call and put market data
  private readonly _callsMarketData$ = derived<IMarketDataItem[]>(this, reader => {
    const optionsData = this.optionDataService.optionsData$.read(reader);
    return processMarketData(
      optionsData?.instruments,
      optionsData?.marketData,
      OptionType.CALL,
      optionsData?.lastTradePrice,
    );
  });

  private readonly _putsMarketData$ = derived<IMarketDataItem[]>(this, reader => {
    const optionsData = this.optionDataService.optionsData$.read(reader);
    return processMarketData(
      optionsData?.instruments,
      optionsData?.marketData,
      OptionType.PUT,
      optionsData?.lastTradePrice,
    );
  });

  // Private observable values for history and SMA state
  private readonly _sentimentHistory = observableValue<SentimentDataPoint[]>(this, []);
  private readonly _sentimentHistoryByExpiration = observableValue<
    Map<string, SentimentDataPoint[]>
  >(this, new Map());
  private readonly _volatilitySkewSmaStateByExpiration = observableValue<
    Map<string, Map<number, ISmaState>>
  >(this, new Map());

  // Public observables
  public readonly sentimentHistory$ = derived(this, reader => this._sentimentHistory.read(reader));
  public readonly sentimentHistoryByExpiration$ = derived(this, reader =>
    this._sentimentHistoryByExpiration.read(reader),
  );

  public readonly pairedOptions$ = derived<IPairedOptionData[]>(this, reader => {
    const calls = this._callsMarketData$.read(reader);
    const puts = this._putsMarketData$.read(reader);
    return pairOptions(calls, puts);
  });

  public readonly pairedOptionsByExpiration$ = derived<Map<string, IPairedOptionData[]>>(
    this,
    reader => {
      const calls = this._callsMarketData$.read(reader);
      const puts = this._putsMarketData$.read(reader);
      const grouped = new Map<string, IPairedOptionData[]>();
      const callsByExp = groupMarketDataByExpiration(calls);
      const putsByExp = groupMarketDataByExpiration(puts);
      const allExps = new Set([...callsByExp.keys(), ...putsByExp.keys()]);

      for (const exp of allExps) {
        const c = callsByExp.get(exp) ?? [];
        const p = putsByExp.get(exp) ?? [];
        if (c.length && p.length) {
          const pairs = pairOptions(c, p);
          if (pairs.length) grouped.set(exp, pairs);
        }
      }
      return grouped;
    },
  );

  public readonly sentiment$ = derived<number>(this, reader => {
    const pairs = this.pairedOptions$.read(reader);
    return calculateSentiment(pairs, this.config);
  });

  public readonly sentimentSMA10$ = derived<number>(this, reader => {
    const history = this.sentimentHistory$.read(reader);
    return calculateCurrentSMA(history, this.config.period);
  });

  public readonly sentimentSMAHistory$ = derived<SMADataPoint[]>(this, reader => {
    const history = this.sentimentHistory$.read(reader);
    return calculateSMAHistory(history, this.config.period);
  });

  public readonly sentimentByExpiration$ = derived<Map<string, number>>(this, reader => {
    const pm = this.pairedOptionsByExpiration$.read(reader);
    const map = new Map<string, number>();
    for (const [exp, pairs] of pm) {
      map.set(exp, calculateSentiment(pairs, this.config));
    }
    return map;
  });

  public readonly sentimentSMA10ByExpiration$ = derived<Map<string, number>>(this, reader => {
    const hist = this.sentimentHistoryByExpiration$.read(reader);
    const map = new Map<string, number>();
    const period = this.config.period;
    for (const [exp, arr] of hist) {
      map.set(exp, calculateCurrentSMA(arr, period));
    }
    return map;
  });

  public readonly sentimentSMAHistoryByExpiration$ = derived<Map<string, SMADataPoint[]>>(
    this,
    reader => {
      const hist = this.sentimentHistoryByExpiration$.read(reader);
      const map = new Map<string, SMADataPoint[]>();
      const period = this.config.period;
      for (const [exp, arr] of hist) {
        map.set(exp, calculateEMAHistory(arr, period)); // Changed to calculateEMAHistory
      }
      return map;
    },
  );

  public readonly volatilitySkewByExpiration$ = derived<Map<string, IVolatilitySkewPoint[]>>(
    this,
    reader => {
      const paired = this.pairedOptionsByExpiration$.read(reader);
      const currentState = this._volatilitySkewSmaStateByExpiration.read(reader);
      const nextState = new Map<string, Map<number, ISmaState>>();
      const result = new Map<string, IVolatilitySkewPoint[]>();

      for (const [exp, pairs] of paired) {
        const prevState = currentState.get(exp) ?? new Map<number, ISmaState>();
        const { skewPoints, updatedSmaState } = createVolatilitySkewPoints(
          pairs,
          prevState,
          this.config.period,
        );
        if (skewPoints.length) {
          result.set(exp, skewPoints);
          nextState.set(exp, updatedSmaState);
        }
      }

      if (didSmaStateMapChange(currentState, nextState)) {
        Promise.resolve().then(() =>
          this._volatilitySkewSmaStateByExpiration.set(nextState, undefined),
        );
      }
      return result;
    },
  );

  constructor(
    public readonly optionDataService: IOptionDataService,
    config?: Partial<SentimentDataConfig>,
  ) {
    super();
    this.symbol = optionDataService.symbol;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._registerAutoruns();
  }
  private _registerAutoruns(): void {
    this._register(
      autorun(reader => {
        const s = this.sentiment$.read(reader);
        const h = this._sentimentHistory.get();
        if (s === 0 && h.length) return;
        const entry: SentimentDataPoint = { timestamp: Date.now(), value: s };
        this._sentimentHistory.set([...h, entry].slice(-this.config.maxHistorySize), undefined);
      }),
    );

    this._register(
      autorun(reader => {
        const byExp = this.sentimentByExpiration$.read(reader);
        const histMap = this._sentimentHistoryByExpiration.get();
        const updated = new Map(histMap);
        let changed = false;
        const now = Date.now();
        for (const [exp, val] of byExp) {
          const arr = updated.get(exp) ?? [];
          if (val === 0 && arr.length) continue;
          const entry: SentimentDataPoint = { timestamp: now, value: val };
          updated.set(exp, [...arr, entry].slice(-this.config.maxHistorySize));
          changed = true;
        }
        if (changed) this._sentimentHistoryByExpiration.set(updated, undefined);
      }),
    );

    this._register(
      autorun(reader => {
        this.volatilitySkewByExpiration$.read(reader);
      }),
    );
  }

  public async start(): Promise<void> {
    await this.optionDataService.start();
  }

  public stop(): void {
    this.optionDataService.stop();
  }

  public override dispose(): void {
    this.stop();
    super.dispose();
  }
}
