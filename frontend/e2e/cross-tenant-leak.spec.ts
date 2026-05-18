import { test } from './fixtures';
import { expect } from '@playwright/test';

test.describe('Cross-Tenant Leak', () => {
  test('TEST 5 - cross_tenant_leak', async ({
    page,
    loginAsTenantA,
    logout,
    loginAsTenantB,
    uploadPDF,
    waitForDocumentStatus,
    createReconciliationJob,
    waitForJobStatus,
  }) => {
    // Login tenant A
    await loginAsTenantA();

    // Upload PDF ordine
    await page.goto('/documents/upload');
    const orderDocId = await uploadPDF('./e2e/fixtures/sample-order.pdf');
    await waitForDocumentStatus(orderDocId, 'done');

    // Upload PDF conferma
    await page.goto('/documents/upload');
    const confirmDocId = await uploadPDF('./e2e/fixtures/sample-confirmation.pdf');
    await waitForDocumentStatus(confirmDocId, 'done');

    // Crea job
    const jobId = await createReconciliationJob(orderDocId, confirmDocId);
    await waitForJobStatus(jobId, 'done');

    // Salva job_id
    const tenantAJobId = jobId;

    // Logout
    await logout();

    // Login tenant B
    await loginAsTenantB();

    // Tenta di accedere al job di tenant A
    const response = await page.request.get(`/api/reconciliations/jobs/${tenantAJobId}/`);
    
    // Verifica risposta 404 (non 403, non 200)
    expect(response.status()).toBe(404);

    // Verifica che lista jobs di B non contenga job di A
    const jobsResponse = await page.request.get('/api/reconciliations/jobs/');
    const jobsData = await jobsResponse.json();
    const jobIds = jobsData.results?.map((job: any) => job.id) || [];
    expect(jobIds).not.toContain(tenantAJobId);

    // Verifica che anche i documenti di A non siano accessibili a B
    const docResponse = await page.request.get(`/api/documents/${orderDocId}/`);
    expect(docResponse.status()).toBe(404);

    // Verifica che le discrepanze del job di A non siano accessibili a B
    const discrepanciesResponse = await page.request.get(
      `/api/reconciliations/discrepancies/?job_id=${tenantAJobId}`
    );
    expect(discrepanciesResponse.status()).toBe(404);

    // Verifica che tenant B possa creare i propri job
    await page.goto('/documents/upload');
    const orderDocIdB = await uploadPDF('./e2e/fixtures/sample-order.pdf');
    await waitForDocumentStatus(orderDocIdB, 'done');

    await page.goto('/documents/upload');
    const confirmDocIdB = await uploadPDF('./e2e/fixtures/sample-confirmation.pdf');
    await waitForDocumentStatus(confirmDocIdB, 'done');

    const jobIdB = await createReconciliationJob(orderDocIdB, confirmDocIdB);
    await waitForJobStatus(jobIdB, 'done');

    // Verifica che tenant B possa accedere al proprio job
    const jobBResponse = await page.request.get(`/api/reconciliations/jobs/${jobIdB}/`);
    expect(jobBResponse.status()).toBe(200);

    // Verifica che i job di B siano nella lista
    const jobsBResponse = await page.request.get('/api/reconciliations/jobs/');
    const jobsBData = await jobsBResponse.json();
    const jobBIds = jobsBData.results?.map((job: any) => job.id) || [];
    expect(jobBIds).toContain(jobIdB);
    expect(jobBIds).not.toContain(tenantAJobId);

    // Screenshot finale
    await page.screenshot({ path: 'test-results/cross-tenant-leak-final.png' });
  });
});
