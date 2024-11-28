import {
  ArvoContract,
  ArvoOrchestratorContract,
  ArvoSemanticVersion,
  VersionedArvoContract,
} from 'arvo-core';
import { AnyActorLogic } from 'xstate';

/**
 * Represents an ArvoMachine object that can be consumed by an Arvo orchestrator.
 * ArvoMachine encapsulates the logic and metadata required for an Arvo-compatible
 * state machine. It combines XState's actor logic with Arvo-specific contracts
 * and versioning information.
 *
 * @remarks
 * It is strongly recommended to use `setupArvoMachine(...).createMachine(...)`
 * instead of creating this object directly. The setup function provides additional
 * type safety and validation that helps prevent runtime errors.
 */
export default class ArvoMachine<
  TId extends string,
  TVersion extends ArvoSemanticVersion,
  TSelfContract extends VersionedArvoContract<
    ArvoOrchestratorContract,
    TVersion
  >,
  TServiceContract extends Record<
    string,
    VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
  >,
  TLogic extends AnyActorLogic,
> {
  /**
   * Creates a new ArvoMachine instance.
   *
   * @param id - A unique identifier for the machine. This ID must be unique within
   *            the scope of an orchestrator and is used for routing and logging.
   *
   * @param version - The semantic version of the machine. Must follow semver format
   *                and match the version specified in the contract.
   *
   * @param contracts - Configuration object containing contract definitions
   * @param contracts.self - The contract defining this machine's interface and capabilities
   * @param contracts.services - Record of contracts for services this machine can interact with
   *
   * @param logic - The XState actor logic that defines the machine's behavior,
   *               including states, transitions, and actions.
   *
   * @throws {Error} When contracts are invalid or incompatible with the specified version
   */
  constructor(
    public readonly id: TId,
    public readonly version: TVersion,
    public readonly contracts: {
      self: TSelfContract;
      services: TServiceContract;
    },
    public readonly logic: TLogic,
  ) {}
}
