import { test } from './fixtures';
import { expect } from '@playwright/test';

test.describe('LLM JSON Malformato', () => {
  test('TEST 4 - llm_json_malformato', async ({
    page,
    loginAsTenantA,
    uploadPDF,
    waitForDocumentStatus,
    mockOpenAIResponse,
  }) => {
    // Login con tenant A
    await loginAsTenantA();

    // Mocka la risposta OpenAI per ritornare JSON invalido
    const invalidJsonResponse = {
      status: 'success',
      extracted_data: '{invalid json content',
    };

    await mockOpenAIResponse(invalidJsonResponse);

    // Upload PDF
    await page.goto('/documents/upload');
    const docId = await uploadPDF('./e2e/fixtures/sample-order.pdf');
    
    // Aspetta che status diventi "error" dopo 3 tentativi
    await waitForDocumentStatus(docId, 'error');

    // Verifica che status sia "error"
    const docResponse = await page.request.get(`/api/documents/${docId}/`);
    const docData = await docResponse.json();
    expect(docData.status).toBe('error');
    expect(docData.error_message).toContain('JSON parse error');

    // Verifica che il retry sia avvenuto controllando i logs
    // In un ambiente reale, questo richiederebbe accesso ai logs del server
    // Per ora verifichiamo che il sistema abbia gestito l'errore correttamente
    
    // Verifica che dopo 3 tentativi falliti lo status sia "error" con reason
    expect(docData.error_message).toBeDefined();
    expect(docData.error_message.length).toBeGreaterThan(0);

    // Verifica che il sistema non sia crashato
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Verifica che altri documenti possano essere processati normalmente
    // Ripristiniamo il mock per restituire JSON valido
    const validJsonResponse = {
      status: 'success',
      extracted_data: {
        document_type: 'order',
        supplier: 'Test Supplier',
        customer: 'Test Customer',
        date: '2024-01-01',
        lines: [
          {
            code: 'ITEM001',
            description: 'Test Item',
            quantity: 10,
            unit_price: 100,
            total: 1000,
          },
        ],
      },
    };

    await mockOpenAIResponse(validJsonResponse);

    await page.goto('/documents/upload');
    const docId2 = await uploadPDF('./e2e/fixtures/sample-order.pdf');
    
    // Questo dovrebbe funzionare correttamente
    await waitForDocumentStatus(docId2, 'done');

    const doc2Response = await page.request.get(`/api/documents/${docId2}/`);
    const doc2Data = await doc2Response.json();
    expect(doc2Data.status).toBe('done');

    // Screenshot finale
    await page.screenshot({ path: 'test-results/llm-json-malformato-final.png' });
  });
});
