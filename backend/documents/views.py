from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import FileResponse, Http404
from django.conf import settings
import os
from config.permissions import IsTenantUser
from .models import Document, DocumentStatus
from .serializers import DocumentSerializer, DocumentUploadSerializer


class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for Document model with tenant isolation."""
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated, IsTenantUser]
    
    def get_serializer_class(self):
        """Use upload serializer for create action."""
        if self.action == 'create':
            return DocumentUploadSerializer
        return DocumentSerializer
    
    def perform_create(self, serializer):
        """Automatically set tenant from current user."""
        serializer.save(tenant=self.request.user.tenant)
    
    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Trigger document processing (Celery task)."""
        document = self.get_object()
        
        if document.status != DocumentStatus.PENDING:
            return Response(
                {'error': 'Document is not in pending status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Trigger Celery task for document processing
        from .tasks import process_document
        task = process_document.delay(str(document.id))
        
        return Response(
            {
                'message': 'Document processing started',
                'task_id': task.id
            },
            status=status.HTTP_202_ACCEPTED
        )
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download the original document file."""
        document = self.get_object()
        
        if not document.file:
            raise Http404('File not found')
        
        file_path = document.file.path
        if not os.path.exists(file_path):
            raise Http404('File not found on disk')
        
        # Determine content type based on file type
        content_type = self._get_content_type(document.file_type)
        
        # Get filename
        filename = os.path.basename(file_path)
        
        return FileResponse(
            open(file_path, 'rb'),
            content_type=content_type,
            as_attachment=True,
            filename=filename
        )
    
    @action(detail=True, methods=['get'])
    def view(self, request, pk=None):
        """View the document file in browser (inline)."""
        document = self.get_object()
        
        if not document.file:
            raise Http404('File not found')
        
        file_path = document.file.path
        if not os.path.exists(file_path):
            raise Http404('File not found on disk')
        
        # Determine content type based on file type
        content_type = self._get_content_type(document.file_type)
        
        # Get filename
        filename = os.path.basename(file_path)
        
        return FileResponse(
            open(file_path, 'rb'),
            content_type=content_type,
            as_attachment=False,  # Inline view
            filename=filename
        )
    
    def _get_content_type(self, file_type):
        """Get content type based on file type."""
        content_types = {
            'pdf': 'application/pdf',
            'csv': 'text/csv',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel'
        }
        return content_types.get(file_type.lower(), 'application/octet-stream')
