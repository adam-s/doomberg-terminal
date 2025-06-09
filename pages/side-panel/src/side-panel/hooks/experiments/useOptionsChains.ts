/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { useService } from './useService';
import { autorun } from 'vs/base/common/observable';
import { Chain } from '@src/services/chains/chain';
import { OptionsChainsService } from '@src/services/chains/optionsChains.service';

export const useOptionsChains = () => {
  const instantiationService = useService(IInstantiationService);
  const [chains, setChains] = useState<Chain[]>([]);

  const optionsChainsService = useMemo(() => {
    return instantiationService.createInstance(OptionsChainsService);
  }, [instantiationService]);

  const { setSymbols, chains$ } = optionsChainsService;

  useEffect(() => {
    const disposable = autorun(reader => {
      const latestChains = chains$.read(reader);
      setChains([...latestChains]); // Convert readonly array to mutable
    });

    return () => {
      disposable.dispose();
    };
  }, [chains$]);

  return { chains, setSymbols };
};
