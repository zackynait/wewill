import { test } from './fixtures';
import { expect } from '@playwright/test';

test.describe('Happy Path - Ordine + Conferma', () => {
  test('TEST 1 - happy_path_ordine_conferma', async ({
    page,
    loginAsTenantA,
    uploadPDF,
    waitForDocumentStatus,
    createReconciliationJob,
    waitForJobStatus,
    getDiscrepancies,
    approveDiscrepancy,
    getAuditLogs,
  }) => {
    // Login con tenant A
    await loginAsTenantA();

    // Upload PDF ordine
    await page.goto('/documents/upload');
    const orderDocId = await uploadPDF('./e2e/fixtures/sample-order.pdf');
    
    // Aspetta status "done"
    await waitForDocumentStatus(orderDocId, 'done');
    
    // Verifica che il documento sia processato
    const docResponse = await page.request.get(`/api/documents/${orderDocId}/`);
    const docData = await docResponse.json();
    expect(docData.status).toBe('done');
    expect(docData.extracted_data).toBeDefined();

    // Upload PDF conferma
    await page.goto('/documents/upload');
    const confirmDocId = await uploadPDF('./e2e/fixtures/sample-confirmation.pdf');
    
    // Aspetta status "done"
    await waitForDocumentStatus(confirmDocId, 'done');

    // Crea job di riconciliazione
    const jobId = await createReconciliationJob(orderDocId, confirmDocId);

    // Aspetta riconciliazione completata
    await waitForJobStatus(jobId, 'done');

    // Naviga alla pagina di revisione
    await page.goto(`/reconciliations/${jobId}`);

    // Verifica che ci siano discrepanze nella lista
    const discrepancies = await getDiscrepancies(jobId);
    expect(discrepancies.length).toBeGreaterThan(0);

    // Verifica che le discrepanze siano visibili nella UI
    const discrepancyElements = await page.locator('[data-testid="discrepancy-item"]').count();
    expect(discrepancyElements).toBe(discrepancies.length);

    // Approva prima discrepanza
    const firstDiscrepancy = discrepancies[0];
    await approveDiscrepancy(firstDiscrepancy.id);
    
    // Verifica che lo stato sia aggiornato nella UI
    await page.reload();
    const updatedDiscrepancies = await getDiscrepancies(jobId);
    expect(updatedDiscrepancies[0].status).toBe('approved');

    // Verifica audit log aggiornato
    const auditLogs = await getAuditLogs();
    const updateLog = auditLogs.find(log => 
      log.action === 'update_discrepancy' && 
      log.target_id === firstDiscrepancy.id
    );
    expect(updateLog).toBeDefined();
    expect(updateLog.after.status).toBe('approved');

    // Screenshot finale
    await page.screenshot({ path: 'test-results/happy-path-ordine-conferma-final.png' });
  });
});
