## [1.0.0] - 2024-10-13

- The initial version of the state engine released

## [2.0.0] - 2024-11-28

- Added enterprise-grade versioniong for the machines

## [2.0.4] - 2024-11-30

- Refactored the execute function of the ArvoOrchestrator. It more maintainable long term now. Moreover, the event choreography between machines is not easier

## [2.2.0] - 2024-12-25

- Stable release of version 2 of Arvo

## [2.2.2] - 2025-01-06

- Added smart locking strategy so that the locking only happens when the machine implementation requires it otherwise the orchestrator skips locking of the resources. This is because it is observed that the machine's state and logic by itself maintains
  a very high degree of idempotency for sequential machines
## [2.2.5] - 2025-01-18

- Standardised the error boundaries as violations

## [2.2.10] - 2025-01-30

- Added explict error boundaries and heirarchies to the orchestrator

## [2.2.11] - 2025-03-10

- Added duplicate service and circular reference detection in the machine as guards in the setup

## [2.3.0] - 2025-06-22

#### Event Processing Domains - Major Feature Release

We've introduced event processing domains, a powerful routing system that enables sophisticated workflow patterns including human-in-the-loop operations, external system integrations, and custom processing pipelines.

**What's New**

Events can now be categorized into processing domains using the new `domains` parameter when emitting. Events without explicit domains automatically use the 'default' domain. Multi-domain events participate in multiple processing flows simultaneously - perfect for workflows that need both standard processing and external approval, or events that trigger analytics while routing to audit systems.

The orchestrator's `execute()` method returns enhanced data: `allEventDomains` lists all unique domains used, and `domainedEvents` contains domain-segregated event buckets. The familiar `events` array remains for backward compatibility.

**Breaking Change**

All event handlers now return an object instead of an array:

**Standard Event Handlers:**
- Before: `const events = await handler.execute(event)`
- After: `const { events } = await handler.execute(event)`

**Orchestrators:**
- Before: `const events = await orchestrator.execute(event)`
- After: `const { events, allEventDomains, domainedEvents } = await orchestrator.execute(event)`

**Using Domains**

Add `domains: ['external']` to emit calls for external processing. Access domain-specific events via `result.domainedEvents[domainName]` or all events via `result.domainedEvents.all`. Existing code works unchanged once you update the destructuring pattern.

