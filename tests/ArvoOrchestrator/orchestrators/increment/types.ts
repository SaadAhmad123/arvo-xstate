import { ArvoErrorType } from 'arvo-core';

export type IncrementMachineContract = {
  key: string;
  value: number;
  modifier: number;
  trend: 'linear' | 'exponential';
  error: ArvoErrorType[];
};
