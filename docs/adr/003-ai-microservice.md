# ADR 003: AI Microservice Architecture

## Status
Accepted

## Context
Il sistema richiede elaborazione AI (OCR + LLM) per documenti. Considerazioni:
- CPU/GPU intensive operations
- Potenzialmente costoso (API calls)
- Scalabilità indipendente dal backend
- Possibilità di upgrade AI senza toccare backend

## Decision
Abbiamo scelto **microservizio FastAPI separato** per AI processing.

### Architettura
```
Django → Celery → FastAPI AI → OpenAI/Anthropic
```

### Responsabilità
- **Django**: Business logic, database, auth
- **FastAPI**: AI processing, OCR, LLM calls
- **Comunicazione**: HTTP REST (JSON)

### Estrazione PDF Ibrida
1. pdfplumber (gratis, locale) → text-only LLM
2. Fallback OCR + Vision API (costoso)

## Consequences
### Positive
- Scalabilità indipendente (AI può scale up)
- Isolamento failure (AI down non crasha backend)
- Facile upgrade/switch AI provider
- Cost tracking separato
- Possibilità di multi-modello

### Negative
- Complessità aggiuntiva (2 servizi)
- Latenza network tra servizi
- Debugging più complesso
- Deployment più complesso

## Alternatives Considerate
1. **Monolitico**: AI dentro Django
   - Pro: Semplice, niente network
   - Contro: Coupling tight, scaling difficile
   
2. **AWS Lambda/Cloud Functions**: Serverless
   - Pro: Pay-per-use, zero infra
   - Contro: Cold start, vendor lock-in, costi imprevedibili
   
3. **Background task solo**: Celery senza microservizio
   - Pro: Semplice
   - Contro: No isolation, coupling tight

## References
- Challenge requirement: "Microservizio AI: FastAPI"
- Microservices patterns (Martin Fowler)
