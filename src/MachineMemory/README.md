---
title: Machine Memory
group: Components
---

# Machine Memory

The Machine Memory component provides state persistence and concurrency control for the Arvo orchestration system. It defines a standard interface for state operations and includes a simple in-memory implementation for development and testing scenarios.

## Interface

The `IMachineMemory` interface defines core operations for state management:

```typescript
interface IMachineMemory<T extends Record<string, any>> {
  read(id: string): Promise<T | null>;
  write(id: string, data: T): Promise<void>;
  lock(id: string): Promise<boolean>;
  unlock(id: string): Promise<boolean>;
}
```

## Simple Implementation

The `SimpleMachineMemory` class provides an in-memory implementation suitable for:
- Container applications
- Request-scoped workflows
- Testing environments
- Development and demos

```typescript
const memory = new SimpleMachineMemory();
const orchestrator = createArvoOrchestrator({
  memory,
  executionunits: 0.1,
  machines: [workflow]
});
```

### Usage Constraints

The simple implementation has specific limitations:
- Not suitable for multi-instance deployments
- No persistence across restarts
- Limited to single-node operations
- Not recommended for production distributed systems

## Custom Implementation Scenarios

Create custom implementations for specific needs:

```typescript
class RedisMachineMemory implements IMachineMemory<MachineMemoryRecord> {
  constructor(private redis: Redis) {}

  async read(id: string): Promise<MachineMemoryRecord | null> {
    const data = await this.redis.get(id);
    return data ? JSON.parse(data) : null;
  }

  // Additional implementation...
}
```

## Best Practices

1. State Management
   - Implement proper error handling
   - Validate inputs thoroughly
   - Handle concurrent access safely

2. Lock Management
   - Implement timeouts for locks
   - Handle deadlock scenarios
   - Clean up stale locks

3. Performance Considerations
   - Optimize for read operations
   - Implement appropriate caching
   - Monitor memory usage
  
4. OpenTelemetry
   - Integrate open telemetry for better observability
   - Use `ArvoOpenTelemetry` from `arvo-core` to get the instance. 

For production deployments, consider implementing persistent storage solutions with proper distributed locking mechanisms.