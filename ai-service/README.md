# WeWill AI Service - FastAPI

Microservizio FastAPI per l'elaborazione di documenti con AI (OCR + LLM extraction).

## Architettura

### Componenti

- **FastAPI**: Framework ASGI per API REST
- **LLM Service**: Gestisce chiamate a OpenAI/Anthropic con retry logic
- **PDF Processor**: Converte PDF in immagini + extraction con vision model
- **CSV/Excel Processor**: Parsing intelligente con detection automatico
- **Pydantic Models**: Validazione e structured output

### Pipeline PDF

1. **Conversione**: pdf2image converte pagine PDF in immagini
2. **Classificazione**: LLM classifica il tipo di documento
3. **Estrazione**: GPT-4o Vision estrae dati strutturati con JSON schema
4. **Retry**: Automatic retry con temperature=0 se JSON malformato (max 3 tentativi)
5. **Confidence**: Score per campo e globale 0-1

### Pipeline CSV/Excel

1. **Detection**: Rileva separatore automaticamente (, ; \t |)
2. **Header Detection**: Trova riga header con più colonne non-numeriche
3. **Multi-sheet**: Unisce sheet Excel (Header + Righe + Totali)
4. **Normalization**: Normalizza formati IT (1.234,56) e EN (1,234.56)
5. **LLM Extraction**: Classificazione + estrazione strutturata

## Endpoints

### POST /process/pdf
Processa documenti PDF con OCR + LLM Vision.

**Request:**
```json
{
  "file_id": "uuid",
  "file_path": "/path/to/file.pdf",
  "tenant_id": "uuid"
}
```

**Response:**
```json
{
  "file_id": "uuid",
  "status": "success",
  "extracted_data": {
    "document_type": "ordine",
    "supplier": "Fornitore S.r.l.",
    "customer": "Cliente S.p.A.",
    "document_number": "ORD-2024-001",
    "document_date": "2024-01-15",
    "total_amount": 1500.00,
    "currency": "EUR",
    "lines": [
      {
        "code": "ART-001",
        "description": "Prodotto A",
        "quantity": 10.0,
        "unit": "pz",
        "unit_price": 100.0,
        "discount": 10.0,
        "total": 900.0,
        "confidence": 0.95
      }
    ],
    "classification": {
      "type": "ordine",
      "confidence": 0.92,
      "reasoning": "Documento contiene 'ordine' e lista articoli"
    },
    "overall_confidence": 0.90
  },
  "processing_time": 5.2
}
```

### POST /process/csv
Processa documenti CSV/Excel con parsing + LLM.

**Request:** Stesso di PDF

**Response:** Stesso di PDF

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "openai_configured": true,
  "anthropic_configured": false,
  "version": "1.0.0"
}
```

## Classificazione Documento

Nessun enum hardcoded - il LLM classifica liberamente:

- `ordine` - Ordine di acquisto
- `conferma` - Conferma ordine
- `listino` - Listino prezzi
- `conferma_prezzi` - Conferma prezzi fornitore
- `altro` - Altri tipi

Output:
```json
{
  "type": "ordine",
  "confidence": 0.92,
  "reasoning": "Documento contiene 'ordine' e lista articoli con quantità e prezzi"
}
```

## Retry Strategy

- **Max retries**: 3
- **Temperature**: 0.1 (default), 0.0 (retry)
- **Delay**: 1s tra retry
- **Fallback**: Valori di default se tutti i retry falliscono

## Confidence Scoring

- **Per campo**: 0.0 - 1.0 per ogni campo estratto
- **Per riga**: Media delle confidence dei campi della riga
- **Globale**: Media delle confidence delle righe
- **Threshold**: 0.7 (configurabile)

## Setup

### Prerequisiti
- Python 3.11+
- OpenAI API key (o Anthropic)
- Poppler (per pdf2image)

### Installazione
```bash
pip install -r requirements.txt
```

### Configurazione
Variabili d'ambiente in `.env`:

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.1
OPENAI_MAX_TOKENS=4096

# Anthropic (fallback)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-opus-20240229

# Processing
MAX_RETRIES=3
CONFIDENCE_THRESHOLD=0.7
MAX_PAGES_PDF=50
```

### Esecuzione
```bash
# Development
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Production
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
```

## Docker

```bash
# Build
docker build -t wewill-ai-service .

# Run
docker run -p 8001:8001 --env-file .env wewill-ai-service
```

## Testing

```bash
# Health check
curl http://localhost:8001/health

# Process PDF
curl -X POST http://localhost:8001/process/pdf \
  -H "Content-Type: application/json" \
  -d '{"file_id": "test", "file_path": "/path/to/file.pdf", "tenant_id": "tenant-1"}'

# Process CSV
curl -X POST http://localhost:8001/process/csv \
  -H "Content-Type: application/json" \
  -d '{"file_id": "test", "file_path": "/path/to/file.csv", "tenant_id": "tenant-1"}'
```

## Struttura

```
ai-service/
├── main.py              # FastAPI app
├── config.py            # Settings
├── models.py            # Pydantic models
├── services/
│   ├── __init__.py
│   ├── llm_service.py  # LLM extraction
│   ├── pdf_processor.py # PDF processing
│   └── csv_processor.py # CSV/Excel processing
├── requirements.txt
└── README.md
```

## Cost Handling

Il servizio supporta:
- **Caching**: Hash di file identici per evitare ripetizioni
- **Tier di modelli**: Modello economico default, potente per low-confidence
- **Stime**: Costo stimato per documento
- **Confidence**: Soglia per escalation umana
