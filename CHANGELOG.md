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

