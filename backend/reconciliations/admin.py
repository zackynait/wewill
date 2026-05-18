from django.contrib import admin
from .models import ReconciliationJob, Discrepancy, AuditLog


@admin.register(ReconciliationJob)
class ReconciliationJobAdmin(admin.ModelAdmin):
    list_display = ['id', 'document_1', 'document_2', 'status', 'scenario', 'tenant', 'created_at']
    list_filter = ['status', 'scenario', 'tenant', 'created_at']
    search_fields = ['id', 'document_1__file', 'document_2__file']
    readonly_fields = ['id', 'created_at', 'completed_at']


@admin.register(Discrepancy)
class DiscrepancyAdmin(admin.ModelAdmin):
    list_display = ['id', 'job', 'field_name', 'discrepancy_type', 'status', 'created_at']
    list_filter = ['discrepancy_type', 'status', 'created_at']
    search_fields = ['field_name', 'job__id']
    readonly_fields = ['id', 'created_at', 'resolved_at']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'action', 'target_model', 'target_id', 'timestamp']
    list_filter = ['action', 'target_model', 'timestamp', 'tenant']
    search_fields = ['user__email', 'action', 'target_model', 'target_id']
    readonly_fields = ['id', 'timestamp']
