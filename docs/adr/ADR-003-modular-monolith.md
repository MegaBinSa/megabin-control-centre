# ADR-003: Modular Monolith Architecture

**Status:** Accepted

## Context

MegaBin needs strict domain ownership and future extensibility without the operational cost of distributed services.

## Decision

Build one modular application/domain system with explicit internal module boundaries, controlled dependency direction, and domain-owned writes. Keep modules independently understandable and potentially extractable, but deploy them together initially.

## Consequences

- Cross-module writes use owning application services or versioned events.
- Import/lint rules should prevent unauthorized coupling.
- Shared database access does not permit arbitrary cross-module updates.

## Rejected alternatives

- Microservices: premature deployment, consistency, and observability complexity.
- An unstructured monolith: makes ownership and future extension unsafe.

