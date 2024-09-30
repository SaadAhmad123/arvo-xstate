import { ArvoContract, ArvoOrchestratorVersion, ArvoOrchestratorContract } from "arvo-core";
import ArvoMachine from "../ArvoMachine";
import { AnyActorLogic } from "xstate";
import { z } from "zod";

export interface IArvoOrchestrator<
  TUri extends string, 
  TInitType extends string, 
  TInit extends z.ZodTypeAny, 
  TCompleteType extends string, 
  TComplete extends z.ZodTypeAny,
  TServiceContracts extends Record<string, ArvoContract>,
  TLogic extends AnyActorLogic
> {
  executionunits: number,
  machines: ArvoMachine<
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
}