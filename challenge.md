# WeWill Challenge tecnica

## Obiettivo

Costruisci un sistema multi-tenant nativo che:

1. Ingerisce un primo documento (PDF o CSV/Excel) da dashboard o webhook.
2. Ingerisce un secondo documento correlato (PDF o CSV/Excel) da dashboard o webhook.
3. Capisce da solo la relazione fra i due e li riconcilia.
4. Espone le discrepanze in una UI di revisione dove un operatore approva, corregge campo per campo o rifiuta.
5. Espone tutto via API + dashboard, isolato per tenant.

PDF e CSV/Excel devono essere supportati a entrambi gli step in modo intercambiabile: pdf-pdf, pdf-csv, csv-pdf, csv-csv. Il canale di ingestion (dashboard upload vs webhook) deve essere indipendente dal formato del file.

I due scenari di matching da coprire:

- **Ordine + Conferma**: il sistema verifica corrispondenza qty, prezzo, righe, sconti, codici articolo
- **Listino + Conferma prezzi del fornitore**: il sistema verifica corrispondenza prezzi articolo-per-articolo, segnala scostamenti rispetto al listino di riferimento

Il sistema deve capire da solo a quale scenario sta lavorando in base al contenuto dei documenti.

## Stack obbligatorio

| Layer | Tecnologia |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Backend principale | Django 5 (API + Admin + Auth) |
| Microservizio AI | FastAPI |
| Database | PostgreSQL |
| Task queue async | Celery + Redis |
| Real-time updates | Server-Sent Events (django-eventstream + Daphne ASGI) o polling |
| Auth | JWT (es. djangorestframework-simplejwt) con access + refresh + rotation |
| Containerization | Docker + Docker Compose |

OCR + LLM: libera scelta (Tesseract, Google Document AI, OpenAI Vision, Claude Vision, Gemini, ibridi). API key te le passo via canale sicuro.

Deploy: locale via docker compose, opzionalmente pubblico su VPS rimborsata.

## Cosa deve fare il sistema

### 1. Multi-tenant nativo + auth

Ogni utente appartiene a un tenant, dati isolati per tenant. Architettura libera (middleware request, queryset manager, schema-per-tenant Postgres, Row-Level Security) ma deve essere nativa, non bolt-on.

Login JWT con access + refresh + rotation. Frontend Next.js gestisce i token in modo sicuro. Test E2E che verifica che un utente del tenant A non possa vedere dati del tenant B.

### 2. Ingestion documenti (PDF + CSV/Excel, dashboard + webhook)

Sia il primo che il secondo documento possono arrivare:
- in formato PDF o CSV/Excel
- via upload da dashboard o via webhook (Twilio WhatsApp Sandbox, mock locale endpoint POST, email gateway)

Celery accoda task async. FastAPI:
- per PDF: OCR + LLM extraction strutturata
- per CSV/Excel: parser tabular + LLM extraction strutturata
- classifica la tipologia del documento dinamicamente (ordine, conferma, listino, conferma_prezzi), niente enum hardcoded
- detect del formato file (estensione + magic bytes), routing alla pipeline giusta

Django persiste, UI mostra status in tempo reale.

Il parser CSV/Excel deve gestire: header non in prima riga, multi-sheet Excel, righe di riepilogo a meta tabella, formati numerici europei (1.234,56) e americani (1,234.56), nomi colonna in piu' lingue (IT / EN).

### 3. Riconciliazione automatica

Il sistema collega il documento 2 al documento 1 e confronta. Logica di matching libera (numero riferimento, fornitore, fuzzy match, embedding, semantica LLM, ibrido).

Distingui fra:

- dato mancante (riga assente da una parte)
- dato cambiato (quantita, prezzo, data diversi)
- dato equivalente con rappresentazione diversa (stesso articolo con codice o descrizione diversa, sconto a riga vs sconto a totale)

Per scenario **ordine + conferma**: riconosci qty diverse, prezzi cambiati, righe mancanti, righe aggiunte, codici diversi stessa descrizione e viceversa, date diverse, totali che non combaciano, sconti a riga vs a totale, righe riordinate.

Per scenario **listino + conferma prezzi**: riconosci scostamenti prezzo per articolo (in valore assoluto e percentuale), articoli del listino non confermati, articoli confermati non a listino, validita temporale.

### 4. UI di revisione

Operatore vede documento 1 + documento 2 + lista discrepanze classificate. Per ogni discrepanza puo' approvare, correggere campo per campo, rifiutare. Stato finale persistito + audit log delle azioni.

### 5. AI engineering

- Structured extraction con JSON schema-conformant (function calling, response_format json_schema, tool use). Retry su parse error.
- Prompt eval su almeno 3 prompt diversi per il task di extraction. Tabella di confronto: accuracy, cost, latency. Scegli quale tieni in produzione.
- Fallback strategy quando l'LLM allucina, sbaglia tipo, ritorna JSON malformato (retry temperature 0, retry su modello piu' potente, degradation a parziale, escalation umana).
- Cost handling: caching su immagini o testi identici (hash), tier di modelli (cheap default, potente solo su low-confidence), stime di costo per documento. Mostrale in dashboard.
- Confidence: come decidi estrazione affidabile vs manda all'operatore (soglia, score modello, ensemble, validation rules post-extraction).

### 6. Test E2E

Playwright (o Cypress) copre i flussi critici. Minimo 4-5 scenari:

- happy path scenario ordine + conferma (login, upload PDF/CSV, trigger ingestion 2nd doc, riconciliazione, approvazione operatore)
- happy path scenario listino + conferma prezzi
- foto corrotta o non leggibile (OCR fallisce graziosamente)
- LLM ritorna JSON malformato (fallback funziona)
- cross-tenant leak (utente A non vede dati tenant B)

### 7. Deploy locale

`docker compose up -d` da repo pulito deve far girare tutto su localhost senza modifiche manuali. README dichiara prerequisiti (Docker, env file).

CI/CD opzionale: GitHub Actions con lint + test su PR, build immagini su merge a main, push su GHCR, deploy automatico su VPS.

## Dati di test

In allegato `dataset-test.zip`:
- CSV/Excel e PDF di ordini in formati diversi (IT, EN, header non in prima riga, multi-sheet)
- PDF di conferme ordine
- CSV e PDF di listini fornitore
- PDF di conferme prezzi
- `manifest.json` con la ground truth dei collegamenti cross-doc (uso offline per validare il tuo matching, non in produzione)

## Deliverable

1. Repo GitHub privato con invite a `emiliotracanella@gmail.com`.
2. README master con:
   - Diagramma architettura (Mermaid o equivalente).
   - Steps deploy from scratch.
   - ADR brevi sulle scelte architetturali principali.
3. Documentazione AI engineering come markdown nel repo (prompt eval table, fallback strategy, cost analysis, confidence approach).
