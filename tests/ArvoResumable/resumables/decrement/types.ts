import type { ArvoErrorType } from 'arvo-core';

export type DecrementResumableState = {
  key: string;
  value: number;
  modifier: number;
  trend: 'linear' | 'exponential';
  error: ArvoErrorType[];
};
