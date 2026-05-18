from rest_framework import serializers
from .models import ReconciliationJob, Discrepancy, AuditLog, DiscrepancyStatus
from documents.serializers import DocumentSerializer


class DiscrepancySerializer(serializers.ModelSerializer):
    class Meta:
        model = Discrepancy
        fields = [
            'id', 'job', 'field_name', 'doc1_value', 'doc2_value',
            'discrepancy_type', 'status', 'operator_note', 'resolved_at', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'resolved_at']


class ReconciliationJobSerializer(serializers.ModelSerializer):
    document_1 = DocumentSerializer(read_only=True)
    document_2 = DocumentSerializer(read_only=True)
    discrepancies = DiscrepancySerializer(many=True, read_only=True)
    
    class Meta:
        model = ReconciliationJob
        fields = [
            'id', 'tenant', 'document_1', 'document_2', 'status',
            'scenario', 'created_at', 'completed_at', 'discrepancies'
        ]
        read_only_fields = ['id', 'created_at', 'completed_at']


class ReconciliationJobCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a reconciliation job."""
    
    document_1_id = serializers.UUIDField(write_only=True)
    document_2_id = serializers.UUIDField(write_only=True)
    id = serializers.UUIDField(read_only=True)
    
    class Meta:
        model = ReconciliationJob
        fields = ['id', 'document_1_id', 'document_2_id']
    
    def create(self, validated_data):
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Creating reconciliation with validated_data: {validated_data}")
        
        document_1_id = validated_data.pop('document_1_id')
        document_2_id = validated_data.pop('document_2_id')
        
        logger.info(f"document_1_id: {document_1_id}, document_2_id: {document_2_id}")
        
        from documents.models import Document
        
        try:
            doc1 = Document.objects.get(id=document_1_id)
            doc2 = Document.objects.get(id=document_2_id)
            logger.info(f"Documents found: doc1={doc1.file.name}, doc2={doc2.file.name}")
        except Document.DoesNotExist as e:
            logger.error(f"Document not found: {e}")
            raise serializers.ValidationError("One or both documents not found")
        
        job = ReconciliationJob.objects.create(
            tenant=self.context['request'].user.tenant,
            document_1_id=document_1_id,
            document_2_id=document_2_id
        )
        logger.info(f"Reconciliation job created: {job.id}")
        return job


class DiscrepancyUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating discrepancy status and values."""
    
    class Meta:
        model = Discrepancy
        fields = ['status', 'operator_note', 'doc1_value', 'doc2_value']
    
    def update(self, instance, validated_data):
        from django.utils import timezone
        
        if 'status' in validated_data and validated_data['status'] != instance.status:
            validated_data['resolved_at'] = timezone.now()
        
        return super().update(instance, validated_data)


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'tenant', 'user', 'user_email', 'action',
            'target_model', 'target_id', 'before', 'after', 'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']
