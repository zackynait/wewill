from rest_framework import serializers
from .models import Document, DocumentStatus, FileType


class DocumentSerializer(serializers.ModelSerializer):
    filename = serializers.ReadOnlyField()
    
    class Meta:
        model = Document
        fields = [
            'id', 'tenant', 'file', 'file_type', 'status',
            'uploaded_at', 'processed_at', 'extracted_data',
            'error_message', 'filename', 'source', 'source_metadata'
        ]
        read_only_fields = ['id', 'uploaded_at', 'processed_at', 'filename']


class DocumentUploadSerializer(serializers.ModelSerializer):
    """Serializer for document upload."""
    filename = serializers.ReadOnlyField()
    
    class Meta:
        model = Document
        fields = ['id', 'file', 'file_type', 'filename', 'uploaded_at', 'status']
        read_only_fields = ['id', 'filename', 'uploaded_at', 'status']
    
    def create(self, validated_data):
        validated_data['status'] = DocumentStatus.PENDING
        return super().create(validated_data)
