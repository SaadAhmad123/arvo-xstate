import type { ArvoErrorType } from 'arvo-core';

export type IncrementResumableContext = {
  modifications: {
    key: string;
    value: number | null;
    modifier: number;
  }[];
  error: ArvoErrorType[];
};
