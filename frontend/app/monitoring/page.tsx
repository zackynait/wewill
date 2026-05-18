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
  status: string;
  error_message: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

interface ReconciliationJob {
  id: string;
  document_1: { filename: string };
  document_2: { filename: string };
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  target_model: string;
  target_id: string;
  before: any;
  after: any;
  timestamp: string;
  user_email: string;
}

export default function MonitoringPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'errors' | 'success'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [docsRes, reconsRes, logsRes] = await Promise.all([
        api.get('/documents/'),
        api.get('/reconciliations/jobs/'),
        api.get('/reconciliations/audit-logs/')
      ]);
      
      setDocuments(docsRes.data.results || docsRes.data);
      setReconciliations(reconsRes.data.results || reconsRes.data);
      setAuditLogs(logsRes.data.results || logsRes.data);
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    if (filter === 'all') return true;
    if (filter === 'errors') return doc.status === 'error' || doc.error_message;
    if (filter === 'success') return doc.status === 'done';
    return true;
  });

  const filteredReconciliations = reconciliations.filter(recon => {
    if (filter === 'all') return true;
    if (filter === 'errors') return recon.status === 'error';
    if (filter === 'success') return recon.status === 'done';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-blue-100 text-blue-800';
      case 'update': return 'bg-purple-100 text-purple-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'complete_review': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const errorCount = documents.filter(d => d.status === 'error').length + 
                    reconciliations.filter(r => r.status === 'error').length;
  const successCount = documents.filter(d => d.status === 'done').length + 
                      reconciliations.filter(r => r.status === 'done').length;
  const pendingCount = documents.filter(d => d.status === 'pending').length + 
                      reconciliations.filter(r => r.status === 'pending').length;

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
                Monitoraggio Sistema
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Dashboard
              </Button>
              <Button onClick={fetchData} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                Aggiorna
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-gray-900">{documents.length}</div>
              <div className="text-sm text-gray-500">Totale Documenti</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-green-600">{successCount}</div>
              <div className="text-sm text-gray-500">Completati con Successo</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-red-600">{errorCount}</div>
              <div className="text-sm text-gray-500">Errori</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-yellow-600">{pendingCount}</div>
              <div className="text-sm text-gray-500">In Attesa</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setFilter('all')}
            variant={filter === 'all' ? 'default' : 'outline'}
            className={filter === 'all' ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            Tutti
          </Button>
          <Button
            onClick={() => setFilter('success')}
            variant={filter === 'success' ? 'default' : 'outline'}
            className={filter === 'success' ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            Solo Successi
          </Button>
          <Button
            onClick={() => setFilter('errors')}
            variant={filter === 'errors' ? 'default' : 'outline'}
            className={filter === 'errors' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            Solo Errori
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Documents */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Documenti</CardTitle>
              <CardDescription>Stato dei caricamenti ed elaborazioni</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredDocuments.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessun documento trovato</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className={`p-4 rounded-lg border-l-4 ${doc.status === 'error' ? 'border-l-red-500 bg-red-50' : 'border-l-blue-500 bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{doc.filename}</div>
                          <div className="text-sm text-gray-500">
                            Caricato: {new Date(doc.uploaded_at).toLocaleString('it-IT')}
                          </div>
                        </div>
                        <Badge className={getStatusColor(doc.status)}>
                          {doc.status}
                        </Badge>
                      </div>
                      {doc.error_message && (
                        <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-800">
                          <strong>Errore:</strong> {doc.error_message}
                        </div>
                      )}
                      {doc.processed_at && (
                        <div className="text-sm text-gray-600 mt-1">
                          Elaborato: {new Date(doc.processed_at).toLocaleString('it-IT')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reconciliations */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Riconciliazioni</CardTitle>
              <CardDescription>Stato dei processi di riconciliazione</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredReconciliations.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessuna riconciliazione trovata</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredReconciliations.map((recon) => (
                    <div key={recon.id} className={`p-4 rounded-lg border-l-4 ${recon.status === 'error' ? 'border-l-red-500 bg-red-50' : 'border-l-purple-500 bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {recon.document_1.filename} ↔ {recon.document_2.filename}
                          </div>
                          <div className="text-sm text-gray-500">
                            Creato: {new Date(recon.created_at).toLocaleString('it-IT')}
                          </div>
                        </div>
                        <Badge className={getStatusColor(recon.status)}>
                          {recon.status}
                        </Badge>
                      </div>
                      {recon.completed_at && (
                        <div className="text-sm text-gray-600 mt-1">
                          Completato: {new Date(recon.completed_at).toLocaleString('it-IT')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit Logs */}
        <Card className="border-0 shadow-lg mt-8">
          <CardHeader>
            <CardTitle className="text-xl">Log delle Attività</CardTitle>
            <CardDescription>Tracciamento delle azioni degli utenti</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Nessun log trovato</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getActionColor(log.action)}>
                            {log.action}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            {log.target_model}: {log.target_id}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500">
                          Utente: {log.user_email}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(log.timestamp).toLocaleString('it-IT')}
                        </div>
                      </div>
                    </div>
                    {(log.before || log.after) && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        {log.before && (
                          <div className="p-2 bg-yellow-50 rounded">
                            <div className="font-medium text-yellow-800">Prima:</div>
                            <pre className="text-xs text-yellow-700 overflow-x-auto">{JSON.stringify(log.before, null, 2)}</pre>
                          </div>
                        )}
                        {log.after && (
                          <div className="p-2 bg-green-50 rounded">
                            <div className="font-medium text-green-800">Dopo:</div>
                            <pre className="text-xs text-green-700 overflow-x-auto">{JSON.stringify(log.after, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
