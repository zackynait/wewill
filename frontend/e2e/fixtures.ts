import { test as base } from '@playwright/test';

export interface Fixtures {
  loginAsTenantA: () => Promise<void>;
  loginAsTenantB: () => Promise<void>;
  logout: () => Promise<void>;
  uploadPDF: (filePath: string) => Promise<string>;
  uploadCSV: (filePath: string) => Promise<string>;
  createReconciliationJob: (doc1Id: string, doc2Id: string) => Promise<string>;
  waitForDocumentStatus: (docId: string, status: string, timeout?: number) => Promise<void>;
  waitForJobStatus: (jobId: string, status: string, timeout?: number) => Promise<void>;
  getDiscrepancies: (jobId: string) => Promise<any[]>;
  approveDiscrepancy: (discrepancyId: string) => Promise<void>;
  getAuditLogs: () => Promise<any[]>;
  mockOpenAIResponse: (response: any) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  loginAsTenantA: async ({ page, request }, use) => {
    const loginAsTenantA = async () => {
      await page.goto('/login');
      await page.fill('input[name="email"]', 'tenant-a@example.com');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('/');
    };
    await use(loginAsTenantA);
  },

  loginAsTenantB: async ({ page, request }, use) => {
    const loginAsTenantB = async () => {
      await page.goto('/login');
      await page.fill('input[name="email"]', 'tenant-b@example.com');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('/');
    };
    await use(loginAsTenantB);
  },

  logout: async ({ page }, use) => {
    const logout = async () => {
      await page.click('button[aria-label="Logout"]');
      await page.waitForURL('/login');
    };
    await use(logout);
  },

  uploadPDF: async ({ page, request }, use) => {
    const uploadPDF = async (filePath: string) => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(filePath);
      await page.click('button[type="submit"]');
      
      // Wait for upload and return document ID
      const response = await page.waitForResponse(response => 
        response.url().includes('/api/documents/') && response.status() === 201
      );
      const data = await response.json();
      return data.id;
    };
    await use(uploadPDF);
  },

  uploadCSV: async ({ page, request }, use) => {
    const uploadCSV = async (filePath: string) => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(filePath);
      await page.click('button[type="submit"]');
      
      // Wait for upload and return document ID
      const response = await page.waitForResponse(response => 
        response.url().includes('/api/documents/') && response.status() === 201
      );
      const data = await response.json();
      return data.id;
    };
    await use(uploadCSV);
  },

  createReconciliationJob: async ({ page, request }, use) => {
    const createReconciliationJob = async (doc1Id: string, doc2Id: string) => {
      const response = await request.post('/api/reconciliations/jobs/', {
        data: {
          document_1: doc1Id,
          document_2: doc2Id,
        },
      });
      const data = await response.json();
      return data.id;
    };
    await use(createReconciliationJob);
  },

  waitForDocumentStatus: async ({ request }, use) => {
    const waitForDocumentStatus = async (docId: string, status: string, timeout = 60000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const response = await request.get(`/api/documents/${docId}/`);
        const data = await response.json();
        if (data.status === status) {
          return;
        }
        if (data.status === 'error') {
          throw new Error(`Document processing failed: ${data.error_message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw new Error(`Timeout waiting for document status to be ${status}`);
    };
    await use(waitForDocumentStatus);
  },

  waitForJobStatus: async ({ request }, use) => {
    const waitForJobStatus = async (jobId: string, status: string, timeout = 60000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const response = await request.get(`/api/reconciliations/jobs/${jobId}/`);
        const data = await response.json();
        if (data.status === status) {
          return;
        }
        if (data.status === 'error') {
          throw new Error(`Reconciliation failed: ${data.error_message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw new Error(`Timeout waiting for job status to be ${status}`);
    };
    await use(waitForJobStatus);
  },

  getDiscrepancies: async ({ request }, use) => {
    const getDiscrepancies = async (jobId: string) => {
      const response = await request.get(`/api/reconciliations/discrepancies/?job_id=${jobId}`);
      const data = await response.json();
      return data.results || data;
    };
    await use(getDiscrepancies);
  },

  approveDiscrepancy: async ({ request }, use) => {
    const approveDiscrepancy = async (discrepancyId: string) => {
      await request.patch(`/api/reconciliations/discrepancies/${discrepancyId}/`, {
        data: { status: 'approved' },
      });
    };
    await use(approveDiscrepancy);
  },

  getAuditLogs: async ({ request }, use) => {
    const getAuditLogs = async () => {
      const response = await request.get('/api/reconciliations/audit-logs/');
      const data = await response.json();
      return data.results || data;
    };
    await use(getAuditLogs);
  },

  mockOpenAIResponse: async ({ page }, use) => {
    const mockOpenAIResponse = async (response: any) => {
      await page.route('**/api/openai/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response),
        });
      });
    };
    await use(mockOpenAIResponse);
  },
});
