# ADR 004: Celery Task Queue for Async Processing

## Status
Accepted

## Context
Il sistema richiede elaborazione asincrona per:
- Processing documenti (PDF/CSV)
- Riconciliazione automatica
- Operazioni lunghe (LLM calls)

## Decision
Abbiamo scelto **Celery + Redis** per task queue asincrona.

### Architettura
```
Django → Redis Queue → Celery Worker → FastAPI AI
                      ↓
                 Celery Beat (scheduled)
```

### Task Principali
1. `process_document`: Processing singolo documento
2. `reconcile_documents`: Riconciliazione coppia documenti
3. `detect_scenario`: Detection scenario con LLM
4. `batch_process_documents`: Processing batch

### Configurazione
```python
CELERY_BROKER_URL = 'redis://redis:6379/0'
CELERY_RESULT_BACKEND = 'redis://redis:6379/0'
CELERY_TASK_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
```

## Consequences
### Positive
- Scalabile (n workers)
- Retry automatico con exponential backoff
- Monitoring con Flower (opzionale)
- Supporta scheduled tasks (beat)
- Standard Python, ben testato

### Negative
- Richiede Redis (infra aggiuntiva)
- Complessità deployment
- Debugging task più difficile
- Memory leak potenziale in worker long-running

## Alternatives Considerate
1. **Django Background Tasks**: Libreria leggera
   - Pro: Semplice, niente Redis
   - Contro: Non scalabile, no monitoring, no distributed
   
2. **RQ (Redis Queue)**: Più semplice di Celery
   - Pro: Semplice, leggero
   - Contro: Meno features, no beat, meno mature
   
3. **AWS SQS**: Queue service cloud
   - Pro: Managed, scalabile
   - Contro: Vendor lock-in, costi, complesso

## References
- Challenge requirement: "Task queue async: Celery + Redis"
- Celery documentation
