# AI Engineering Documentation

## Prompt Eval Table

Tabella di confronto tra diversi prompt per l'estrazione strutturata da documenti.

| Prompt Version | Accuracy | Cost ($/doc) | Latency (ms) | Success Rate | Hallucination Rate | Notes |
|---------------|----------|--------------|--------------|--------------|-------------------|-------|
| **v1 - Basic** | 75% | 0.015 | 2500 | 85% | 10% | Prompt semplice, istruzioni generiche. Buono per documenti standard. |
| **v2 - Structured** | 85% | 0.020 | 3000 | 92% | 5% | Prompt strutturato con JSON schema esplicito. Migliore accuratezza. |
| **v3 - Enhanced** | 92% | 0.025 | 3500 | 95% | 2% | Prompt con istruzioni specifiche per codici prodotto, dati bancari, metadata. **PRODUZIONE** |

### Prompt v1 (Basic)
Prompt generico con istruzioni minime. Estrae solo campi base (codice, descrizione, quantità, prezzo, totale).

### Prompt v2 (Structured)
Prompt con schema JSON esplicito. Include istruzioni per formato tabellare e campi aggiuntivi (delivery_week, IBAN).

### Prompt v3 (Enhanced) - IN PRODUZIONE
Prompt con:
- Istruzioni specifiche per estrazione precisa codici prodotto
- Ricerca dati bancari (IBAN, ABI, CAB, Banca)
- Estrazione metadata aggiuntivi (porto, trasporto, pagamento, scadenza)
- Istruzioni per classificazione documento (ordine, conferma, listino)
- Gestione formati sconto complessi (50%+5%)

## Fallback Strategy

### 1. Retry con Temperature 0
Se il primo tentativo fallisce o produce JSON malformato:
- Retry con `temperature=0` per ridurre variabilità
- Max 3 retry

### 2. Retry su Modello Più Potente
Se retry con temperature 0 fallisce:
- Switch da GPT-4o-mini a GPT-4o (o Claude 3.5 Sonnet)
- Costo più alto ma maggiore affidabilità

### 3. Degradation a Parziale
Se tutti i retry falliscono:
- Restituisci estrazione parziale (solo campi estratti con successo)
- Contrassegna campi mancanti come `null`
- Logga errore per analisi

### 4. Escalation Umana
Se confidence < 0.7:
- Invia a revisione manuale
- Flagga documento come "requires_manual_review"
- Notifica operatore via UI

### Implementazione
```python
async def extract_with_fallback(document):
    # Try with default model
    try:
        result = await extract_with_model(document, model='gpt-4o-mini', temperature=0.3)
        if result.confidence >= 0.8:
            return result
    except JSONParseError:
        pass
    
    # Retry with temperature 0
    try:
        result = await extract_with_model(document, model='gpt-4o-mini', temperature=0.0)
        if result.confidence >= 0.7:
            return result
    except JSONParseError:
        pass
    
    # Switch to powerful model
    try:
        result = await extract_with_model(document, model='gpt-4o', temperature=0.0)
        return result
    except Exception as e:
        # Degradation to partial
        return partial_extraction(document, error=str(e))
```

## Cost Handling

### Caching su Hash
- Calcola hash SHA256 del contenuto documento
- Cache risultati estrazione per 24 ore
- Riduce costi per documenti duplicati

```python
import hashlib

def get_document_hash(file_path):
    with open(file_path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()
```

### Tier di Modelli
| Tier | Modello | Costo ($/1K tokens) | Uso |
|------|---------|-------------------|-----|
| **Tier 1 (Cheap)** | GPT-4o-mini | $0.00015 / $0.00060 | Default per documenti standard |
| **Tier 2 (Medium)** | GPT-4o | $0.005 / $0.015 | Documenti complessi, retry |
| **Tier 3 (Premium)** | Claude 3.5 Sonnet | $0.003 / $0.015 | Low-confidence, escalation |

### Stima Costo per Documento
- **PDF medio (1 pagina)**: ~2000 tokens input, ~500 tokens output
  - GPT-4o-mini: $0.0006 (input) + $0.0003 (output) = **$0.0009**
  - GPT-4o: $0.01 (input) + $0.0075 (output) = **$0.0175**
- **CSV medio (100 righe)**: ~3000 tokens input, ~800 tokens output
  - GPT-4o-mini: $0.0009 + $0.00048 = **$0.00138**
  - GPT-4o: $0.015 + $0.012 = **$0.027**

### Dashboard Costi
Mostrare in dashboard:
- Costo stimato per documento
- Costo totale per tenant (mese)
- Costo medio per tipo documento
- Alert se costo > threshold

## Confidence Approach

### Calcolo Confidence Score

1. **Model Confidence** (0-1): Fornito dal LLM
2. **JSON Validation** (0-1): Schema validation pass/fail
3. **Field Completeness** (0-1): % campi obbligatori estratti
4. **Data Consistency** (0-1): Validazione logica (qty > 0, price > 0)

```python
def calculate_overall_confidence(extracted_data):
    weights = {
        'model_confidence': 0.4,
        'json_validation': 0.3,
        'field_completeness': 0.2,
        'data_consistency': 0.1
    }
    
    model_conf = extracted_data.get('overall_confidence', 0.5)
    json_valid = 1.0 if validate_json(extracted_data) else 0.0
    field_comp = calculate_field_completeness(extracted_data)
    data_cons = validate_data_consistency(extracted_data)
    
    overall = (
        weights['model_confidence'] * model_conf +
        weights['json_validation'] * json_valid +
        weights['field_completeness'] * field_comp +
        weights['data_consistency'] * data_cons
    )
    
    return overall
```

### Soglie di Azione
| Confidence | Azione |
|------------|--------|
| **≥ 0.9** | Auto-approva, nessuna azione |
| **0.7 - 0.9** | Accetta con revisione rapida |
| **0.5 - 0.7** | Revisione manuale richiesta |
| **< 0.5** | Escalation a modello premium o umano |

### Validation Rules Post-Extraction
- Quantità > 0
- Prezzo unitario > 0
- Totale = quantità × prezzo unitario (±5% tolleranza)
- Codice prodotto non vuoto
- Data documento in formato ISO valido

## Monitoring e Alerting

### Metriche da Tracciare
- Extraction success rate
- Average confidence score
- Cost per document
- Latency per document
- Hallucination rate

### Alert
- Success rate < 90%
- Average confidence < 0.7
- Cost per day > $10
- Latency > 10s

## Continuous Improvement

### A/B Testing
- Test nuovi prompt su subset di documenti
- Confronta accuracy vs costo
- Deploy winner se improvement > 5%

### Feedback Loop
- Operator corrections raccolti
- Usati per fine-tuning prompt
- Aggiornamento prompt mensile
