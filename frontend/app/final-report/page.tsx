'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface FinalReport {
  job_id: string;
  scenario: string | null;
  unified_document: any;
  summary: {
    total_discrepancies: number;
    approved: number;
    corrected: number;
    rejected: number;
    pending: number;
    discrepancy_types: {
      missing: number;
      changed: number;
      equivalent_different: number;
    };
  };
  documents: {
    document_1: {
      id: string;
      file_type: string;
      status: string;
      uploaded_at: string;
      download_url: string;
      view_url: string;
    };
    document_2: {
      id: string;
      file_type: string;
      status: string;
      uploaded_at: string;
      download_url: string;
      view_url: string;
    };
  };
  completed_at: string;
}

export default function FinalReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('job_id');
  
  const [report, setReport] = useState<FinalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchReport();
    }
  }, [jobId]);

  const fetchReport = async () => {
    try {
      const response = await api.get(`/reconciliations/jobs/${jobId}/final_report/`);
      setReport(response.data);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento del resoconto');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!report) return;
    
    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `resoconto-${report.job_id}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Generazione resoconto...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6">
            <p className="text-red-600">{error || 'Resoconto non trovato'}</p>
            <Button onClick={() => router.push('/dashboard')} className="mt-4">
              Torna alla Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Resoconto Finale
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleDownloadJSON} variant="outline">
                📥 Scarica JSON
              </Button>
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-sm text-gray-500">Totale Discrepanze</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{report.summary.total_discrepancies}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-sm text-gray-500">Approvate</div>
              <div className="text-3xl font-bold text-green-600 mt-2">{report.summary.approved}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-sm text-gray-500">Corrette</div>
              <div className="text-3xl font-bold text-blue-600 mt-2">{report.summary.corrected}</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-sm text-gray-500">Rifiutate</div>
              <div className="text-3xl font-bold text-red-600 mt-2">{report.summary.rejected}</div>
            </CardContent>
          </Card>
        </div>

        {/* Discrepancy Types */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Tipi di Discrepanze</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="text-sm text-gray-600">Missing</div>
                <div className="text-2xl font-bold text-orange-600 mt-1">{report.summary.discrepancy_types.missing}</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-gray-600">Changed</div>
                <div className="text-2xl font-bold text-purple-600 mt-1">{report.summary.discrepancy_types.changed}</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-600">Equivalent Different</div>
                <div className="text-2xl font-bold text-blue-600 mt-1">{report.summary.discrepancy_types.equivalent_different}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documents Section */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Documenti Originali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="text-sm text-gray-500 mb-2">Documento 1</div>
                <div className="font-medium mb-3">{report.documents.document_1.id}</div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`${API_URL}${report.documents.document_1.view_url}`, '_blank')}
                  >
                    👁️ Visiona
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`${API_URL}${report.documents.document_1.download_url}`)}
                  >
                    📥 Scarica
                  </Button>
                </div>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="text-sm text-gray-500 mb-2">Documento 2</div>
                <div className="font-medium mb-3">{report.documents.document_2.id}</div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`${API_URL}${report.documents.document_2.view_url}`, '_blank')}
                  >
                    👁️ Visiona
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`${API_URL}${report.documents.document_2.download_url}`)}
                  >
                    📥 Scarica
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unified Document */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Documento Unificato (Dati Finali)</CardTitle>
            <CardDescription>Valori finali basati sulle decisioni prese durante la revisione</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm">{JSON.stringify(report.unified_document, null, 2)}</pre>
            </div>
          </CardContent>
        </Card>

        {/* Job Info */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Informazioni Job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Job ID</div>
                <div className="font-medium">{report.job_id}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Scenario</div>
                <div className="font-medium">{report.scenario || 'Non rilevato'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Completato il</div>
                <div className="font-medium">{new Date(report.completed_at).toLocaleString('it-IT')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
