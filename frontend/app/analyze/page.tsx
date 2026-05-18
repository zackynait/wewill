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

interface ReconciliationJob {
  id: string;
  document_1: Document;
  document_2: Document;
  status: string;
  created_at: string;
  discrepancies?: any[];
}

export default function AnalyzePage() {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<Document[]>([]);
  const [processing, setProcessing] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const getFileType = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return 'pdf';
      case 'csv': return 'csv';
      case 'xlsx': return 'xlsx';
      case 'xls': return 'xls';
      default: return 'pdf'; // Default fallback
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length < 2) {
      alert('Seleziona almeno 2 documenti');
      return;
    }

    setProcessing(true);
    setError(null);
    const docs: Document[] = [];

    try {
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

      // Wait for processing
      await waitForProcessing(docs);

      // Create reconciliation
      if (docs.length >= 2) {
        const reconResponse = await api.post('/reconciliations/jobs/', {
          document_1_id: docs[0].id,
          document_2_id: docs[1].id,
        });
        setReconciliation(reconResponse.data);

        // Start reconciliation
        await api.post(`/reconciliations/jobs/${reconResponse.data.id}/start/`);

        // Wait for reconciliation completion
        await waitForReconciliation(reconResponse.data.id);
      }

    } catch (err: any) {
      setError(err.message || 'Errore durante il processo');
    } finally {
      setProcessing(false);
    }
  };

  const waitForProcessing = async (docs: Document[]) => {
    const maxAttempts = 60; // 5 minutes max
    for (let i = 0; i < maxAttempts; i++) {
      const responses = await Promise.all(
        docs.map(doc => api.get(`/documents/${doc.id}/`))
      );
      const allDone = responses.every(r => r.data.status === 'done');
      
      if (allDone) {
        setUploadedDocs(responses.map(r => r.data));
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error('Timeout durante l\'elaborazione dei documenti');
  };

  const waitForReconciliation = async (jobId: string) => {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      const response = await api.get(`/reconciliations/jobs/${jobId}/`);
      
      if (response.data.status === 'done') {
        setReconciliation(response.data);
        return;
      }
      
      if (response.data.status === 'error') {
        throw new Error('Errore durante la riconciliazione');
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error('Timeout durante la riconciliazione');
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Analisi Rapida
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/monitoring')} variant="outline">
                Monitoraggio
              </Button>
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Dashboard
              </Button>
              <Button onClick={() => router.push('/upload')} variant="outline">
                Carica Singolo
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">Analisi e Riconciliazione Rapida</h2>
          <p className="text-gray-600 mt-2">Carica 2 o più documenti per ottenere un'analisi immediata e la riconciliazione automatica</p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Carica Documenti</CardTitle>
            <CardDescription>Seleziona 2 o più file (PDF, CSV, Excel) da analizzare</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
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
                  <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-gray-600 mb-2">Clicca per selezionare i file</p>
                  <p className="text-sm text-gray-400">PDF, CSV, Excel supportati</p>
                </div>
              </label>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <p className="font-medium mb-2">File selezionati:</p>
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">{file.name}</span>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={processing}
                  className="mt-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 w-full"
                  size="lg"
                >
                  {processing ? 'Elaborazione in corso...' : 'Avvia Analisi e Riconciliazione'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-8 border-0 shadow-lg bg-red-50">
            <CardContent className="p-4">
              <p className="text-red-600 font-medium">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Uploaded Documents */}
        {uploadedDocs.length > 0 && (
          <Card className="mb-8 border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Documenti Caricati</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uploadedDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{doc.filename}</div>
                        <div className="text-sm text-gray-500">
                          {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('it-IT') : 'N/A'}
                        </div>
                      </div>
                    </div>
                    <Badge className={doc.status === 'done' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                      {doc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reconciliation Results */}
        {reconciliation && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Risultati Riconciliazione</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="font-medium mb-2">Documenti Confrontati</div>
                  <div className="text-gray-700">
                    {reconciliation.document_1?.filename} ↔ {reconciliation.document_2?.filename}
                  </div>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="font-medium mb-2">Scenario Rilevato</div>
                  <div className="text-gray-700">
                    {reconciliation.scenario || 'Non rilevato'}
                  </div>
                </div>

                {reconciliation.discrepancies && reconciliation.discrepancies.length > 0 ? (
                  <div>
                    <div className="font-medium mb-4 text-lg">
                      Discrepanze Trovate ({reconciliation.discrepancies.length})
                    </div>
                    <div className="space-y-3">
                      {reconciliation.discrepancies.map((discrepancy: any) => (
                        <div key={discrepancy.id} className="p-4 bg-orange-50 rounded-lg border-l-4 border-orange-500">
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-semibold text-gray-900">{discrepancy.field_name}</div>
                            <Badge className="bg-orange-100 text-orange-800">
                              {discrepancy.discrepancy_type}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Documento 1:</span>
                              <span className="ml-2 text-gray-700">{discrepancy.doc1_value || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium">Documento 2:</span>
                              <span className="ml-2 text-gray-700">{discrepancy.doc2_value || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 bg-green-50 rounded-lg text-center">
                    <svg className="w-16 h-16 text-green-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xl font-semibold text-green-800 mb-2">
                      Perfetto!
                    </div>
                    <div className="text-green-700">
                      Nessuna discrepanza trovata. I documenti corrispondono completamente.
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mt-6">
                  {reconciliation && (
                    <Button
                      onClick={() => router.push(`/review?job_id=${reconciliation.id}`)}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      Revisiona Discrepanze
                    </Button>
                  )}
                  <Button
                    onClick={() => router.push('/dashboard')}
                    variant="outline"
                    className="flex-1"
                  >
                    Vai alla Dashboard
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedFiles([]);
                      setUploadedDocs([]);
                      setReconciliation(null);
                      setError(null);
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Nuova Analisi
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
