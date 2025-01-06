---
title: Machine Registry
group: Components
---

# Machine Registry

The Machine Registry is a core component of the Arvo orchestration system that manages state machine definitions throughout their lifecycle. It functions as a central repository for storing machine definitions and resolving the appropriate machine instance for incoming events.

## Overview

The Registry is a critical dependency of `ArvoOrchestrator`, enabling dynamic machine resolution during event processing. The behavior of the registry can be customized by implementing the `IMachineRegistry` interface and injecting it during orchestrator initialization.

## Core Interface

```typescript
interface IMachineRegistry {
  // Collection of registered machine instances
  machines: ArvoMachine[];

  // Resolves appropriate machine for given event
  resolve: (event: ArvoEvent, opentelemetry: Options) => ArvoMachine;
}
```

## Default Implementation

The system provides a default `MachineRegistry` class implementing the core interface:

```typescript
// Initialize with multiple machine versions
const registry = new MachineRegistry(
  machineV1,  // Initial version
  machineV2,  // Updated version
  machineV3   // Latest version
);

// Resolve machine for incoming event
const machine = registry.resolve(event, {
  inheritFrom: 'CONTEXT'  // OpenTelemetry context configuration
});
```

## Resolution Process

The registry's resolution mechanism:
1. Extracts orchestrator information from event subject
2. Matches version and source against registered definitions
3. Integrates with OpenTelemetry for monitoring
4. Returns appropriate machine instance or throws error

## Error Scenarios

The registry throws specific errors for common failure cases:

```typescript
// Initialization without machines
new MachineRegistry() 
// Error: Machine registry initialization failed: No machines provided

// Resolution with unknown version
registry.resolve(eventWithUnknownVersion)
// Error: Machine resolution failed: No machine found matching orchestrator
```

## Custom Implementation

You can create custom registry implementations for specific needs:

```typescript
class CustomRegistry implements IMachineRegistry {
  constructor(private machines: ArvoMachine[]) {}

  resolve(event: ArvoEvent, telemetry: Options): ArvoMachine {
    // Custom resolution logic
    return this.machines.find(/* custom matching */);
  }
}
```

## Best Practices

1. Version Management
   - Use semantic versioning for machines
   - Document version compatibility
   - Plan version transitions

2. Performance Optimization
   - Monitor resolution metrics
   - Optimize machine lookup
   - Cache frequently used machines

3. Error Handling
   - Implement comprehensive error checks
   - Provide detailed error messages
   - Log resolution failures

Through these capabilities, the Machine Registry ensures reliable and efficient machine management within the Arvo orchestration system.