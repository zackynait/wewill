import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from tenants.models import TenantMixin
from documents.models import Document


class JobStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    PROCESSING = 'processing', _('Processing')
    DONE = 'done', _('Done')
    ERROR = 'error', _('Error')


class DiscrepancyStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    APPROVED = 'approved', _('Approved')
    CORRECTED = 'corrected', _('Corrected')
    REJECTED = 'rejected', _('Rejected')


class DiscrepancyType(models.TextChoices):
    MISSING = 'missing', _('Missing')
    CHANGED = 'changed', _('Changed')
    EQUIVALENT_DIFFERENT = 'equivalent_different', _('Equivalent Different')


class ReconciliationScenario(models.TextChoices):
    ORDER_CONFIRMATION = 'order_confirmation', _('Order + Confirmation')
    PRICE_CONFIRMATION = 'price_confirmation', _('Price List + Price Confirmation')
    UNKNOWN = 'unknown', _('Unknown')


class ReconciliationJob(TenantMixin):
    """Reconciliation job linking two documents."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_1 = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='jobs_as_doc1',
        verbose_name=_('Document 1')
    )
    document_2 = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='jobs_as_doc2',
        verbose_name=_('Document 2')
    )
    status = models.CharField(
        max_length=20,
        choices=JobStatus.choices,
        default=JobStatus.PENDING,
        verbose_name=_('Status')
    )
    scenario = models.CharField(
        max_length=100,
        choices=ReconciliationScenario.choices,
        default=ReconciliationScenario.UNKNOWN,
        verbose_name=_('Scenario (auto-detected)')
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Created At'))
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Completed At'))
    
    class Meta:
        db_table = 'reconciliation_jobs'
        verbose_name = _('Reconciliation Job')
        verbose_name_plural = _('Reconciliation Jobs')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['document_1', 'document_2']),
        ]
    
    def __str__(self):
        return f"Job {self.id}: {self.document_1.filename} vs {self.document_2.filename}"


class Discrepancy(models.Model):
    """Discrepancy found during reconciliation."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(
        ReconciliationJob,
        on_delete=models.CASCADE,
        related_name='discrepancies',
        verbose_name=_('Job')
    )
    field_name = models.CharField(max_length=255, verbose_name=_('Field Name'))
    doc1_value = models.TextField(null=True, blank=True, verbose_name=_('Document 1 Value'))
    doc2_value = models.TextField(null=True, blank=True, verbose_name=_('Document 2 Value'))
    discrepancy_type = models.CharField(
        max_length=50,
        choices=DiscrepancyType.choices,
        verbose_name=_('Discrepancy Type')
    )
    status = models.CharField(
        max_length=20,
        choices=DiscrepancyStatus.choices,
        default=DiscrepancyStatus.PENDING,
        verbose_name=_('Status')
    )
    operator_note = models.TextField(null=True, blank=True, verbose_name=_('Operator Note'))
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Resolved At'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Created At'))
    
    class Meta:
        db_table = 'discrepancies'
        verbose_name = _('Discrepancy')
        verbose_name_plural = _('Discrepancies')
        ordering = ['job', 'field_name']
        indexes = [
            models.Index(fields=['job', 'status']),
            models.Index(fields=['discrepancy_type']),
        ]
    
    def __str__(self):
        return f"{self.field_name}: {self.discrepancy_type} ({self.status})"


class AuditLog(models.Model):
    """Audit log for tracking user actions."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='audit_logs',
        verbose_name=_('Tenant')
    )
    user = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
        verbose_name=_('User')
    )
    action = models.CharField(max_length=100, verbose_name=_('Action'))
    target_model = models.CharField(max_length=100, verbose_name=_('Target Model'))
    target_id = models.CharField(max_length=100, verbose_name=_('Target ID'))
    before = models.JSONField(null=True, blank=True, verbose_name=_('Before'))
    after = models.JSONField(null=True, blank=True, verbose_name=_('After'))
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name=_('Timestamp'))
    
    class Meta:
        db_table = 'audit_logs'
        verbose_name = _('Audit Log')
        verbose_name_plural = _('Audit Logs')
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant', 'user', 'timestamp']),
            models.Index(fields=['target_model', 'target_id']),
        ]
    
    def __str__(self):
        return f"{self.user} {self.action} {self.target_model} {self.target_id}"
