import { ArvoOrchestrator } from ".";
import { MachineExecutionEngine } from "../MachineExecutionEngine";
import { MachineRegistry } from "../MachineRegistry";
import { ICreateArvoOrchestrator } from "./types";

/**
* Creates a new Arvo orchestrator instance with default components.
* For custom components, use ArvoOrchestrator constructor directly.
* 
* @param config - Orchestrator configuration:
*   - memory: State persistence interface
*   - executionunits: Cost units for execution
*   - machines: State machines to manage
* @returns Configured ArvoOrchestrator with default components
* 
* @example
* ```ts
* const orchestrator = createArvoOrchestrator({
*   memory: new MyMemoryImplementation(),
*   executionunits: 100,
*   machines: [machineA, machineB]
* });
* ```
*/
export const createArvoOrchestrator = ({
  executionunits, 
  memory,
  machines
}: ICreateArvoOrchestrator) : ArvoOrchestrator => {
  return new ArvoOrchestrator({
    executionunits,
    memory,
    registry: new MachineRegistry(...machines),
    executionEngine: new MachineExecutionEngine()
  })
}