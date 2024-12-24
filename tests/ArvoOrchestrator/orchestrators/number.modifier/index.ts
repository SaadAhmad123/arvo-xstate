import { EventHandlerFactory } from 'arvo-event-handler';
import { OrchestratorConfig } from '../type';
import { createArvoOrchestrator } from '../../../../src';
import { machineV001 } from './machines/v001';

export const numberModifierOrchestrator: EventHandlerFactory<
  OrchestratorConfig
> = ({ memory }) =>
  createArvoOrchestrator({
    memory,
    executionunits: 0.1,
    machines: [machineV001],
  });
