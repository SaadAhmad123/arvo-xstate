---
title: 'ArvoOrchestrator'
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

// Process an event - now returns structured result
const { events, allEventDomains, domainedEvents } = await orchestrator.execute(incomingEvent);

// Access different event types
const defaultEvents = events; // Standard processing
const externalEvents = domainedEvents.external; // External system integration
const allEvents = domainedEvents.all; // A Set of every event regardless of domain
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

### Domain-Based Event Processing

The Arvo Orchestrator implements a sophisticated domain-based event routing system that enables advanced workflow patterns including human-in-the-loop operations, external system integrations, and custom processing pipelines.

#### Event Domains

Events emitted from state machines can be categorized into processing domains using the `domains` parameter. Events without explicit domains are automatically assigned to the 'default' domain for standard internal processing. Multi-domain events participate in multiple processing flows simultaneously, enabling sophisticated orchestration patterns.

```typescript
// In your state machine
emit(({ context }) => ({
  domains: ['default', 'external'], // Event goes to both domains
  type: 'approval.request',
  data: { amount: context.amount }
}))
```

#### Domain Processing Patterns

Common domain patterns include:

- **Default Domain**: Standard internal service routing and processing
- **External Domain**: Human-in-the-loop workflows, third-party integrations, approval processes
- **Analytics Domain**: Real-time monitoring, metrics collection, audit trails
- **Priority Domain**: High-priority processing with specialized handling

#### Orchestrator Response Structure

The orchestrator returns a structured response containing domain-segregated event buckets:

- `events`: Events assigned to the 'default' domain for backward compatibility
- `allEventDomains`: Array of all unique domain names used in the execution
- `domainedEvents.all`: Every event regardless of domain assignment
- `domainedEvents[domainName]`: Events specific to each domain

This structure enables flexible event processing where different domains can be routed to specialized handlers while maintaining a unified orchestration interface.


## Detailed Component Integration and Operation

The Lock Management system provides critical execution isolation through the Machine Memory interface. Upon event arrival, the orchestrator acquires an exclusive lock, preventing concurrent modifications to workflow instances. This distributed locking mechanism ensures data consistency throughout the execution cycle. Lock acquisition failures, whether due to existing locks or system issues, trigger appropriate error events and execution termination. The lock persists through the entire execution, protecting all state transitions and modifications until a robust cleanup process ensures proper release.

State Management forms the foundation of workflow processing. After securing execution locks, the orchestrator retrieves the current workflow state, including execution status, values, and machine snapshots. The system performs comprehensive validation to ensure state consistency and compatibility with incoming events and machine versions. New instances undergo initialization with strict validation protocols, while existing workflows receive careful compatibility checks. State persistence occurs atomically after successful processing, with thorough validation ensuring data integrity throughout the workflow lifecycle.

Event Processing follows a rigorous pipeline of validation and transformation. Each incoming event undergoes multiple validation stages to verify subject format, contract compliance, and business rules. The Machine Registry handles sophisticated event routing based on version and type information, ensuring proper workflow targeting. Event transformation maintains data integrity while converting raw machine events into fully-formed Arvo events, preserving ordering guarantees crucial for distributed scenarios.

Here's an addition to the documentation explaining the error handling approach:

## Error Handling Philosophy: Transaction Errors vs System Error Events

The ArvoOrchestrator implements a carefully designed dual-layered error handling strategy that distinguishes between transaction errors and system error events. This separation reflects a fundamental principle in distributed systems: infrastructure failures should be handled differently from workflow-level errors.

Transaction errors, implemented through the `ArvoTransactionError` class, represent critical infrastructure failures that prevent the orchestrator from maintaining its core guarantees. These errors occur during fundamental operations like event subject invalidation, lock acquisition, state rading or state persistence, where the system cannot ensure data consistency or execution isolation. When a transaction error occurs, the orchestrator immediately halts execution and throws the error upward, allowing infrastructure-level error handling to take over. This immediate propagation is crucial because these errors indicate the system cannot safely continue operation without compromising data integrity or execution guarantees.

System error events, on the other hand, represent workflow-level failures that occur during normal business operations. These events manifest as special sys.{source}.error type events and handle scenarios like invalid event data, contract violations, or machine execution failures. Unlike transaction errors, system error events become part of the normal event flow, allowing workflows to implement sophisticated error handling and recovery mechanisms. This approach treats workflow failures as expected business scenarios rather than exceptional cases, enabling graceful degradation and maintaining system stability. The orchestrator automatically routes these error events back to the workflow initiator, ensuring proper notification while preserving the execution context.

The rationale behind this separation stems from the different requirements for handling infrastructure failures versus business logic errors. Infrastructure failures require immediate attention and often indicate system-wide issues that need operational intervention. Business logic errors, while important, should be handled within the workflow's context, allowing for retry mechanisms, compensation workflows, or alternative execution paths. This dual-layer approach enables the orchestrator to maintain robust error handling while providing flexibility for workflow-specific error recovery strategies, ultimately contributing to a more resilient and maintainable system.

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
  executionEngine: customEngine,
});
```

Custom memory implementations might provide specialized storage strategies or integration with existing infrastructure. Custom registries could implement sophisticated version management or specialized machine resolution logic. Custom execution engines might provide integration with different state machine frameworks or implement specialized execution patterns.

## Detailed Implementation Flow

For a comprehensive understanding of the ArvoOrchestrator's execution flow, sequence diagrams, and internal workings, please refer to our [detailed technical diagrams](https://github.com/SaadAhmad123/arvo-xstate/blob/main/src/ArvoOrchestrator/ExecutionDiagrams.md).
