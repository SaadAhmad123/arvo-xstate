import type { ArvoErrorType } from 'arvo-core';

export type DecrementMachineContext = {
  key: string;
  value: number;
  modifier: number;
  trend: 'linear' | 'exponential';
  error: ArvoErrorType[];
};
