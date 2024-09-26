import {
  ParameterizedObject,
  IsNever,
  Values,
  UnknownActorLogic,
  Invert,
} from 'xstate';
import { ArvoEventData, CloudEventExtension } from 'arvo-core';

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
 * To avoid runtime errors, it is recommended not to use `arvo$$` object at all in the
 * machine context
 */
export type ArvoMachineContext = {
  arvo$$?: {
    volatile$$?: {
      [key: string]: any;
      eventQueue$$?: EnqueueArvoEventActionParam[];
    };
  };
};

/**
 * Represents the parameters for the emitArvoEvent action in ArvoXState.
 * This type defines a subset of properties from the CreateArvoEvent type,
 * specifically tailored for emitting an ArvoEvent within the state machine context.
 *
 * @remarks
 * The EmitArvoEventActionParam type is crucial for maintaining consistency and
 * type safety when emitting events in an ArvoXState machine. It ensures that
 * only relevant properties are included and properly typed.
 * ```
 */
export type EnqueueArvoEventActionParam = {
  /**
   * Custom extensions for the CloudEvent.
   * Allows for additional metadata to be attached to the event.
   *
   * @remarks
   * Use this field to include any non-standard attributes that are not
   * covered by the core CloudEvent specification or Arvo extensions.
   */
  __extensions?: CloudEventExtension;

  /**
   * Defines access controls for the event.
   * Can be a UserID, encrypted string, or key-value pairs.
   *
   * @remarks
   * This field is used to implement fine-grained access control on event
   * consumption. The exact format and interpretation may depend on your
   * system's access control mechanisms.
   */
  accesscontrol?: string;

  /**
   * The event payload. This payload must be JSON serializable.
   *
   * @remarks
   * The data field contains the event-specific information. Ensure that
   * the structure of this data conforms to the schema specified in the
   * `dataschema` field, if provided.
   */
  data: ArvoEventData;

  /**
   * Identifies the schema that the `data` adheres to.
   * Must be a valid URI if present.
   *
   * @remarks
   * Use this field to provide a link to the schema definition for the
   * event data. This helps consumers understand and validate the event structure.
   */
  dataschema?: string;

  /**
   * Unique identifier of the event.
   * Must be a non-empty string. If not provided, a UUID will be generated.
   *
   * @remarks
   * While it's often best to let the system generate this ID, you may provide
   * your own if you need to ensure idempotency or track specific events.
   */
  id?: string;

  /**
   * Indicates alternative recipients or destinations for events.
   * Must be a valid URI if present.
   *
   * @remarks
   * Use this field to implement event forwarding or to specify secondary
   * event consumers in addition to the primary one specified in the `to` field.
   */
  redirectto?: string;

  /**
   * Defines the consumer machine of the event. Used for event routing.
   * Must be a valid URI if present. If not available, the `type` field
   * is used as a default.
   *
   * @remarks
   * This field is crucial for directing events to specific services or
   * components in your system. Ensure the URI is correctly formatted and
   * recognized by your event routing infrastructure.
   */
  to?: string;

  /**
   * Describes the type of event.
   * Should be prefixed with a reverse-DNS name.
   *
   * @remarks
   * The event type is a key field for consumers to understand the nature
   * of the event without inspecting its data. Use a consistent naming convention
   * to enhance system-wide event comprehension.
   */
  type: string;

  /**
   * Identifies the context in which an event happened. Must be a valid URI representing the event producer.
   *
   * @remarks
   * By default, the actor source name is used. It is recommended to let that be the case.
   * If you choose to override this, please ensure you are aware of the consequences and it is a deliberate decision.
   * Changing this value may affect event tracing and source identification in your system.
   */
  source?: string;

  /**
   * Identifies the subject of the event. For Arvo, this must be the Process Id.
   *
   * @remarks
   * By default, it is the actor subject id, and it is recommended to let that be the case.
   * In rare cases, such as sending init events to a different orchestrator, you might need to explicitly provide it.
   * Otherwise, it's best not to use this field directly to maintain consistency in event subject identification.
   */
  subject?: string;

  /**
   * Represents the cost associated with generating the cloudevent.
   *
   * @remarks
   * By default, it uses the actor's executionunits. This field can be used for
   * resource accounting or billing purposes. Only override this if you have a specific
   * reason to assign a different cost to this particular event emission.
   */
  executionunits?: number;
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
