export interface Document {
  id: string;
  tenant: string;
  file_path: string;
  file_type: 'pdf' | 'csv' | 'xlsx' | 'xls';
  status: 'pending' | 'processing' | 'done' | 'error';
  extracted_data?: {
    document_type?: string;
    supplier?: string;
    customer?: string;
    date?: string;
    lines?: Array<{
      code?: string;
      description?: string;
      quantity?: number;
      unit_price?: number;
      discount?: number;
      total?: number;
    }>;
  };
  processing_time?: number;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Discrepancy {
  id: string;
  job: string;
  tenant: string;
  type: 'missing' | 'changed' | 'equivalent_different';
  line_number_doc1?: number;
  line_number_doc2?: number;
  field: string;
  value_doc1?: any;
  value_doc2?: any;
  delta_absolute?: number;
  delta_percent?: number;
  description: string;
  operator_note?: string;
  status: 'pending' | 'approved' | 'corrected' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface ReconciliationJob {
  id: string;
  tenant: string;
  document_1: Document;
  document_2: Document;
  scenario?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface SSEEvent {
  document_id?: string;
  job_id?: string;
  status: string;
  message: string;
  timestamp: string;
}
