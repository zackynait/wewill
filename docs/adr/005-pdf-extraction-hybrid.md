# ADR 005: PDF Extraction Hybrid Approach

## Status
Accepted

## Context
Il sistema deve processare PDF con:
- Costi minimi (LLM API è costoso)
- Copertura PDF scansionati e testo estratto
- Performance accettabili

## Decision
Abbiamo scelto **approccio ibrido**: pdfplumber → text-only LLM, fallback OCR + Vision.

### Strategy
1. **Prima pdfplumber**: Estrae testo localmente (gratis)
2. **Valutazione qualità**: 
   - Minimo 500 caratteri
   - Pattern matching per contenuto significativo
3. **Se sufficiente**: LLM text-only (~$0.0006/doc)
4. **Se insufficiente**: OCR + Vision API (~$0.009/doc)

### Implementation
```python
async def process_pdf(file_path):
    text = await extract_with_pdfplumber(file_path)
    
    if is_text_sufficient(text):
        return await llm.extract_from_text(text)
    else:
        return await llm.extract_from_image(pdf_to_image(file_path))
```

## Consequences
### Positive
- **Risparmio ~90%** per PDF ben formati
- Copre tutti i casi (testo + scansionati)
- Fallback automatico
- Veloce per PDF con testo

### Negative
- pdfplumber potrebbe fallire su layout complessi
- Doppia logica da mantenere
- Threshold tuning richiesto

## Cost Analysis
| Tipo | Costo (GPT-4o-mini) |
|------|-------------------|
| PDF testo estratto | $0.0006 |
| PDF scansionato | $0.009 |
| **Risparmio** | **~90%** |

## Alternatives Considerate
1. **Solo Vision API**: Sempre OCR + vision
   - Pro: Copre tutto, semplice
   - Contro: Molto costoso ($0.009/doc), lento
   
2. **Solo pdfplumber**: Mai OCR
   - Pro: Gratis, veloce
   - Contro: Non copre PDF scansionati
   
3. **Tesseract OCR**: OCR locale invece di vision API
   - Pro: Gratis
   - Contro: Bassa accuratezza, setup complesso

## References
- docs/ai-engineering.md (Cost Handling section)
- pdfplumber documentation
