'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, X, Edit2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import api from '@/lib/api';
import { Discrepancy, ReconciliationJob, Document } from '@/types';

interface DiscrepancyReviewProps {
  jobId: string;
}

export function DiscrepancyReview({ jobId }: DiscrepancyReviewProps) {
  const [job, setJob] = useState<ReconciliationJob | null>(null);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');

  // Fetch job and discrepancies
  useEffect(() => {
    fetchJob();
    fetchDiscrepancies();
  }, [jobId]);

  // SSE connection for real-time updates
  useEffect(() => {
    const eventSource = new EventSource(`http://localhost:8000/api/events/?job_id=${jobId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.status === 'done') {
        fetchJob();
        fetchDiscrepancies();
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
    };
    
    return () => {
      eventSource.close();
    };
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const response = await api.get(`/api/reconciliations/jobs/${jobId}/`);
      setJob(response.data);
    } catch (error) {
      console.error('Failed to fetch job:', error);
    }
  };

  const fetchDiscrepancies = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/reconciliations/discrepancies/?job_id=${jobId}`);
      setDiscrepancies(response.data.results || response.data);
    } catch (error) {
      console.error('Failed to fetch discrepancies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.patch(`/api/reconciliations/discrepancies/${id}/`, {
        status: 'approved'
      });
      
      setDiscrepancies(prev => 
        prev.map(d => d.id === id ? { ...d, status: 'approved' } : d)
      );
    } catch (error) {
      console.error('Failed to approve discrepancy:', error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.patch(`/api/reconciliations/discrepancies/${id}/`, {
        status: 'rejected'
      });
      
      setDiscrepancies(prev => 
        prev.map(d => d.id === id ? { ...d, status: 'rejected' } : d)
      );
    } catch (error) {
      console.error('Failed to reject discrepancy:', error);
    }
  };

  const handleCorrect = async (id: string) => {
    try {
      await api.patch(`/api/reconciliations/discrepancies/${id}/`, {
        status: 'corrected',
        operator_note: correctionNote,
        // Add corrected value field if needed
      });
      
      setDiscrepancies(prev => 
        prev.map(d => d.id === id ? { ...d, status: 'corrected', operator_note: correctionNote } : d)
      );
      
      setCorrectingId(null);
      setCorrectionValue('');
      setCorrectionNote('');
    } catch (error) {
      console.error('Failed to correct discrepancy:', error);
    }
  };

  const handleCompleteReview = async () => {
    try {
      await api.post(`/api/reconciliations/jobs/${jobId}/complete/`);
      
      // Redirect or refresh
      window.location.reload();
    } catch (error) {
      console.error('Failed to complete review:', error);
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'changed':
        return 'yellow';
      case 'missing':
        return 'red';
      case 'equivalent_different':
        return 'orange';
      default:
        return 'default';
    }
  };

  const resolvedCount = discrepancies.filter(d => d.status !== 'pending').length;
  const totalCount = discrepancies.length;
  const progress = totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0;
  const allResolved = resolvedCount === totalCount && totalCount > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Reconciliation Review</h2>
            {job.scenario && (
              <Badge variant="secondary">{job.scenario}</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{resolvedCount} of {totalCount} discrepancies resolved</span>
            <Progress value={progress} className="w-48" />
          </div>
        </div>
        <Button
          onClick={handleCompleteReview}
          disabled={!allResolved}
          variant="default"
        >
          Complete Review
        </Button>
      </div>

      {/* Document columns */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-semibold">Document 1</h3>
          <div className="border rounded-lg p-4 bg-muted/50">
            {job.document_1.extracted_data && (
              <div className="space-y-2 text-sm">
                <p><strong>Type:</strong> {job.document_1.extracted_data.document_type || 'N/A'}</p>
                <p><strong>Supplier:</strong> {job.document_1.extracted_data.supplier || 'N/A'}</p>
                <p><strong>Customer:</strong> {job.document_1.extracted_data.customer || 'N/A'}</p>
                <p><strong>Date:</strong> {job.document_1.extracted_data.date || 'N/A'}</p>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Document 2</h3>
          <div className="border rounded-lg p-4 bg-muted/50">
            {job.document_2.extracted_data && (
              <div className="space-y-2 text-sm">
                <p><strong>Type:</strong> {job.document_2.extracted_data.document_type || 'N/A'}</p>
                <p><strong>Supplier:</strong> {job.document_2.extracted_data.supplier || 'N/A'}</p>
                <p><strong>Customer:</strong> {job.document_2.extracted_data.customer || 'N/A'}</p>
                <p><strong>Date:</strong> {job.document_2.extracted_data.date || 'N/A'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discrepancies list */}
      <div className="space-y-4">
        <h3 className="font-semibold">Discrepancies</h3>
        {discrepancies.length === 0 ? (
          <p className="text-muted-foreground">No discrepancies found</p>
        ) : (
          <div className="space-y-3">
            {discrepancies.map((discrepancy) => (
              <div
                key={discrepancy.id}
                className={`border rounded-lg p-4 ${
                  discrepancy.status === 'approved' ? 'bg-green-50 border-green-200' :
                  discrepancy.status === 'rejected' ? 'bg-red-50 border-red-200' :
                  discrepancy.status === 'corrected' ? 'bg-blue-50 border-blue-200' :
                  'bg-background'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getBadgeVariant(discrepancy.type)}>
                        {discrepancy.type}
                      </Badge>
                      <Badge variant={discrepancy.status === 'pending' ? 'default' : 'secondary'}>
                        {discrepancy.status}
                      </Badge>
                      <span className="text-sm font-medium">{discrepancy.field}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Doc1:</span>{' '}
                        <span className="font-medium">
                          {discrepancy.value_doc1 ?? 'N/A'}
                          {discrepancy.line_number_doc1 && ` (Line ${discrepancy.line_number_doc1})`}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Doc2:</span>{' '}
                        <span className="font-medium">
                          {discrepancy.value_doc2 ?? 'N/A'}
                          {discrepancy.line_number_doc2 && ` (Line ${discrepancy.line_number_doc2})`}
                        </span>
                      </div>
                    </div>
                    
                    {discrepancy.delta_absolute !== undefined && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Delta:</span>{' '}
                        <span className="font-medium">
                          {discrepancy.delta_absolute} 
                          {discrepancy.delta_percent && ` (${discrepancy.delta_percent.toFixed(2)}%)`}
                        </span>
                      </div>
                    )}
                    
                    {discrepancy.description && (
                      <p className="text-sm text-muted-foreground">{discrepancy.description}</p>
                    )}
                    
                    {discrepancy.operator_note && (
                      <p className="text-sm text-blue-600">
                        <span className="font-medium">Note:</span> {discrepancy.operator_note}
                      </p>
                    )}
                    
                    {correctingId === discrepancy.id && (
                      <div className="space-y-2 pt-2">
                        <input
                          type="text"
                          placeholder="Corrected value"
                          value={correctionValue}
                          onChange={(e) => setCorrectionValue(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                        />
                        <textarea
                          placeholder="Operator note"
                          value={correctionNote}
                          onChange={(e) => setCorrectionNote(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                  
                  {discrepancy.status === 'pending' && (
                    <div className="flex gap-2">
                      {correctingId === discrepancy.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleCorrect(discrepancy.id)}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCorrectingId(null);
                              setCorrectionValue('');
                              setCorrectionNote('');
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleApprove(discrepancy.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCorrectingId(discrepancy.id)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(discrepancy.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
