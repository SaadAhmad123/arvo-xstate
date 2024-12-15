# Execution Diagrams for ArvoMachine

## `validateInput` method

This method checks if an incoming event is valid by ensuring it matches either the machine's own contract (init event) or one of its service contracts (emitted events). It first tries to find a matching contract, then checks if the event's dataschema and version information are correct, and finally validates the event's data structure. If anything goes wrong, it tells you what the problem was - otherwise it confirms the event is good to go.

```mermaid
stateDiagram-v2
    [*] --> ContractResolution

    ContractResolution --> CheckContractType
    CheckContractType --> SelfContract: event type matches self
    CheckContractType --> ServiceContract: event type doesn't match self

    ServiceContract --> BuildContractMap: Map service contracts to event types
    BuildContractMap --> ContractFound

    SelfContract --> ContractFound

    ContractFound --> NoContract: contract not found
    ContractFound --> ValidateDataSchema: contract found

    NoContract --> [*]: return CONTRACT_UNRESOLVED

    ValidateDataSchema --> SchemaPresent: dataschema exists
    ValidateDataSchema --> SchemaAbsent: no dataschema

    SchemaPresent --> URICheck
    URICheck --> VersionCheck: URI matches
    URICheck --> Invalid: URI mismatch

    VersionCheck --> SchemaValidation: version matches
    VersionCheck --> Invalid: version mismatch

    SchemaAbsent --> SchemaValidation

    SchemaValidation --> SelectSchema
    SelectSchema --> SelfSchema: self contract
    SelectSchema --> ServiceSchema: service contract

    SelfSchema --> ValidateData
    ServiceSchema --> ValidateData

    ValidateData --> Valid: validation passes
    ValidateData --> Invalid: validation fails

    Valid --> [*]: return VALID
    Invalid --> [*]: return INVALID with error
```
