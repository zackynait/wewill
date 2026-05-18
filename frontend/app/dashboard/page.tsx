'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  uploaded_at: string;
  extracted_data?: any;
}

interface Discrepancy {
  id: string;
  field_name: string;
  doc1_value: string;
  doc2_value: string;
  discrepancy_type: string;
  status: string;
  operator_note: string;
}

interface ReconciliationJob {
  id: string;
  document_1: Document;
  document_2: Document;
  status: string;
  scenario: string;
  created_at: string;
  discrepancies?: Discrepancy[];
}

type WizardStep = 'upload' | 'analyze' | 'review';

export default function DashboardPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('upload');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<Document[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationJob | null>(null);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    setIsAuthenticated(true);

    // Fetch documents on load
    fetchDocuments();
  }, [router]);

  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents/');
      setDocuments(response.data.results || response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 2) {
      alert('Seleziona massimo 2 file');
      return;
    }
    setSelectedFiles(files);
  };

  const getFileType = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return 'pdf';
      case 'csv': return 'csv';
      case 'xlsx': return 'xlsx';
      case 'xls': return 'xls';
      default: return 'pdf';
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length !== 2) {
      alert('Seleziona esattamente 2 documenti');
      return;
    }

    setLoading(true);
    setError(null);
    const docs: Document[] = [];

    try {
      // Verify authentication before upload
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Non sei autenticato. Effettua il login.');
        router.push('/login');
        return;
      }

      // Upload all files
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', getFileType(file.name));

        const response = await api.post('/documents/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        docs.push(response.data);
      }

      setUploadedDocs(docs);

      // Trigger processing for each document
      for (const doc of docs) {
        try {
          console.log(`Triggering processing for document ${doc.id}...`);
          const processResponse = await api.post(`/documents/${doc.id}/process/`);
          console.log(`Processing started for document ${doc.id}:`, processResponse.data);
        } catch (processError) {
          console.error(`Failed to trigger processing for document ${doc.id}:`, processError);
          setError(`Errore nell'avvio dell'elaborazione per ${doc.filename}`);
          setLoading(false);
          return;
        }
      }

      // Poll for document processing completion
      const maxAttempts = 90; // 90 attempts = 180 seconds (2s per attempt)
      let attempts = 0;
      let allProcessed = false;

      while (attempts < maxAttempts && !allProcessed) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const processedDocs = await Promise.all(
          docs.map(doc => api.get(`/documents/${doc.id}/`))
        );

        allProcessed = processedDocs.every(res => res.data.status === 'done');
        
        // Update uploaded docs with latest data
        setUploadedDocs(processedDocs.map(res => res.data));
        attempts++;
      }

      if (!allProcessed) {
        setError('I documenti stanno impiegando troppo tempo per essere elaborati. Riprova più tardi.');
        setLoading(false);
        return;
      }

      // Get full document details with extracted data
      const docsWithDetails = await Promise.all(
        docs.map(doc => api.get(`/documents/${doc.id}/`))
      );
      setUploadedDocs(docsWithDetails.map(res => res.data));

      // Don't auto-proceed with reconciliation - let user review extracted data first
      setLoading(false);
      return;

    } catch (error: any) {
      console.error('Upload failed:', error);
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        setError('Sessione scaduta. Effettua il login.');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        router.push('/login');
      } else if (error.response?.status === 403) {
        setError('Non hai i permessi per caricare documenti.');
      } else if (error.message) {
        setError(`Errore: ${error.message}`);
      } else {
        setError('Errore durante il caricamento o elaborazione');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToReconciliation = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create reconciliation
      const reconResponse = await api.post('/reconciliations/jobs/', {
        document_1_id: uploadedDocs[0].id,
        document_2_id: uploadedDocs[1].id
      });

      const job = reconResponse.data;

      // Start reconciliation
      await api.post(`/reconciliations/jobs/${job.id}/start/`);

      // Wait for completion
      await waitForReconciliation(job.id);

      setStep('analyze');
    } catch (error: any) {
      console.error('Reconciliation failed:', error);
      setError('Errore durante la riconciliazione');
    } finally {
      setLoading(false);
    }
  };

  const waitForReconciliation = async (jobId: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await api.get(`/reconciliations/jobs/${jobId}/`);
        const job = response.data;

        if (job.status === 'done') {
          setReconciliation(job);
          return;
        } else if (job.status === 'error') {
          throw new Error('Reconciliation failed');
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      } catch (error) {
        console.error('Error checking reconciliation status:', error);
        throw error;
      }
    }

    throw new Error('Reconciliation timeout');
  };

  const handleStartReview = () => {
    setStep('review');
  };

  const handleApprove = async (discrepancyId: string) => {
    try {
      await api.patch(`/reconciliations/discrepancies/${discrepancyId}/`, {
        status: 'approved'
      });
      
      if (reconciliation) {
        const response = await api.get(`/reconciliations/jobs/${reconciliation.id}/`);
        setReconciliation(response.data);
      }
    } catch (error) {
      console.error('Failed to approve discrepancy:', error);
      alert('Errore durante l\'approvazione');
    }
  };

  const handleCorrect = async (discrepancyId: string, newValue: string) => {
    try {
      await api.patch(`/reconciliations/discrepancies/${discrepancyId}/`, {
        status: 'corrected',
        doc2_value: newValue
      });
      
      if (reconciliation) {
        const response = await api.get(`/reconciliations/jobs/${reconciliation.id}/`);
        setReconciliation(response.data);
      }
    } catch (error) {
      console.error('Failed to correct discrepancy:', error);
      alert('Errore durante la correzione');
    }
  };

  const handleReject = async (discrepancyId: string) => {
    try {
      await api.patch(`/reconciliations/discrepancies/${discrepancyId}/`, {
        status: 'rejected'
      });
      
      if (reconciliation) {
        const response = await api.get(`/reconciliations/jobs/${reconciliation.id}/`);
        setReconciliation(response.data);
      }
    } catch (error) {
      console.error('Failed to reject discrepancy:', error);
      alert('Errore durante il rifiuto');
    }
  };

  const handleCompleteReview = async () => {
    if (!reconciliation) return;

    try {
      await api.post(`/reconciliations/jobs/${reconciliation.id}/complete_review/`);
      alert('Revisione completata con successo!');
      // Reset wizard
      setStep('upload');
      setSelectedFiles([]);
      setUploadedDocs([]);
      setReconciliation(null);
      setError(null);
      fetchDocuments();
    } catch (error) {
      console.error('Failed to complete review:', error);
      alert('Errore durante il completamento della revisione');
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
      await api.post('/auth/logout/', { refresh: refreshToken });
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if logout fails, clear tokens and redirect
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      router.push('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                WeWill
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/monitoring')} variant="outline">
                Monitoraggio
              </Button>
              <Button onClick={handleLogout} variant="outline">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Wizard Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className={`flex items-center ${step === 'upload' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2 font-medium">Carica Documenti</span>
            </div>
            <div className={`flex-1 h-1 mx-4 ${step === 'analyze' || step === 'review' ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center ${step === 'analyze' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'analyze' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2 font-medium">Analisi</span>
            </div>
            <div className={`flex-1 h-1 mx-4 ${step === 'review' ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center ${step === 'review' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="ml-2 font-medium">Revisione</span>
            </div>
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Carica 2 Documenti</CardTitle>
              <CardDescription>Seleziona 2 documenti (PDF, CSV, Excel) da riconciliare</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center">
                    <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      {selectedFiles.length > 0 ? `${selectedFiles.length} file selezionati` : 'Clicca per selezionare i file'}
                    </p>
                    <p className="text-sm text-gray-500">PDF, CSV, Excel supportati</p>
                  </div>
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-6 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length !== 2 || loading}
                className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {loading ? 'Elaborazione in corso...' : 'Avvia Analisi'}
              </Button>

              {/* Show extracted data after upload */}
              {uploadedDocs.length > 0 && uploadedDocs.every(doc => doc.status === 'done') && !loading && (
                <div className="mt-8 space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900">Dati Estratti</h3>
                  {uploadedDocs.map((doc, index) => (
                    <Card key={doc.id} className="border border-gray-200">
                      <CardHeader>
                        <CardTitle className="text-base">Documento {index + 1}: {doc.filename}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {doc.extracted_data ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-700">Tipo:</span>
                                <span className="ml-2">{doc.extracted_data.document_type || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Data:</span>
                                <span className="ml-2">{doc.extracted_data.document_date || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Cliente:</span>
                                <span className="ml-2">{doc.extracted_data.customer || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Fornitore:</span>
                                <span className="ml-2">{doc.extracted_data.supplier || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Numero Doc:</span>
                                <span className="ml-2">{doc.extracted_data.document_number || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Totale:</span>
                                <span className="ml-2">{doc.extracted_data.total_amount || 'N/A'} {doc.extracted_data.currency || ''}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Porto:</span>
                                <span className="ml-2">{doc.extracted_data.porto || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Trasporto:</span>
                                <span className="ml-2">{doc.extracted_data.transport_care_of || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Spedizioniere:</span>
                                <span className="ml-2">{doc.extracted_data.shipping_company || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Valore Merce:</span>
                                <span className="ml-2">{doc.extracted_data.merchandise_value || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Valore Netto:</span>
                                <span className="ml-2">{doc.extracted_data.net_value || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Spese Trasporto:</span>
                                <span className="ml-2">{doc.extracted_data.transport_costs || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Imponibile:</span>
                                <span className="ml-2">{doc.extracted_data.taxable_amount || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">IVA:</span>
                                <span className="ml-2">{doc.extracted_data.vat_amount || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Pagamento:</span>
                                <span className="ml-2">{doc.extracted_data.payment_method || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Scadenza:</span>
                                <span className="ml-2">{doc.extracted_data.payment_terms || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Banca:</span>
                                <span className="ml-2">{doc.extracted_data.bank || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">ABI:</span>
                                <span className="ml-2">{doc.extracted_data.abi || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">CAB:</span>
                                <span className="ml-2">{doc.extracted_data.cab || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Ref. Commerciale:</span>
                                <span className="ml-2">{doc.extracted_data.commercial_ref || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Email:</span>
                                <span className="ml-2">{doc.extracted_data.supplier_email || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Destinazione:</span>
                                <span className="ml-2">{doc.extracted_data.destination_address || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Agente:</span>
                                <span className="ml-2">{doc.extracted_data.agent || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Agenzia:</span>
                                <span className="ml-2">{doc.extracted_data.agency || 'N/A'}</span>
                              </div>
                            </div>
                            
                            {doc.extracted_data.lines && doc.extracted_data.lines.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-2">Righe ({doc.extracted_data.lines.length}):</h4>
                                <div className="max-h-60 overflow-y-auto border rounded-lg">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium">Codice</th>
                                        <th className="px-3 py-2 text-left font-medium">Descrizione</th>
                                        <th className="px-3 py-2 text-right font-medium">Quantità</th>
                                        <th className="px-3 py-2 text-right font-medium">Prezzo</th>
                                        <th className="px-3 py-2 text-right font-medium">Sconto</th>
                                        <th className="px-3 py-2 text-right font-medium">Totale</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {doc.extracted_data.lines.map((line: any, lineIdx: number) => (
                                        <tr key={lineIdx} className="border-t">
                                          <td className="px-3 py-2">{line.code || 'N/A'}</td>
                                          <td className="px-3 py-2 max-w-xs truncate">{line.description || 'N/A'}</td>
                                          <td className="px-3 py-2 text-right">{line.quantity || 'N/A'}</td>
                                          <td className="px-3 py-2 text-right">{line.unit_price || 'N/A'}</td>
                                          <td className="px-3 py-2 text-right">{line.discount ? `${line.discount}%` : 'N/A'}</td>
                                          <td className="px-3 py-2 text-right">{line.total || 'N/A'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {doc.extracted_data.classification && (
                              <div className="p-3 bg-blue-50 rounded-lg">
                                <h4 className="font-medium text-blue-800 mb-1">Classificazione AI</h4>
                                <p className="text-sm text-blue-700">
                                  <strong>Tipo:</strong> {doc.extracted_data.classification.type}<br/>
                                  <strong>Confidence:</strong> {Math.round((doc.extracted_data.classification.confidence || 0) * 100)}%
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Nessun dato estratto disponibile</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  
                  <Button
                    onClick={handleProceedToReconciliation}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    Procedi con Riconciliazione
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Analyze */}
        {step === 'analyze' && reconciliation && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Risultati Analisi</CardTitle>
              <CardDescription>
                Scenario: {reconciliation.scenario === 'order_confirmation' ? 'Ordine + Conferma' : reconciliation.scenario === 'price_confirmation' ? 'Listino + Conferma Prezzi' : 'Sconosciuto'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Document Processing Details */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-medium mb-3 text-blue-800">Dettagli Elaborazione Documenti</h3>
                  <div className="space-y-4">
                    {uploadedDocs.map((doc, index) => (
                      <div key={doc.id} className="bg-white p-3 rounded border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="font-medium text-gray-900">Documento {index + 1}: {doc.filename}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <div><span className="font-medium">Tipo:</span> {doc.extracted_data?.document_type || 'N/A'}</div>
                          <div><span className="font-medium">Confidence:</span> {doc.extracted_data?.overall_confidence ? `${Math.round(doc.extracted_data.overall_confidence * 100)}%` : 'N/A'}</div>
                          <div><span className="font-medium">Righe:</span> {doc.extracted_data?.lines?.length || 0}</div>
                          <div><span className="font-medium">Stato:</span> {doc.status}</div>
                        </div>
                        {doc.extracted_data?.classification && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Classificazione:</span> {doc.extracted_data.classification.type} ({Math.round(doc.extracted_data.classification.confidence * 100)}%)
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reconciliation Overview */}
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-medium mb-3 text-purple-800">Panoramica Riconciliazione</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded border border-purple-100 text-center">
                      <div className="text-2xl font-bold text-purple-600">{uploadedDocs[0]?.extracted_data?.lines?.length || 0}</div>
                      <div className="text-sm text-gray-600">Righe Doc1</div>
                    </div>
                    <div className="bg-white p-3 rounded border border-purple-100 text-center">
                      <div className="text-2xl font-bold text-purple-600">{uploadedDocs[1]?.extracted_data?.lines?.length || 0}</div>
                      <div className="text-sm text-gray-600">Righe Doc2</div>
                    </div>
                    <div className="bg-white p-3 rounded border border-purple-100 text-center">
                      <div className="text-2xl font-bold text-purple-600">{reconciliation.discrepancies?.length || 0}</div>
                      <div className="text-sm text-gray-600">Discrepanze</div>
                    </div>
                  </div>
                </div>

                {/* Sample Lines */}
                {uploadedDocs[0]?.extracted_data?.lines && uploadedDocs[1]?.extracted_data?.lines && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium mb-3 text-gray-800">Panoramica Righe Riconosciute</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Documento 1</h4>
                        <div className="max-h-40 overflow-y-auto border rounded bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 sticky top-0">
                              <tr>
                                <th className="px-2 py-1 text-left">Codice</th>
                                <th className="px-2 py-1 text-right">Qta</th>
                                <th className="px-2 py-1 text-right">Prezzo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uploadedDocs[0].extracted_data.lines.slice(0, 5).map((line: any, idx: number) => (
                                <tr key={idx} className="border-t">
                                  <td className="px-2 py-1">{line.code || 'N/A'}</td>
                                  <td className="px-2 py-1 text-right">{line.quantity || '-'}</td>
                                  <td className="px-2 py-1 text-right">{line.unit_price || '-'}</td>
                                </tr>
                              ))}
                              {uploadedDocs[0].extracted_data.lines.length > 5 && (
                                <tr>
                                  <td colSpan={3} className="px-2 py-1 text-center text-gray-500">
                                    ...e altre {uploadedDocs[0].extracted_data.lines.length - 5} righe
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Documento 2</h4>
                        <div className="max-h-40 overflow-y-auto border rounded bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 sticky top-0">
                              <tr>
                                <th className="px-2 py-1 text-left">Codice</th>
                                <th className="px-2 py-1 text-right">Qta</th>
                                <th className="px-2 py-1 text-right">Prezzo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uploadedDocs[1].extracted_data.lines.slice(0, 5).map((line: any, idx: number) => (
                                <tr key={idx} className="border-t">
                                  <td className="px-2 py-1">{line.code || 'N/A'}</td>
                                  <td className="px-2 py-1 text-right">{line.quantity || '-'}</td>
                                  <td className="px-2 py-1 text-right">{line.unit_price || '-'}</td>
                                </tr>
                              ))}
                              {uploadedDocs[1].extracted_data.lines.length > 5 && (
                                <tr>
                                  <td colSpan={3} className="px-2 py-1 text-center text-gray-500">
                                    ...e altre {uploadedDocs[1].extracted_data.lines.length - 5} righe
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Discrepancies */}
                {reconciliation.discrepancies && reconciliation.discrepancies.length > 0 ? (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h3 className="font-medium mb-2 text-yellow-800">
                      Trovate {reconciliation.discrepancies.length} discrepanze
                    </h3>
                    <div className="space-y-2 text-sm">
                      {reconciliation.discrepancies.map((disc, index) => (
                        <div key={index} className="p-2 bg-white rounded border border-yellow-200">
                          <p className="font-medium">{disc.field_name || disc.field}</p>
                          <p className="text-gray-600">
                            Doc1: {disc.doc1_value || disc.value_doc1} → Doc2: {disc.doc2_value || disc.value_doc2}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-medium text-green-800 mb-2">Perfetto!</h3>
                    <p className="text-green-700">Nessuna discrepanza trovata. I documenti corrispondono completamente.</p>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-6">
                <Button
                  onClick={() => setStep('upload')}
                  variant="outline"
                  className="flex-1"
                >
                  Torna Indietro
                </Button>
                <Button
                  onClick={handleStartReview}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  Procedi alla Revisione
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === 'review' && reconciliation && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Revisiona Discrepanze</CardTitle>
              <CardDescription>Approva, correggi o rifiuta le discrepanze trovate</CardDescription>
            </CardHeader>
            <CardContent>
              {reconciliation.discrepancies && reconciliation.discrepancies.length > 0 ? (
                <div className="space-y-4">
                  {reconciliation.discrepancies.map((disc) => (
                    <div key={disc.id} className="p-4 bg-gray-50 rounded-lg border">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium">{disc.field_name}</h4>
                          <div className="text-sm text-gray-600 mt-1">
                            <p>Doc1: <span className="font-medium">{disc.doc1_value}</span></p>
                            <p>Doc2: <span className="font-medium">{disc.doc2_value}</span></p>
                          </div>
                        </div>
                        <Badge className={
                          disc.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          disc.status === 'approved' ? 'bg-green-100 text-green-800' :
                          disc.status === 'corrected' ? 'bg-blue-100 text-blue-800' :
                          disc.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }>
                          {disc.status}
                        </Badge>
                      </div>

                      {disc.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(disc.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Approva
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(disc.id)}
                            className="border-red-300 hover:bg-red-50"
                          >
                            Rifiuta
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-green-700">Nessuna discrepanza da revisionare</p>
                </div>
              )}

              <div className="flex gap-4 mt-6">
                <Button
                  onClick={() => setStep('analyze')}
                  variant="outline"
                  className="flex-1"
                >
                  Torna Indietro
                </Button>
                <Button
                  onClick={handleCompleteReview}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                >
                  Completa Revisione
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
