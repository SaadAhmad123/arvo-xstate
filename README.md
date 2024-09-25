# Arvo

## What is Arvo

Arvo is an opinionated approach to building event-driven systems. It's designed as a pattern and methodology rather than a rigid framework.

## Principal

The core principle of Arvo is to provide a solid foundation with enough flexibility for customization, allowing you to impose your own technical posture, including security measures, event brokerage, and telemetry. While Arvo offers a structured approach, it encourages developers to implement their own solutions if they believe they can improve upon or diverge from Arvo's principles.

If you're looking to focus on results without getting bogged down in the nitty-gritty of event creation, handling, system state management, and telemetry, while also avoiding vendor lock-in, Arvo provides an excellent starting point. I believe, it strikes a balance between opinionated design and customization, making it an ideal choice for developers who want a head start in building event-driven systems without sacrificing flexibility.

Key features of Arvo include:

- Lightweight and unopinionated core
- Extensible architecture
- Cloud-agnostic design
- Built-in primitives for event-driven patterns
- Easy integration with existing systems and tools

Whether you're building a small microservice or a large-scale distributed system, my hope with Arvo is to offers you some of the tools and patterns to help you succeed in the world of event-driven architecture.

# Arvo - XState: Arvo's Event-Driven System Orchestration

Arvo's event-driven system requires an orchestration mechanism capable of emitting events based on predefined rules. Arvo utilizes a state machine approach, where orchestration is defined in the form of a state chart. This state chart is then interpreted by a state machine engine to calculate the next events to emit and the resulting system state.

## Core Concept

The fundamental idea behind this orchestration is to enable the development of a simple functional model. For demonstration purposes, consider the following conceptual code:

```typescript
const {newSystemState, eventsToEmit} = stateMachineEngine(stateChart, currentSystemState, event)
```

To achieve this, the engine must execute events synchronously and provide the new system state along with events that need to be emitted.

## XState Integration

Arvo leverages XState as its state machine engine for several reasons:

- **Established Ecosystem**: XState is a well-established state machine engine in the JavaScript/TypeScript ecosystem.
- **SCXML Compatibility**: It's compatible with the SCXML open standard, aligning with Arvo's commitment to leveraging open standards for widespread integration.
- **Existing Technology**: By using XState, Arvo doesn't need to recreate complex technology. Instead, it can fully utilize XState's engine, documentation, and ecosystem.
- **Cross-domain Understanding**: XState can be understood by both backend and frontend engineers, allowing for similar systems to be deployed across different environments.

## Core Components

This package provides functions and classes to leverage xstate as state machine engine in the Arvo Event Driven system. The following are the main components:

- [ArvoXState](src/ArvoXState/README.md) exposes XState class with static functions, mimicking XState's API as much as possible. 

## Installation

You can install the core package via `npm` or `yarn`

```bash
npm install arvo-xstate
```

```bash
yarn add arvo-xstate
```

## License

This package is available under the MIT License. For more details, refer to the [LICENSE.md](LICENSE.md) file in the project repository.

## Change Logs

For a detailed list of changes and updates, please refer to the [document](CHANGELOG.md) file.

### SonarCloud Metrics
