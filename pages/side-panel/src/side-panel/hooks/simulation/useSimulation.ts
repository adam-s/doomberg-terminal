import { useEffect, useState } from 'react';
import { useService } from '../useService';
import { ITradeSimulatorService } from '@src/services/simulators/tradeSimulator/tradeSimulator.service';
import { IPerformanceReport } from '@src/services/simulators/tradeSimulator/strategy/baseStrategy';

export interface UseSimulationBaseResult {
  reports: IPerformanceReport[];
}

export const useSimulation = (): UseSimulationBaseResult => {
  const tradeSimulatorService = useService(ITradeSimulatorService);
  const [reports, setReports] = useState<IPerformanceReport[]>([]);

  useEffect(() => {
    const subscription = tradeSimulatorService.onPerformanceUpdate(
      (newReports: IPerformanceReport[]) => {
        setReports(newReports);
      },
    );
    return () => subscription.dispose();
  }, [tradeSimulatorService]);

  return {
    reports,
  };
};
