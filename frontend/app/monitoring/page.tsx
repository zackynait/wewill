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
  source?: string;
  file_type?: string;
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
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

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

  const handleDocumentClick = async (doc: Document) => {
    console.log('Clicked document:', doc);
    console.log('Document ID:', doc.id);
    try {
      const res = await api.get(`/documents/${doc.id}/`);
      console.log('Document details response:', res.data);
      console.log('File field:', res.data.file);
      console.log('File type:', res.data.file_type);
      console.log('Full URL:', `http://localhost:8000${res.data.file}`);
      setSelectedDocument(res.data);
      console.log('Selected document set:', res.data);
    } catch (error) {
      console.error('Error fetching document details:', error);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Monitoraggio Sistema
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/dashboard')} variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Dashboard
              </Button>
              <Button onClick={fetchData} className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 shadow-lg shadow-purple-500/30">
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
          <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-shadow">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-white">{documents.length}</div>
              <div className="text-sm text-cyan-300">Totale Documenti</div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-green-500/20 hover:shadow-green-500/40 transition-shadow">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-green-400">{successCount}</div>
              <div className="text-sm text-green-300">Completati con Successo</div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-red-500/20 hover:shadow-red-500/40 transition-shadow">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-red-400">{errorCount}</div>
              <div className="text-sm text-red-300">Errori</div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-yellow-500/20 hover:shadow-yellow-500/40 transition-shadow">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-yellow-400">{pendingCount}</div>
              <div className="text-sm text-yellow-300">In Attesa</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setFilter('all')}
            variant={filter === 'all' ? 'default' : 'outline'}
            className={filter === 'all' ? 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 shadow-lg shadow-purple-500/30' : 'border-white/20 text-white hover:bg-white/10'}
          >
            Tutti
          </Button>
          <Button
            onClick={() => setFilter('success')}
            variant={filter === 'success' ? 'default' : 'outline'}
            className={filter === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30' : 'border-white/20 text-white hover:bg-white/10'}
          >
            Solo Successi
          </Button>
          <Button
            onClick={() => setFilter('errors')}
            variant={filter === 'errors' ? 'default' : 'outline'}
            className={filter === 'errors' ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 shadow-lg shadow-red-500/30' : 'border-white/20 text-white hover:bg-white/10'}
          >
            Solo Errori
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Documents */}
          <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-purple-500/20">
            <CardHeader>
              <CardTitle className="text-xl text-white">Documenti</CardTitle>
              <CardDescription className="text-cyan-300">Stato dei caricamenti ed elaborazioni</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredDocuments.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessun documento trovato</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredDocuments.map((doc) => (
                    <div 
                      key={doc.id} 
                      className={`p-4 rounded-lg border-l-4 cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ${doc.status === 'error' ? 'border-l-red-500 bg-red-500/10 hover:bg-red-500/20' : 'border-l-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20'}`}
                      onClick={() => handleDocumentClick(doc)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-white">{doc.filename}</div>
                          <div className="text-sm text-cyan-300">
                            Caricato: {new Date(doc.uploaded_at).toLocaleString('it-IT')}
                          </div>
                          {doc.source && (
                            <div className="text-xs text-purple-300 mt-1">
                              Source: {doc.source}
                            </div>
                          )}
                        </div>
                        <Badge className={getStatusColor(doc.status)}>
                          {doc.status}
                        </Badge>
                      </div>
                      {doc.error_message && (
                        <div className="mt-2 p-2 bg-red-500/20 rounded text-sm text-red-300">
                          <strong>Errore:</strong> {doc.error_message}
                        </div>
                      )}
                      {doc.processed_at && (
                        <div className="text-sm text-green-300 mt-1">
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
          <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-purple-500/20">
            <CardHeader>
              <CardTitle className="text-xl text-white">Riconciliazioni</CardTitle>
              <CardDescription className="text-cyan-300">Stato dei processi di riconciliazione</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredReconciliations.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessuna riconciliazione trovata</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredReconciliations.map((recon) => (
                    <div key={recon.id} className={`p-4 rounded-lg border-l-4 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ${recon.status === 'error' ? 'border-l-red-500 bg-red-500/10 hover:bg-red-500/20' : 'border-l-purple-500 bg-purple-500/10 hover:bg-purple-500/20'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-white">
                            {recon.document_1.filename} ↔ {recon.document_2.filename}
                          </div>
                          <div className="text-sm text-cyan-300">
                            Creato: {new Date(recon.created_at).toLocaleString('it-IT')}
                          </div>
                        </div>
                        <Badge className={getStatusColor(recon.status)}>
                          {recon.status}
                        </Badge>
                      </div>
                      {recon.completed_at && (
                        <div className="text-sm text-green-300 mt-1">
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
        <Card className="bg-white/10 backdrop-blur-lg border-0 shadow-2xl shadow-purple-500/20 mt-8">
          <CardHeader>
            <CardTitle className="text-xl text-white">Log delle Attività</CardTitle>
            <CardDescription className="text-cyan-300">Tracciamento delle azioni degli utenti</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Nessun log trovato</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getActionColor(log.action)}>
                            {log.action}
                          </Badge>
                          <span className="text-sm text-cyan-300">
                            {log.target_model}: {log.target_id}
                          </span>
                        </div>
                        <div className="text-sm text-cyan-300">
                          Utente: {log.user_email}
                        </div>
                        <div className="text-sm text-cyan-300">
                          {new Date(log.timestamp).toLocaleString('it-IT')}
                        </div>
                      </div>
                    </div>
                    {(log.before || log.after) && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        {log.before && (
                          <div className="p-2 bg-yellow-500/10 rounded">
                            <div className="font-medium text-yellow-300">Prima:</div>
                            <pre className="text-xs text-yellow-200 overflow-x-auto">{JSON.stringify(log.before, null, 2)}</pre>
                          </div>
                        )}
                        {log.after && (
                          <div className="p-2 bg-green-500/10 rounded">
                            <div className="font-medium text-green-300">Dopo:</div>
                            <pre className="text-xs text-green-200 overflow-x-auto">{JSON.stringify(log.after, null, 2)}</pre>
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

      {/* Document Details Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-300">
          {console.log('Modal rendering with document:', selectedDocument)}
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl shadow-2xl shadow-purple-500/50 max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Dettagli Documento</h2>
                <button
                  onClick={() => setSelectedDocument(null)}
                  className="text-gray-400 hover:text-white text-2xl transition-colors hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-cyan-300">Nome File</div>
                    <div className="font-medium text-white">{selectedDocument.filename}</div>
                  </div>
                  <div>
                    <div className="text-sm text-cyan-300">Tipo</div>
                    <div className="font-medium text-white">{selectedDocument.file_type || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-cyan-300">Stato</div>
                    <Badge className={getStatusColor(selectedDocument.status)}>
                      {selectedDocument.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-sm text-cyan-300">Source</div>
                    <div className="font-medium text-white">{selectedDocument.source || 'dashboard'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-cyan-300">Caricato</div>
                    <div className="font-medium text-white">{new Date(selectedDocument.uploaded_at).toLocaleString('it-IT')}</div>
                  </div>
                  {selectedDocument.processed_at && (
                    <div>
                      <div className="text-sm text-cyan-300">Elaborato</div>
                      <div className="font-medium text-white">{new Date(selectedDocument.processed_at).toLocaleString('it-IT')}</div>
                    </div>
                  )}
                </div>
                {selectedDocument.error_message && (
                  <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                    <div className="text-sm text-red-300">
                      <strong>Errore:</strong> {selectedDocument.error_message}
                    </div>
                  </div>
                )}
                {selectedDocument.file_type === 'pdf' && selectedDocument.file && (
                  <div className="mt-4">
                    <div className="text-sm text-cyan-300 mb-2">Anteprima PDF</div>
                    <div className="bg-white/5 rounded-lg border border-white/10 p-2">
                      <iframe
                        src={`http://localhost:8000${selectedDocument.file}`}
                        className="w-full h-96 rounded-lg"
                        title="PDF Preview"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
