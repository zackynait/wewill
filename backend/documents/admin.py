from django.contrib import admin
from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['id', 'filename', 'file_type', 'status', 'tenant', 'uploaded_at', 'processed_at']
    list_filter = ['status', 'file_type', 'tenant', 'uploaded_at']
    search_fields = ['file', 'id']
    readonly_fields = ['id', 'uploaded_at', 'processed_at']
