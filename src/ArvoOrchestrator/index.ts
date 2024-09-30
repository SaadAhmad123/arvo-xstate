import { AbstractArvoEventHandler, MultiArvoEventHandlerFunctionInput, MultiArvoEventHandlerFunctionOutput } from "arvo-event-handler";
import { z } from "zod";
import { IArvoOrchestrator } from "./types";
import { ArvoContract, ArvoContractRecord, ArvoEvent, ArvoOrchestratorContract, ArvoOrchestratorVersion } from "arvo-core";
import { AnyActorLogic } from 'xstate'
import ArvoMachine from "../ArvoMachine";

export default class ArvoOrchestrator<
  TUri extends string = string,
  TInitType extends string = string,
  TInit extends z.ZodTypeAny = z.ZodTypeAny,
  TCompleteType extends string = string,
  TComplete extends z.ZodTypeAny = z.ZodTypeAny,
  TServiceContracts extends Record<string, ArvoContract> = Record<string, ArvoContract>,
  TLogic extends AnyActorLogic = AnyActorLogic
> extends AbstractArvoEventHandler {

  public readonly source: TInitType
  public readonly executionunits: number
  public readonly machines: ArvoMachine<
    string,
    ArvoOrchestratorVersion,
    ArvoOrchestratorContract<
      TUri,
      TInitType,
      TInit,
      TCompleteType,
      TComplete
    >,
    TServiceContracts,
    TLogic
  >[]

  constructor(param: IArvoOrchestrator<
    TUri,
    TInitType,
    TInit,
    TCompleteType,
    TComplete,
    TServiceContracts,
    TLogic
  >) {
    super()

    if (param.machines.length === 0) {
      throw new Error("At least one machine must be defined for the Arvo orchestrator.")
    }
    
    this.machines = param.machines
    this.executionunits = param.executionunits
    this.source = param.machines[0].contracts.self.accepts.type

    const representativeMachine = this.machines[0]
    for (const item of this.machines) {
      if (
        item.contracts.self.accepts.type !== representativeMachine.contracts.self.accepts.type ||
        item.contracts.self.uri !== representativeMachine.contracts.self.uri
      ) {
        throw new Error('All machines must have same self contract for a particular orchestrator')
      }
    }
  }

  public async execute(event: ArvoEvent): Promise<ArvoEvent[]> {
    return []
  }

  public get systemErrorSchema(): ArvoContractRecord {
    return this.machines[0].contracts.self.systemError
  }

}