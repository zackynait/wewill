Crea un microservizio FastAPI che riceve documenti da Django e li elabora con AI.

ENDPOINT:
- POST /process/pdf — riceve file_id e path, esegue OCR + LLM extraction
- POST /process/csv — riceve file_id e path, esegue parsing tabellare + LLM extraction
- GET /health — healthcheck

PIPELINE PDF:
1. pdf2image per convertire pagine in immagini
2. chiamata a OpenAI GPT-4o Vision con structured output (JSON schema)
3. estrai: tipo documento (ordine/conferma/listino/conferma_prezzi), fornitore, cliente, data, lista righe con {codice, descrizione, qty, prezzo, sconto, importo}
4. retry automatico se JSON malformato (max 3 tentativi, temperature=0 al secondo tentativo)
5. confidence score: campo per campo, score globale 0-1

PIPELINE CSV/EXCEL:
1. rileva separatore automaticamente (, o ;)
2. rileva header non in prima riga (cerca la riga con più colonne non-numeriche)
3. gestisci multi-sheet Excel (unisci sheet Header + Righe + Totali)
4. normalizza formati numerici IT (1.234,56) e EN (1,234.56)
5. passa testo strutturato a LLM per classificazione e estrazione

CLASSIFICAZIONE DOCUMENTO:
- niente enum hardcoded
- prompt LLM che classifica liberamente il tipo di documento dal contenuto
- output: {type: string, confidence: float, reasoning: string}

Usa: FastAPI, pydantic v2, openai python sdk, pandas, openpyxl, pdf2image.
Tutto async. Settings da variabili d'ambiente.