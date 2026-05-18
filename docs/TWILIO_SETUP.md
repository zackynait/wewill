# Twilio WhatsApp Sandbox Setup

## Overview
Il sistema supporta l'ingestion di documenti via Twilio WhatsApp Sandbox. Questo permette di ricevere PDF, immagini e altri file direttamente via WhatsApp e triggerare automaticamente l'elaborazione.

## Twilio Sandbox (Gratuito per Testing)

### 1. Configurazione Twilio Console

1. Vai su [console.twilio.com](https://console.twilio.com)
2. Crea un account gratuito (se non ne hai uno)
3. Vai su Messaging → Try it out → Send a WhatsApp message
4. Segui le istruzioni per joinare il sandbox:
   - Invia "join <codice-sandbox>" al numero WhatsApp fornito
   - Riceverai una conferma di join

### 2. Configurazione Webhook

1. In Twilio Console, vai al sandbox settings
2. Imposta il webhook URL:
   ```
   http://tuo-dominio.com/api/webhooks/twilio/whatsapp/
   ```
   Per testing locale, usa ngrok:
   ```bash
   ngrok http 8000
   ```
   E usa l'URL ngrok nel webhook.

3. Salva le configurazioni.

### 3. Testare il Webhook

**Via cURL (Mock Webhook):**
```bash
curl -X POST http://localhost:8000/api/webhooks/mock/ \
  -F "file=@/path/to/document.pdf" \
  -F "source=test"
```

**Via WhatsApp (Sandbox):**
1. Invia un documento PDF al numero sandbox
2. Il sistema riceverà il documento e triggererà l'elaborazione
3. Riceverai una risposta automatica: "Ricevuto 1 documento/i. Elaborazione in corso..."

## Endpoint Webhook

### Twilio WhatsApp Webhook
- **URL**: `/api/webhooks/twilio/whatsapp/`
- **Method**: POST
- **Headers**: `Content-Type: application/x-www-form-urlencoded`
- **Auth**: None (Twilio invia request con signature, da validare in produzione)

### Mock Webhook (Testing Locale)
- **URL**: `/api/webhooks/mock/`
- **Method**: POST
- **Content-Type**: multipart/form-data
- **Parameters**:
  - `file`: Il documento da processare
  - `source`: (opzionale) Nome della sorgente

## Formati Supportati

- PDF (application/pdf)
- CSV (text/csv)
- Excel (application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
- Immagini (image/jpeg, image/png)

## Flusso di Elaborazione

1. **Ricezione**: Webhook riceve documento
2. **Creazione Record**: Sistema crea Document record con:
   - `source`: 'whatsapp' o 'mock'
   - `source_metadata`: numero telefono, messaggio, etc.
3. **Trigger Celery**: Task asincrono avviato per processing
4. **AI Extraction**: FastAPI estrae dati strutturati
5. **Riconciliazione**: Se documento correlato presente, triggera riconciliazione

## Costi Twilio

- **Sandbox**: GRATUITO per testing
- **Produzione**: Costi basati su messaggi inviati/ricevuti
  - WhatsApp: ~$0.005 per messaggio (varia per paese)
  - Per la challenge, il sandbox è sufficiente

## Note di Sicurezza

In produzione, validare la firma della richiesta Twilio per prevenire richieste spoofed:

```python
from twilio.request_validator import RequestValidator

validator = RequestValidator('TWILIO_AUTH_TOKEN')
url = request.build_absolute_uri()
params = request.POST.dict()
signature = request.META.get('HTTP_X_TWILIO_SIGNATURE')

if not validator.validate(url, params, signature):
    return HttpResponse('Invalid signature', status=403)
```

## Troubleshooting

**Webhook non riceve richieste:**
- Verifica che l'URL sia pubblico (usa ngrok per testing locale)
- Controlla i log Django: `docker compose logs django`

**Documento non processato:**
- Verifica log Celery: `docker compose logs celery-worker`
- Controlla log FastAPI: `docker compose logs fastapi`

**Errore 403:**
- Verifica firma Twilio (se abilitata in produzione)
- Controlla CORS settings in Django
