---
title: "ArvoOrchestrator"
group: Guides
---


# ArvoOrchestrator

## Overview

The `ArvoOrchestrator` serves as the cornerstone of the Arvo state machine workflow system, orchestrating the intricate dance between state machine execution, lifecycle management, and event processing. At its heart, it coordinates three essential components: the Machine Registry for definition management, Machine Memory for state persistence, and the Execution Engine for processing logic. This harmonious integration enables robust workflow management while maintaining comprehensive telemetry and error handling.

## Getting Started

Begin your journey with Arvo through a straightforward initialization process. The following example demonstrates setting up a basic orchestrator with two machines:

```typescript
import { createArvoOrchestrator, SimpleMachineMemory, setupArvoMachine } from 'arvo-xstate';

const machine1 = setupArvoMachine(...).createMachine(...);
const machine2 = setupArvoMachine(...).createMachine(...);

const orchestrator = createArvoOrchestrator({
  memory: new SimpleMachineMemory(),
  executionunits: 1,
  machines: [machine1, machine2]
});

// Process an event
const events = await orchestrator.execute(incomingEvent);
```

## Operation overview

When an event arrives at the `ArvoOrchestrator`, it initiates a sophisticated sequence of operations. The process begins by establishing a telemetry context through OpenTelemetry instantiated via `ArvoOpenTelemetry.getInstance()` from `arvo-core`, enabling comprehensive monitoring of the execution lifecycle. The orchestrator then acquires an exclusive lock on the workflow subject, ensuring isolated execution and data consistency.

State retrieval follows lock acquisition, determining whether this is a new workflow initialization or the continuation of an existing execution. For new workflows, the orchestrator validates that the triggering event matches the expected initialization type. Existing workflows undergo proper routing to ensure the event reaches the correct instance.

The orchestrator resolves machine definitions through its registry, considering version requirements and compatibility. After validating input against established contracts, the execution engine processes the event within the machine's context. The resulting raw events undergo transformation and validation before emission as fully-formed Arvo events.

## Event Routing in Arvo Orchestrator

The Arvo Orchestrator implements a sophisticated event routing mechanism that manages event flow through the workflow system. The routing system operates at multiple levels, handling both direct workflow events and orchestrator-to-orchestrator communications through a parent-child relationship model.

### Core Routing Logic

Event routing in the orchestrator is primarily determined by three key fields in the event structure:
- `type`: Determines the event's purpose and target handler
- `subject`: Contains orchestration routing information including version and chain data
- `to`: Specifies the final destination service for the event

When an event arrives, the orchestrator first validates the subject format to ensure proper routing information. For new workflow instances, it verifies that the event type matches the orchestrator's source identifier. For existing workflows, it confirms that the subject's orchestrator name matches the current orchestrator, preventing misrouted events from causing unintended state changes.

### Parent-Child Workflow Routing

The orchestrator supports hierarchical workflow execution through parent-child routing. When a workflow needs to trigger a sub-workflow, it includes a `parentSubject$$` in the event data. The orchestrator uses this information to maintain execution context across workflow boundaries, enabling complex workflow compositions while preserving execution isolation and state management.

### Routing Control

Events can influence their routing through several mechanisms:
- `redirectto`: Overrides default routing for completion events
- `accesscontrol`: Carries permissions and routing restrictions
- `parsed(event.subject).meta.redirectto`: Provides routing hints for orchestration chains

This comprehensive routing system ensures events are processed by the correct workflow instances while maintaining proper execution boundaries and workflow relationships.

## Detailed Component Integration and Operation

The Lock Management system provides critical execution isolation through the Machine Memory interface. Upon event arrival, the orchestrator acquires an exclusive lock, preventing concurrent modifications to workflow instances. This distributed locking mechanism ensures data consistency throughout the execution cycle. Lock acquisition failures, whether due to existing locks or system issues, trigger appropriate error events and execution termination. The lock persists through the entire execution, protecting all state transitions and modifications until a robust cleanup process ensures proper release.

State Management forms the foundation of workflow processing. After securing execution locks, the orchestrator retrieves the current workflow state, including execution status, values, and machine snapshots. The system performs comprehensive validation to ensure state consistency and compatibility with incoming events and machine versions. New instances undergo initialization with strict validation protocols, while existing workflows receive careful compatibility checks. State persistence occurs atomically after successful processing, with thorough validation ensuring data integrity throughout the workflow lifecycle.

Event Processing follows a rigorous pipeline of validation and transformation. Each incoming event undergoes multiple validation stages to verify subject format, contract compliance, and business rules. The Machine Registry handles sophisticated event routing based on version and type information, ensuring proper workflow targeting. Event transformation maintains data integrity while converting raw machine events into fully-formed Arvo events, preserving ordering guarantees crucial for distributed scenarios.

## Error Handling

The Arvo Orchestrator implements a sophisticated dual-layer error handling strategy. 

### ArvoOrchestratorError

The `ArvoOrchestratorError` is raised during critical infrastructure failures that prevent the orchestrator from performing its core functions. These are specifically thrown during two critical operations: lock acquisition and state reading. These errors indicate fundamental system issues rather than state machine workflow-specific problems.

**Lock acquisition** failures raise this error when the orchestrator cannot obtain exclusive access to a state machine workflow instance. This could occur due to deadlocks, system overload, or infrastructure issues. The error carries both the failure reason and the initiating event, providing context for system operators to diagnose the root cause.

**State** reading failures trigger this error when the orchestrator cannot retrieve state machine workflow state from storage. This might happen due to corrupted data, storage system failures, or network issues. Like lock failures, these errors include context about the attempted operation and the triggering event.

### System Error Events

System error events in the Arvo Orchestrator represent a sophisticated approach to state machine workflow-level error handling. These events `(sys.{source}.error)` are generated at various critical stages: during event subject validation, contract validation, machine execution, event transformation, and state persistence. In each case, the error event carries detailed context about the failure, including the original event, the stage of failure, and relevant error details. This rich error context enables precise error handling and state machine workflow recovery strategies while maintaining the system's operational integrity.

The orchestrator creates these error events instead of throwing errors because state machine workflow failures should be handled as part of the normal event flow rather than as system exceptions. This design allows state machine workflows to implement sophisticated error handling patterns, including retry mechanisms, compensation state machine workflows, or graceful degradation paths. When an error event is generated, it is automatically routed back to the state machine workflow initiator, ensuring that the originating system is notified of t  he failure while preserving the state machine workflow's state and execution context. This approach maintains system stability by treating state machine workflow errors as normal business events rather than system failures, enabling robust error recovery without compromising the orchestrator's core operations.

## Telemetry Integration

The Arvo Orchestrator implements comprehensive OpenTelemetry integration, providing deep visibility into workflow execution and system health. The telemetry system creates hierarchical spans that track each phase of execution while collecting detailed metrics about system performance. Critical measurements include lock acquisition timing, state persistence latency, event processing duration, and resource utilization patterns. This detailed monitoring enables real-time operational insights and rapid issue diagnosis while maintaining minimal overhead on workflow execution.

Each telemetry span captures the complete context of its execution phase, including relevant attributes and events. The hierarchical structure allows operators to trace workflow execution from initial lock acquisition through final state persistence, with clear visibility into each intermediate step. This comprehensive telemetry integration proves invaluable for performance optimization, capacity planning, and issue resolution.

## Performance Optimization

Performance optimization in the Arvo Orchestrator centers on efficient resource utilization and careful monitoring of system behavior. The orchestrator implements sophisticated strategies for managing lock acquisition times, optimizing state persistence, and ensuring efficient event processing. Each aspect of the system undergoes regular analysis to identify bottlenecks and optimization opportunities.

Lock management optimization focuses on minimizing acquisition times while preventing deadlocks and ensuring fair resource distribution. State persistence strategies balance the need for consistency with performance requirements, implementing efficient storage and retrieval patterns. Event processing optimization ensures high throughput while maintaining ordering guarantees and proper context propagation.

Resource cleanup receives particular attention, with careful implementation ensuring timely release of system resources while maintaining system responsiveness. The telemetry system provides crucial insights for these optimization efforts, helping identify high-impact improvements while ensuring system reliability remains uncompromised.

## Deployment Considerations

Deploying the Arvo Orchestrator requires careful attention to system architecture and operational requirements. The system supports various deployment patterns, from single-instance deployments for simple scenarios to sophisticated distributed configurations with shared or local state management. Each deployment pattern offers different tradeoffs between simplicity, scalability, and operational complexity.

Network configuration plays a crucial role in distributed deployments, requiring careful attention to latency, reliability, and security considerations. Storage requirements vary based on workflow volumes and retention needs, demanding appropriate capacity planning and backup strategies. Monitoring setup ensures comprehensive visibility into system health and performance, while backup strategies protect against data loss and enable disaster recovery.

## Operational Excellence

Successful operation of the Arvo Orchestrator depends on well-defined procedures and careful attention to system health. System operators should maintain comprehensive monitoring of health metrics, including lock acquisition patterns, state persistence performance, and event processing throughput. Regular analysis of these metrics helps identify trends and potential issues before they impact system reliability.

Incident response procedures should define clear escalation paths and resolution strategies for common failure scenarios. Documentation must remain current, capturing deployment configurations, operational procedures, and known issue resolutions. Capacity planning should consider both current requirements and future growth, ensuring the system maintains performance as demand increases.

## Custom Implementation

The Arvo Orchestrator supports extensive customization through well-defined interfaces. Organizations can implement specialized behavior while maintaining core system guarantees through custom components:

```typescript
const orchestrator = new ArvoOrchestrator({
  executionunits: 1,
  memory: customMemory,
  registry: customRegistry,
  executionEngine: customEngine
});
```

Custom memory implementations might provide specialized storage strategies or integration with existing infrastructure. Custom registries could implement sophisticated version management or specialized machine resolution logic. Custom execution engines might provide integration with different state machine frameworks or implement specialized execution patterns.

## Detailed Implementation Flow

For a comprehensive understanding of the ArvoOrchestrator's execution flow, sequence diagrams, and internal workings, please refer to our [detailed technical diagrams](https://github.com/SaadAhmad123/arvo-xstate/blob/main/src/ArvoOrchestrator/ExecutionDiagrams.md).