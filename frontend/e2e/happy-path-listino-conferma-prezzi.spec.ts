import { test } from './fixtures';
import { expect } from '@playwright/test';

test.describe('Happy Path - Listino + Conferma Prezzi', () => {
  test('TEST 2 - happy_path_listino_conferma_prezzi', async ({
    page,
    loginAsTenantA,
    uploadCSV,
    uploadPDF,
    waitForDocumentStatus,
    createReconciliationJob,
    waitForJobStatus,
    getDiscrepancies,
  }) => {
    // Login con tenant A
    await loginAsTenantA();

    // Upload CSV listino
    await page.goto('/documents/upload');
    const pricelistDocId = await uploadCSV('./e2e/fixtures/sample-pricelist.csv');
    
    // Aspetta status "done"
    await waitForDocumentStatus(pricelistDocId, 'done');
    
    // Verifica che il documento sia processato
    const docResponse = await page.request.get(`/api/documents/${pricelistDocId}/`);
    const docData = await docResponse.json();
    expect(docData.status).toBe('done');
    expect(docData.extracted_data).toBeDefined();

    // Upload PDF conferma prezzi
    await page.goto('/documents/upload');
    const confirmDocId = await uploadPDF('./e2e/fixtures/sample-price-confirmation.pdf');
    
    // Aspetta status "done"
    await waitForDocumentStatus(confirmDocId, 'done');

    // Crea job di riconciliazione
    const jobId = await createReconciliationJob(pricelistDocId, confirmDocId);

    // Aspetta riconciliazione completata
    await waitForJobStatus(jobId, 'done');

    // Naviga alla pagina di revisione
    await page.goto(`/reconciliations/${jobId}`);

    // Verifica che scenario sia "listino+conferma_prezzi"
    const jobResponse = await page.request.get(`/api/reconciliations/jobs/${jobId}/`);
    const jobData = await jobResponse.json();
    expect(jobData.scenario).toBe('listino+conferma_prezzi');

    // Verifica che lo scenario sia visibile nella UI
    const scenarioBadge = page.locator('[data-testid="scenario-badge"]');
    await expect(scenarioBadge).toContainText('listino+conferma_prezzi');

    // Verifica che ci siano discrepanze
    const discrepancies = await getDiscrepancies(jobId);
    expect(discrepancies.length).toBeGreaterThan(0);

    // Verifica che scostamenti % siano visibili
    for (const discrepancy of discrepancies) {
      if (discrepancy.type === 'changed' && discrepancy.delta_percent !== undefined) {
        // Verifica che il delta percentuale sia visibile nella UI
        const deltaElement = page.locator(`[data-testid="discrepancy-${discrepancy.id}"] [data-testid="delta-percent"]`);
        await expect(deltaElement).toBeVisible();
        const deltaText = await deltaElement.textContent();
        expect(deltaText).toContain('%');
      }
    }

    // Screenshot finale
    await page.screenshot({ path: 'test-results/happy-path-listino-conferma-prezzi-final.png' });
  });
});
