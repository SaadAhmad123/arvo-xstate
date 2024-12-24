import { ArvoErrorType } from 'arvo-core';

export type NumberModiferMachineContext = {
  currentSubject$$: string;
  key: string;
  init: number;
  modifier: number;
  operation: 'increment' | 'decrement';
  trend: 'linear' | 'exponential';
  errors: ArvoErrorType[];
  final_value: number;
};
