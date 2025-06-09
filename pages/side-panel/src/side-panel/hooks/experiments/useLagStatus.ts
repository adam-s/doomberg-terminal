import React from 'react';

export type LagStatus = 'green' | 'red' | 'neutral';

export const useLagStatus = () => {
  const [lagStatuses, setLagStatuses] = React.useState<Record<number, LagStatus>>({});

  const updateLagStatus = React.useCallback((lag: number, status: LagStatus) => {
    setLagStatuses(prev => ({ ...prev, [lag]: status }));
  }, []);

  const aggregateStatus = React.useMemo(() => {
    const statuses = Object.values(lagStatuses);
    if (statuses.length === 0) return 'neutral';
    if (statuses.every(status => status === 'green')) return 'green';
    if (statuses.every(status => status === 'red')) return 'red';
    return 'neutral';
  }, [lagStatuses]);

  return { updateLagStatus, aggregateStatus };
};
