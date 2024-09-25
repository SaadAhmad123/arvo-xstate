import {
  ParameterizedObject,
  IsNever,
  Values,
  UnknownActorLogic,
  Invert,
} from 'xstate';
import { ArvoEvent } from 'arvo-core';

/**
 * Represents the version of an Arvo Machine in semantic versioning format.
 */
export type ArvoMachineVersion = `${number}.${number}.${number}`;

/**
 * Represents an extended context for Arvo XState machines, including additional properties
 * for volatile and internal data.
 *
 * @remarks
 * This type extends the base XState MachineContext with additional properties
 * to provide more flexibility and organization in storing machine-related data.
 *
 * The `$$` suffix in property names is used to indicate special storage objects within the context.
 *
 * @note
 * To avoid runtime errors, it is recommended not to use any field names with the $$ suffix in the
 * context, except for the predefined ones.
 */
export type ArvoMachineContext = {
  arvo$$?: {
    volatile$$?: {
      [key: string]: any;
      eventQueue$$?: ArvoEvent[];
    };
  };
};

/**
 * @remarks
 * This is an internal type. Copied as it is from the
 * xstate core [here](https://github.com/statelyai/xstate/blob/main/packages/core/src/setup.ts#L26)
 */
export type ToParameterizedObject<
  TParameterizedMap extends Record<
    string,
    ParameterizedObject['params'] | undefined
  >,
> = // `silentNeverType` to `never` conversion (explained in `ToProvidedActor`)
  IsNever<TParameterizedMap> extends true
    ? never
    : Values<{
        [K in keyof TParameterizedMap & string]: {
          type: K;
          params: TParameterizedMap[K];
        };
      }>;

/**
 * @remarks
 * This is an internal type. Copied as it is from the
 * xstate core [here](https://github.com/statelyai/xstate/blob/main/packages/core/src/setup.ts#L43)
 */
export type ToProvidedActor<
  TChildrenMap extends Record<string, string>,
  TActors extends Record<string, UnknownActorLogic>,
> =
  IsNever<TActors> extends true
    ? never
    : Values<{
        [K in keyof TActors & string]: {
          src: K;
          logic: TActors[K];
          id: IsNever<TChildrenMap> extends true
            ? string | undefined
            : K extends keyof Invert<TChildrenMap>
              ? Invert<TChildrenMap>[K] & string
              : string | undefined;
        };
      }>;
