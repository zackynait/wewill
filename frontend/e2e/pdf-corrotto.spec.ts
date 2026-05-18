import { test } from './fixtures';
import { expect } from '@playwright/test';

test.describe('PDF Corrotto', () => {
  test('TEST 3 - pdf_corrotto', async ({
    page,
    loginAsTenantA,
    uploadPDF,
    waitForDocumentStatus,
  }) => {
    // Login con tenant A
    await loginAsTenantA();

    // Crea un file PDF corrotto (contenuto random)
    const corruptedPdfPath = './e2e/fixtures/corrupted.pdf';
    
    // Upload PDF corrotto
    await page.goto('/documents/upload');
    const docId = await uploadPDF(corruptedPdfPath);
    
    // Aspetta che status diventi "error" con timeout
    await waitForDocumentStatus(docId, 'error');

    // Verifica che status sia "error"
    const docResponse = await page.request.get(`/api/documents/${docId}/`);
    const docData = await docResponse.json();
    expect(docData.status).toBe('error');
    expect(docData.error_message).toBeDefined();

    // Verifica che messaggio errore sia visibile in UI
    await page.goto(`/documents/${docId}`);
    const errorMessage = page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(docData.error_message);

    // Verifica che sistema non crashi - controlla che UI sia ancora responsive
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Verifica che altri documenti possano essere caricati
    await page.goto('/documents/upload');
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();

    // Screenshot dell'errore
    await page.screenshot({ path: 'test-results/pdf-corrotto-error.png' });
  });
});
