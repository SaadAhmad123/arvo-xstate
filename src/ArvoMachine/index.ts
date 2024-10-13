import {
  ArvoContract,
  ArvoOrchestratorContract,
  ArvoOrchestratorVersion,
} from 'arvo-core';
import { AnyActorLogic } from 'xstate';

/**
 * Represents an ArvoMachine object that can be consumed by an Arvo orchestrator.
 *
 * @description
 * ArvoMachine encapsulates the logic and metadata required for an Arvo-compatible
 * state machine. It combines XState's actor logic with Arvo-specific contracts
 * and versioning information.
 *
 * @note
 * It is strongly recomended to use `setupArvoMachine(...).createMachine(...)`
 * instead of creating this object directly.
 * ```
 */
export default class ArvoMachine<
  TId extends string,
  TVersion extends ArvoOrchestratorVersion,
  TSelfContract extends ArvoOrchestratorContract,
  TServiceContract extends Record<string, ArvoContract>,
  TLogic extends AnyActorLogic,
> {
  /**
   * Creates a new ArvoMachine instance.
   *
   * @param id - A unique identifier for the machine.
   * @param version - The version of the machine, following semantic versioning.
   * @param contracts - An object containing the self contract and service contracts.
   * @param logic - The XState actor logic defining the machine's behavior.
   */
  constructor(
    /**
     * A unique identifier for the machine.
     */
    public readonly id: TId,

    /**
     * The version of the machine, following semantic versioning.
     */
    public readonly version: TVersion,

    /**
     * An object containing the self contract and service contracts.
     * @property {TSelfContract} self - The contract defining the machine's interface.
     * @property {TServiceContract} services - A record of service contracts the machine interacts with.
     */
    public readonly contracts: {
      self: TSelfContract;
      services: TServiceContract;
    },

    /**
     * The XState actor logic defining the machine's behavior.
     */
    public readonly logic: TLogic,
  ) {}
}
