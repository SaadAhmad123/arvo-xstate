import { EventHandlerFactory } from 'arvo-event-handler';
import { OrchestratorConfig } from '../type';
import { createArvoOrchestrator } from '../../../../src';
import { machineV001 } from './machines/v001';
import { machineV002 } from './machines/v002';

export const incrementOrchestrator: EventHandlerFactory<OrchestratorConfig> = ({
  memory,
}) =>
  createArvoOrchestrator({
    memory,
    executionunits: 0.1,
    machines: [machineV001, machineV002],
  });
