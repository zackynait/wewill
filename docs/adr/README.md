# Architecture Decision Records (ADRs)

Questo directory contiene gli Architecture Decision Records (ADRs) del progetto WeWill.

## ADRs

| ID | Titolo | Status | Data |
|----|--------|--------|------|
| [001](001-multi-tenant-isolation.md) | Multi-Tenant Isolation Strategy | Accepted | 2024-01-19 |
| [002](002-jwt-authentication.md) | JWT Authentication with Refresh Tokens | Accepted | 2024-01-19 |
| [003](003-ai-microservice.md) | AI Microservice Architecture | Accepted | 2024-01-19 |
| [004](004-celery-task-queue.md) | Celery Task Queue for Async Processing | Accepted | 2024-01-19 |
| [005](005-pdf-extraction-hybrid.md) | PDF Extraction Hybrid Approach | Accepted | 2024-01-19 |
| [006](006-postgresql-redis.md) | PostgreSQL + Redis Stack | Accepted | 2024-01-19 |

## Template

```markdown
# ADR XXX: [Titolo]

## Status
[Proposed/Accepted/Deprecated/Superseded]

## Context
[Descrizione del contesto e problema]

## Decision
[Descrizione della decisione presa]

## Consequences
### Positive
- [Conseguenze positive]

### Negative
- [Conseguenze negative]

## Alternatives Considerate
1. [Alternativa 1]
   - Pro: [Vantaggi]
   - Contro: [Svantaggi]

2. [Alternativa 2]
   - Pro: [Vantaggi]
   - Contro: [Svantaggi]

## References
- [Riferimenti a requisiti, documenti, ecc.]
```

## Convenzioni

- **Status**: Proposed, Accepted, Deprecated, Superseded
- **ID**: Numerico sequenziale con leading zeros (001, 002, ...)
- **Linguaggio**: Italiano (come il resto del progetto)
- **Formato**: Markdown
