# E2E Tests with Playwright

This directory contains end-to-end tests for the WeWill application using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

3. Set environment variables:
```bash
BASE_URL=http://localhost:3000
```

## Test Fixtures

Before running tests, ensure you have the following test files in `e2e/fixtures/`:
- `sample-order.pdf` - Sample order document
- `sample-confirmation.pdf` - Sample confirmation document
- `sample-pricelist.csv` - Sample pricelist CSV
- `sample-price-confirmation.pdf` - Sample price confirmation document
- `corrupted.pdf` - Corrupted PDF for error handling

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode
```bash
npm run test:e2e:ui
```

### Run tests in debug mode
```bash
npm run test:e2e:debug
```

### View test report
```bash
npm run test:e2e:report
```

## Test Scenarios

### TEST 1 - happy_path_ordine_conferma
- Login con tenant A
- Upload PDF ordine
- Aspetta status "done" (polling ogni 2s, timeout 60s)
- Upload PDF conferma
- Aspetta riconciliazione completata
- Verifica che ci siano discrepanze nella lista
- Approva prima discrepanza
- Verifica audit log aggiornato

### TEST 2 - happy_path_listino_conferma_prezzi
- Stesso flusso con CSV listino + PDF conferma prezzi
- Verifica che scenario sia "listino+conferma_prezzi"
- Verifica che scostamenti % siano visibili

### TEST 3 - pdf_corrotto
- Upload file .pdf con contenuto random (non leggibile)
- Verifica che status diventi "error"
- Verifica che messaggio errore sia visibile in UI
- Verifica che sistema non crashi

### TEST 4 - llm_json_malformato
- Mocka la risposta OpenAI per ritornare JSON invalido
- Verifica che il retry funzioni (controlla log)
- Verifica che dopo 3 tentativi falliti lo status sia "error" con reason

### TEST 5 - cross_tenant_leak
- Login tenant A, crea job, salva job_id
- Logout
- Login tenant B
- GET /api/jobs/{job_id_di_A}
- Verifica risposta 404 (non 403, non 200)
- Verifica che lista jobs di B non contenga job di A

## Configuration

Playwright is configured in `playwright.config.ts`:
- Base URL from environment variable
- Screenshot on failure
- Video recording on failure
- HTML report generation
- Trace on retry

## CI/CD

In CI/CD, tests run with:
- 2 retries on failure
- 1 worker (parallel execution disabled)
- Automatic browser installation

## Troubleshooting

### Tests fail because services are not running
Ensure all services are running:
```bash
docker compose up -d
```

### Tests fail because of missing fixtures
Create the required test files in `e2e/fixtures/` directory.

### Tests timeout
Increase timeout in `playwright.config.ts` or individual test fixtures.
