# ADR 006: PostgreSQL + Redis Stack

## Status
Accepted

## Context
Il sistema richiede:
- Database relazionale per dati strutturati
- Cache per performance
- Message broker per task queue

## Decision
Abbiamo scelto **PostgreSQL 16 + Redis 7**.

### PostgreSQL
- Database relazionale principale
- Dati: tenants, users, documents, reconciliations, discrepancies, audit_logs
- Row-Level Security per defense-in-depth
- JSON support per extracted_data

### Redis
- Cache per performance (SSE events, session data)
- Message broker per Celery
- Result backend per Celery
- Rate limiting (futuro)

## Consequences
### Positive
- PostgreSQL: ACID, mature, JSON support, RLS
- Redis: Velocissimo, in-memory, multi-purpose
- Stack standard, ben documentato
- Buona performance

### Negative
- 2 infra da gestire
- Redis richiede persistenza configurata
- PostgreSQL single point of failure (no HA in setup base)

## Alternatives Considerate

### Database
1. **MySQL/MariaDB**
   - Pro: Simile a PostgreSQL
   - Contro: Meno features avanzate, no RLS nativo
   
2. **MongoDB**
   - Pro: Schema-less, scalabile
   - Contro: No ACID, no relazioni, non per questo use case

### Cache/Broker
1. **Memcached**
   - Pro: Più veloce
   - Contro: Solo cache, no broker, no persistenza
   
2. **RabbitMQ**
   - Pro: Broker potente
   - Contro: Complesso, no cache, overhead

## References
- Challenge requirement: "Database: PostgreSQL", "Task queue: Celery + Redis"
- PostgreSQL 16 features
- Redis 7 features
