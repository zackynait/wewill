import logging
import time
from typing import Optional
import requests
from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from django.conf import settings

from .models import Document, DocumentStatus

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_document(self, document_id: str):
    """Process a document by calling FastAPI AI service."""
    logger.info(f"Starting document processing for document_id: {document_id}")
    
    try:
        # Retrieve document
        document = Document.objects.get(id=document_id)
        
        # Check if already processed
        if document.status != DocumentStatus.PENDING:
            logger.warning(f"Document {document_id} is not in pending status: {document.status}")
            return
        
        # Update status to processing
        document.status = DocumentStatus.PROCESSING
        document.save()
        
        # Emit SSE event
        _emit_sse_event(document.id, 'processing', 'Document processing started')
        
        # Determine FastAPI endpoint based on file type
        fastapi_url = f"http://{settings.FASTAPI_HOST}:{settings.FASTAPI_PORT}"
        
        if document.file_type == 'pdf':
            endpoint = f"{fastapi_url}/process/pdf"
        elif document.file_type in ['csv', 'xlsx', 'xls']:
            endpoint = f"{fastapi_url}/process/csv"
        else:
            raise ValueError(f"Unsupported file type: {document.file_type}")
        
        # Call FastAPI service
        payload = {
            "file_id": str(document.id),
            "file_path": f"/app/mediafiles/{document.file.name}",
            "tenant_id": str(document.tenant.id)
        }
        
        logger.info(f"Calling FastAPI endpoint: {endpoint}")
        response = requests.post(endpoint, json=payload, timeout=300)
        
        if response.status_code != 200:
            raise Exception(f"FastAPI returned status {response.status_code}: {response.text}")
        
        result = response.json()
        
        if result.get('status') != 'success':
            raise Exception(f"FastAPI processing failed: {result.get('error')}")
        
        # Save extracted data
        extracted_data = result.get('extracted_data')
        document.extracted_data = extracted_data
        document.processing_time = result.get('processing_time')
        
        # Update status to done
        document.status = DocumentStatus.DONE
        document.processed_at = timezone.now()
        document.save()
        
        # Emit SSE event
        _emit_sse_event(document.id, 'done', 'Document processing completed')
        
        logger.info(f"Document processing completed for document_id: {document_id}")
        
        return {
            'document_id': str(document.id),
            'status': 'done',
            'processing_time': document.processing_time
        }
        
    except Document.DoesNotExist:
        logger.error(f"Document not found: {document_id}")
        raise
    except requests.exceptions.Timeout:
        logger.error(f"Timeout processing document {document_id}")
        # Retry with exponential backoff
        raise self.retry(exc=Exception("Timeout"), countdown=60 * (2 ** self.request.retries))
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error processing document {document_id}: {e}")
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        
        # Update status to error
        try:
            document = Document.objects.get(id=document_id)
            document.status = DocumentStatus.ERROR
            document.error_message = str(e)
            document.save()
            
            # Emit SSE event
            _emit_sse_event(document.id, 'error', f'Document processing failed: {str(e)}')
        except Document.DoesNotExist:
            pass
        
        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
        
        return {
            'document_id': document_id,
            'status': 'error',
            'error': str(e)
        }


def _emit_sse_event(document_id: str, status: str, message: str):
    """Emit SSE event for document status change."""
    try:
        # Using django-eventstream or custom SSE implementation
        # For now, we'll use a simple cache-based approach
        event_data = {
            'document_id': document_id,
            'status': status,
            'message': message,
            'timestamp': timezone.now().isoformat()
        }
        
        # Store in cache for SSE consumers
        cache_key = f"doc_event_{document_id}"
        cache.set(cache_key, event_data, timeout=300)
        
        logger.debug(f"SSE event emitted for document {document_id}: {status}")
        
    except Exception as e:
        logger.error(f"Error emitting SSE event: {e}")


@shared_task
def batch_process_documents(document_ids: list):
    """Process multiple documents in batch."""
    logger.info(f"Starting batch processing for {len(document_ids)} documents")
    
    results = []
    for doc_id in document_ids:
        try:
            result = process_document.delay(doc_id)
            results.append({
                'document_id': doc_id,
                'task_id': result.id,
                'status': 'queued'
            })
        except Exception as e:
            logger.error(f"Error queuing document {doc_id}: {e}")
            results.append({
                'document_id': doc_id,
                'status': 'error',
                'error': str(e)
            })
    
    return results
