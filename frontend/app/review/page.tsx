'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

interface Discrepancy {
  id: string;
  field_name: string;
  doc1_value: string | null;
  doc2_value: string | null;
  discrepancy_type: string;
  status: string;
  operator_note: string | null;
}

interface ReconciliationJob {
  id: string;
  document_1: { id: string; filename: string };
  document_2: { id: string; filename: string };
  status: string;
  scenario: string | null;
  discrepancies: Discrepancy[];
}

export default function ReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('job_id');
  
  const [job, setJob] = useState<ReconciliationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDiscrepancy, setEditingDiscrepancy] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, { doc1_value: string; doc2_value: string; note: string }>>({});

  useEffect(() => {
    if (jobId) {
      fetchJob();
    }
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const response = await api.get(`/reconciliations/jobs/${jobId}/`);
      setJob(response.data);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento della riconciliazione');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (discrepancyId: string) => {
    try {
      await api.patch(`/reconciliations/discrepancies/${discrepancyId}/`, {
        status: 'approved'
      });
      fetchJob();
    } catch (err: any) {
      alert('Errore nell\'approvazione: ' + err.message);
    }
  };

  const handleReject = async (discrepancyId: string) => {
    try {
      await api.patch(`/reconciliations/discrepancies/${discrepancyId}/`, {
        status: 'rejected'
      });
      fetchJob();
    } catch (err: any) {
      alert('Errore nel rifiuto: ' + err.message);
    }
  };

  const handleCorrect = async (discrepancyId: string) => {
    const correction = corrections[discrepancyId];
    if (!correction) {
      alert('Inserisci i valori corretti');
      return;
    }

    try {
      await api.patch(`/reconciliations/discrepancies/${discrepancyId}/`, {
        status: 'corrected',
        doc1_value: correction.doc1_value,
        doc2_value: correction.doc2_value,
        operator_note: correction.note
      });
      setEditingDiscrepancy(null);
      delete corrections[discrepancyId];
      fetchJob();
    } catch (err: any) {
      alert('Errore nella correzione: ' + err.message);
    }
  };

  const handleCompleteReview = async () => {
    if (!job) return;
    
    try {
      await api.post(`/reconciliations/jobs/${job.id}/complete_review/`);
      router.push('/dashboard');
    } catch (err: any) {
      alert('Errore nel completamento della revisione: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'corrected': return 'bg-blue-100 text-blue-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6">
            <p className="text-red-600">{error || 'Riconciliazione non trovata'}</p>
            <Button onClick={() => router.push('/dashboard')} className="mt-4">
              Torna alla Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingDiscrepancies = job.discrepancies.filter(d => d.status === 'pending');
  const reviewedDiscrepancies = job.discrepancies.filter(d => d.status !== 'pending');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Revisione Discrepanze
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/monitoring')} variant="outline">
                Monitoraggio
              </Button>
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Dashboard
              </Button>
              {pendingDiscrepancies.length === 0 && (
                <Button onClick={handleCompleteReview} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                  Completa Revisione
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Job Info */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Riconciliazione</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Documento 1</div>
                <div className="font-medium">{job.document_1.filename}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Documento 2</div>
                <div className="font-medium">{job.document_2.filename}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Scenario</div>
                <div className="font-medium">{job.scenario || 'Non rilevato'}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-gray-500">Da revisionare:</span>
                  <span className="ml-2 font-semibold text-orange-600">{pendingDiscrepancies.length}</span>
                </div>
                <div>
                  <span className="text-gray-500">Già revisionate:</span>
                  <span className="ml-2 font-semibold text-green-600">{reviewedDiscrepancies.length}</span>
                </div>
                <div>
                  <span className="text-gray-500">Totale:</span>
                  <span className="ml-2 font-semibold">{job.discrepancies.length}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Discrepancies */}
        {pendingDiscrepancies.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Discrepanze da Revisionare</h2>
            <div className="space-y-4">
              {pendingDiscrepancies.map((discrepancy) => (
                <Card key={discrepancy.id} className="border-0 shadow-lg border-l-4 border-l-orange-500">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{discrepancy.field_name}</h3>
                        <Badge className="bg-orange-100 text-orange-800 mt-2">
                          {discrepancy.discrepancy_type}
                        </Badge>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800">
                        {discrepancy.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-500 mb-1">Documento 1</div>
                        <div className="font-medium">{discrepancy.doc1_value || 'N/A'}</div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-500 mb-1">Documento 2</div>
                        <div className="font-medium">{discrepancy.doc2_value || 'N/A'}</div>
                      </div>
                    </div>

                    {editingDiscrepancy === discrepancy.id ? (
                      <div className="space-y-4 border-t border-gray-200 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Correzione Doc 1
                            </label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              defaultValue={discrepancy.doc1_value || ''}
                              onChange={(e) => setCorrections(prev => ({
                                ...prev,
                                [discrepancy.id]: { ...prev[discrepancy.id], doc1_value: e.target.value }
                              }))}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Correzione Doc 2
                            </label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              defaultValue={discrepancy.doc2_value || ''}
                              onChange={(e) => setCorrections(prev => ({
                                ...prev,
                                [discrepancy.id]: { ...prev[discrepancy.id], doc2_value: e.target.value }
                              }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Note operatore
                          </label>
                          <textarea
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                            placeholder="Spiega la correzione..."
                            onChange={(e) => setCorrections(prev => ({
                              ...prev,
                              [discrepancy.id]: { ...prev[discrepancy.id], note: e.target.value }
                            }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleCorrect(discrepancy.id)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            Salva Correzione
                          </Button>
                          <Button
                            onClick={() => setEditingDiscrepancy(null)}
                            variant="outline"
                          >
                            Annulla
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 border-t border-gray-200 pt-4">
                        <Button
                          onClick={() => handleApprove(discrepancy.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Approva
                        </Button>
                        <Button
                          onClick={() => handleReject(discrepancy.id)}
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          Rifiuta
                        </Button>
                        <Button
                          onClick={() => setEditingDiscrepancy(discrepancy.id)}
                          variant="outline"
                        >
                          Correggi
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Reviewed Discrepancies */}
        {reviewedDiscrepancies.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Discrepanze Già Revisionate</h2>
            <div className="space-y-3">
              {reviewedDiscrepancies.map((discrepancy) => (
                <Card key={discrepancy.id} className="border-0 shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{discrepancy.field_name}</div>
                        <div className="text-sm text-gray-600">
                          Doc1: {discrepancy.doc1_value || 'N/A'} | Doc2: {discrepancy.doc2_value || 'N/A'}
                        </div>
                        {discrepancy.operator_note && (
                          <div className="text-sm text-gray-500 mt-1">
                            Note: {discrepancy.operator_note}
                          </div>
                        )}
                      </div>
                      <Badge className={getStatusColor(discrepancy.status)}>
                        {discrepancy.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {job.discrepancies.length === 0 && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-12 text-center">
              <svg className="w-16 h-16 text-green-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xl font-semibold text-green-800 mb-2">
                Nessuna discrepanza!
              </div>
              <div className="text-green-700 mb-6">
                I documenti corrispondono perfettamente.
              </div>
              <Button onClick={() => router.push('/dashboard')}>
                Torna alla Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
