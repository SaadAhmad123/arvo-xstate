import type { EventHandlerFactory } from 'arvo-event-handler';
import { createArvoOrchestrator } from '../../../../src';
import type { OrchestratorConfig } from '../type';
import { machineV001 } from './machines/v001';
import { machineV002 } from './machines/v002';

export const decrementOrchestrator: EventHandlerFactory<OrchestratorConfig> = ({ memory }) =>
  createArvoOrchestrator({
    memory,
    executionunits: 0.1,
    machines: [machineV001, machineV002],
  });
