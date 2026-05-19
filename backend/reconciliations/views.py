from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import FileResponse, Http404
from config.permissions import IsTenantUser
from .models import ReconciliationJob, Discrepancy, AuditLog
from .serializers import (
    ReconciliationJobSerializer,
    ReconciliationJobCreateSerializer,
    DiscrepancySerializer,
    DiscrepancyUpdateSerializer,
    AuditLogSerializer
)


class ReconciliationJobViewSet(viewsets.ModelViewSet):
    """ViewSet for ReconciliationJob with tenant isolation."""
    queryset = ReconciliationJob.objects.select_related('document_1', 'document_2').prefetch_related('discrepancies')
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ReconciliationJobCreateSerializer
        return ReconciliationJobSerializer
    
    def perform_create(self, serializer):
        """Automatically set tenant from current user."""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Creating reconciliation with data: {self.request.data}")
        try:
            result = serializer.save(tenant=self.request.user.tenant)
            logger.info(f"Reconciliation created successfully: {result.id}")
        except Exception as e:
            logger.error(f"Error creating reconciliation: {e}")
            raise
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start reconciliation processing."""
        job = self.get_object()
        
        # Trigger Celery task for reconciliation
        from .tasks import reconcile_documents
        task = reconcile_documents.delay(str(job.id))
        
        return Response(
            {
                'message': 'Reconciliation started',
                'task_id': task.id
            },
            status=status.HTTP_202_ACCEPTED
        )
    
    @action(detail=True, methods=['post'])
    def complete_review(self, request, pk=None):
        """Mark the reconciliation review as complete."""
        job = self.get_object()
        
        # Check if all discrepancies are reviewed
        pending_count = job.discrepancies.filter(status='pending').count()
        if pending_count > 0:
            return Response(
                {'error': f'Ci sono ancora {pending_count} discrepanze da revisionare'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create audit log
        AuditLog.objects.create(
            tenant=request.user.tenant,
            user=request.user,
            action='complete_review',
            target_model='ReconciliationJob',
            target_id=str(job.id),
            before={'status': job.status},
            after={'status': 'reviewed'}
        )
        
        return Response(
            {'message': 'Revisione completata con successo'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['get'])
    def final_report(self, request, pk=None):
        """Generate final report with unified document and summary."""
        job = self.get_object()
        
        # Get all discrepancies with their final decisions
        discrepancies = job.discrepancies.all()
        
        # Build unified document based on decisions
        unified_data = self._build_unified_document(job, discrepancies)
        
        # Build summary
        summary = self._build_summary(discrepancies)
        
        # Get document file info
        doc1_info = self._get_document_info(job.document_1)
        doc2_info = self._get_document_info(job.document_2)
        
        return Response({
            'job_id': str(job.id),
            'scenario': job.scenario,
            'unified_document': unified_data,
            'summary': summary,
            'documents': {
                'document_1': doc1_info,
                'document_2': doc2_info
            },
            'completed_at': job.completed_at
        })
    
    def _build_unified_document(self, job, discrepancies):
        """Build unified document based on discrepancy decisions."""
        # Start with document 1 as base
        unified = job.document_1.extracted_data.copy() if job.document_1.extracted_data else {}
        
        # Apply decisions from discrepancies
        for discrepancy in discrepancies:
            if discrepancy.status == 'approved':
                # Use the approved value (doc1 or doc2 based on decision)
                if discrepancy.operator_note and 'doc2' in discrepancy.operator_note.lower():
                    unified[discrepancy.field_name] = discrepancy.doc2_value
                else:
                    unified[discrepancy.field_name] = discrepancy.doc1_value
            elif discrepancy.status == 'corrected' and discrepancy.operator_note:
                # Use manually corrected value
                unified[discrepancy.field_name] = discrepancy.operator_note
            elif discrepancy.status == 'rejected':
                # Keep doc1 value (default)
                unified[discrepancy.field_name] = discrepancy.doc1_value
        
        # Add metadata about decisions
        unified['_metadata'] = {
            'source_document': 'document_1',
            'decisions_applied': discrepancies.count(),
            'approved_count': discrepancies.filter(status='approved').count(),
            'corrected_count': discrepancies.filter(status='corrected').count(),
            'rejected_count': discrepancies.filter(status='rejected').count()
        }
        
        return unified
    
    def _build_summary(self, discrepancies):
        """Build summary of decisions."""
        return {
            'total_discrepancies': discrepancies.count(),
            'approved': discrepancies.filter(status='approved').count(),
            'corrected': discrepancies.filter(status='corrected').count(),
            'rejected': discrepancies.filter(status='rejected').count(),
            'pending': discrepancies.filter(status='pending').count(),
            'discrepancy_types': {
                'missing': discrepancies.filter(discrepancy_type='missing').count(),
                'changed': discrepancies.filter(discrepancy_type='changed').count(),
                'equivalent_different': discrepancies.filter(discrepancy_type='equivalent_different').count()
            }
        }
    
    def _get_document_info(self, document):
        """Get document info for download/view."""
        if not document:
            return None
        
        return {
            'id': str(document.id),
            'file_type': document.file_type,
            'status': document.status,
            'uploaded_at': document.uploaded_at.isoformat() if document.uploaded_at else None,
            'download_url': f'/api/documents/{document.id}/download/',
            'view_url': f'/api/documents/{document.id}/view/'
        }


class DiscrepancyViewSet(viewsets.ModelViewSet):
    """ViewSet for Discrepancy with tenant isolation."""
    queryset = Discrepancy.objects.select_related('job')
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return DiscrepancyUpdateSerializer
        return DiscrepancySerializer
    
    def get_queryset(self):
        """Filter discrepancies by job if job_id is provided."""
        queryset = super().get_queryset()
        job_id = self.request.query_params.get('job_id')
        if job_id:
            queryset = queryset.filter(job_id=job_id)
        return queryset
    
    def perform_update(self, serializer):
        """Log the update action."""
        instance = self.get_object()
        old_status = instance.status
        
        serializer.save()
        
        # Create audit log
        AuditLog.objects.create(
            tenant=self.request.user.tenant,
            user=self.request.user,
            action='update_discrepancy',
            target_model='Discrepancy',
            target_id=str(instance.id),
            before={'status': old_status},
            after={'status': instance.status, 'operator_note': instance.operator_note}
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for AuditLog with tenant isolation."""
    queryset = AuditLog.objects.select_related('user')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsTenantUser]
    
    def get_queryset(self):
        """Filter by current tenant."""
        return AuditLog.objects.filter(tenant=self.request.user.tenant)
