from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
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
