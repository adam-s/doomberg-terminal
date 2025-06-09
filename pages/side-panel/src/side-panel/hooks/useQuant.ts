import { useState, useEffect } from 'react';
import { useService } from './useService';
import { IQuantService } from '@src/services/quant/quant.service';
import { autorun } from 'vs/base/common/observable';
import {
  MovingAveragePeriod,
  CumulativeFlowPeriod,
  StopLossAmount,
  TakeProfitAmount,
  BullishThreshold,
  BearishThreshold,
  StrategyType,
  WideningThreshold,
} from '@src/services/quant/settings';

export interface QuantData {
  status: string;
  movingAveragePeriod: MovingAveragePeriod;
  cumulativeFlowPeriod: CumulativeFlowPeriod;
  setMovingAveragePeriod: (value: MovingAveragePeriod) => void;
  setCumulativeFlowPeriod: (value: CumulativeFlowPeriod) => void;

  // Updated types for new properties
  stopLoss: StopLossAmount;
  takeProfit: TakeProfitAmount;
  bullishThreshold: BullishThreshold;
  bearishThreshold: BearishThreshold;
  wideningThreshold: WideningThreshold;
  setStopLoss: (value: StopLossAmount) => void;
  setTakeProfit: (value: TakeProfitAmount) => void;
  setBullishThreshold: (value: BullishThreshold) => void;
  setBearishThreshold: (value: BearishThreshold) => void;
  setWideningThreshold: (value: WideningThreshold) => void;

  // Add strategy type
  strategyType: StrategyType;
  setStrategyType: (value: StrategyType) => void;
}

export const useQuant = (): QuantData => {
  const quantService = useService(IQuantService);
  const [status, setStatus] = useState<string>('idle');
  const [movingAveragePeriod, setMovingAveragePeriodState] = useState<MovingAveragePeriod>(
    15 as MovingAveragePeriod,
  );
  const [cumulativeFlowPeriod, setCumulativeFlowPeriodState] = useState<CumulativeFlowPeriod>(
    10 as CumulativeFlowPeriod,
  );
  const [stopLoss, setStopLossState] = useState<StopLossAmount>(100 as StopLossAmount);
  const [takeProfit, setTakeProfitState] = useState<TakeProfitAmount>(100 as TakeProfitAmount);
  const [bullishThreshold, setBullishThresholdState] = useState<BullishThreshold>(
    750 as BullishThreshold,
  );
  const [bearishThreshold, setBearishThresholdState] = useState<BearishThreshold>(
    -750 as BearishThreshold,
  );
  const [strategyType, setStrategyTypeState] = useState<StrategyType>(StrategyType.TWO_WAY);
  const [wideningThreshold, setWideningThresholdState] = useState<WideningThreshold>(
    50 as WideningThreshold,
  );

  useEffect(() => {
    const disposables = [
      // Subscribe to status changes
      autorun(reader => {
        const currentStatus = quantService.status$.read(reader);
        setStatus(currentStatus);
      }),

      // Subscribe to moving average period changes
      autorun(reader => {
        const currentPeriod = quantService.settings.movingAveragePeriod$.read(reader);
        setMovingAveragePeriodState(currentPeriod as MovingAveragePeriod);
      }),

      // Subscribe to cumulative flow period changes
      autorun(reader => {
        const currentCumulative = quantService.settings.cumulativeFlowPeriod$.read(reader);
        setCumulativeFlowPeriodState(currentCumulative as CumulativeFlowPeriod);
      }),

      // Subscribe to stop loss changes
      autorun(reader => {
        const currentStopLoss = quantService.settings.stopLoss$.read(reader);
        setStopLossState(currentStopLoss as StopLossAmount);
      }),

      // Subscribe to take profit changes
      autorun(reader => {
        const currentTakeProfit = quantService.settings.takeProfit$.read(reader);
        setTakeProfitState(currentTakeProfit as TakeProfitAmount);
      }),

      // Subscribe to bullish threshold changes
      autorun(reader => {
        const currentBullishThreshold = quantService.settings.bullishThreshold$.read(reader);
        setBullishThresholdState(currentBullishThreshold as BullishThreshold);
      }),

      // Subscribe to bearish threshold changes
      autorun(reader => {
        const currentBearishThreshold = quantService.settings.bearishThreshold$.read(reader);
        setBearishThresholdState(currentBearishThreshold as BearishThreshold);
      }),

      // Subscribe to strategy type changes
      autorun(reader => {
        const currentStrategyType = quantService.settings.strategyType$.read(reader);
        setStrategyTypeState(currentStrategyType as StrategyType);
      }),

      // Subscribe to widening threshold changes
      autorun(reader => {
        const currentWideningThreshold = quantService.settings.wideningThreshold$.read(reader);
        setWideningThresholdState(currentWideningThreshold as WideningThreshold);
      }),
    ];

    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [quantService]);

  // Function to update the moving average period
  const setMovingAveragePeriod = (value: MovingAveragePeriod) => {
    quantService.settings.setMovingAveragePeriod(value);
  };

  // Function to update the cumulative flow period
  const setCumulativeFlowPeriod = (value: CumulativeFlowPeriod) => {
    quantService.settings.setCumulativeFlowPeriod(value);
  };

  // Function to update the stop loss
  const setStopLoss = (value: StopLossAmount) => {
    quantService.settings.setStopLoss(value);
  };

  // Function to update the take profit
  const setTakeProfit = (value: TakeProfitAmount) => {
    quantService.settings.setTakeProfit(value);
  };

  // Function to update the bullish threshold
  const setBullishThreshold = (value: BullishThreshold) => {
    quantService.settings.setBullishThreshold(value);
  };

  // Function to update the bearish threshold
  const setBearishThreshold = (value: BearishThreshold) => {
    quantService.settings.setBearishThreshold(value);
  };

  // Function to update the strategy type
  const setStrategyType = (value: StrategyType) => {
    quantService.settings.setStrategyType(value);
  };

  // Function to update the widening threshold
  const setWideningThreshold = (value: WideningThreshold) => {
    quantService.settings.setWideningThreshold(value);
  };

  return {
    status,
    movingAveragePeriod,
    cumulativeFlowPeriod,
    stopLoss,
    takeProfit,
    bullishThreshold,
    bearishThreshold,
    strategyType,
    wideningThreshold,
    setMovingAveragePeriod,
    setCumulativeFlowPeriod,
    setStopLoss,
    setTakeProfit,
    setBullishThreshold,
    setBearishThreshold,
    setStrategyType,
    setWideningThreshold,
  };
};
