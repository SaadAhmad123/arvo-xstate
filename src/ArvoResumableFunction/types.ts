import type { VersionedArvoContract, ArvoSemanticVersion, InferVersionedArvoContract, ArvoContract } from 'arvo-core';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';

type Handler<
  TMemory extends Record<string, any>,
  TSelfContract extends VersionedArvoContract<any, any>,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = (param: {
  state: TMemory;
  init?: InferVersionedArvoContract<TSelfContract>['accepts'];
  services?: Array<
    {
      [K in keyof TServiceContract]:
        | {
            [L in keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]: InferVersionedArvoContract<
              TServiceContract[K]
            >['emits'][L];
          }[keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]
        | InferVersionedArvoContract<TServiceContract[K]>['systemError'];
    }[keyof TServiceContract]
  >;
}) => Promise<{
  state?: TMemory;
  complete?: {
    [L in keyof InferVersionedArvoContract<TSelfContract>['emits']]: EnqueueArvoEventActionParam<
      InferVersionedArvoContract<TSelfContract>['emits'][L]['data'],
      InferVersionedArvoContract<TSelfContract>['emits'][L]['type']
    >;
  }[keyof InferVersionedArvoContract<TSelfContract>['emits']];
  services?: Array<
    {
      [K in keyof TServiceContract]: EnqueueArvoEventActionParam<
        InferVersionedArvoContract<TServiceContract[K]>['accepts']['data'],
        InferVersionedArvoContract<TServiceContract[K]>['accepts']['type']
      >;
    }[keyof TServiceContract]
  >;
  // biome-ignore lint/suspicious/noConfusingVoidType: Make the function more ergonomic in coding
} | void>;

export type ArvoResumableState<T extends Record<string, any>> = {
  arvo$$: object;
  state$$: T;
};

export type ArvoResumableHandler<
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = {
  [V in ArvoSemanticVersion & keyof TSelfContract['versions']]: Handler<
    TMemory,
    VersionedArvoContract<TSelfContract, V>,
    TServiceContract
  >;
};
