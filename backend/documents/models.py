import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from tenants.models import TenantMixin


class DocumentStatus(models.TextChoices):
    PENDING = 'pending', _('Pending')
    PROCESSING = 'processing', _('Processing')
    DONE = 'done', _('Done')
    ERROR = 'error', _('Error')


class FileType(models.TextChoices):
    PDF = 'pdf', _('PDF')
    CSV = 'csv', _('CSV')
    XLSX = 'xlsx', _('Excel')
    XLS = 'xls', _('Excel (Legacy)')


class Document(TenantMixin):
    """Document model for uploaded files (PDF, CSV, Excel)."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to='documents/%Y/%m/%d/', verbose_name=_('File'))
    file_type = models.CharField(
        max_length=10,
        choices=FileType.choices,
        verbose_name=_('File Type')
    )
    status = models.CharField(
        max_length=20,
        choices=DocumentStatus.choices,
        default=DocumentStatus.PENDING,
        verbose_name=_('Status')
    )
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Uploaded At'))
    processed_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Processed At'))
    extracted_data = models.JSONField(null=True, blank=True, verbose_name=_('Extracted Data'))
    error_message = models.TextField(null=True, blank=True, verbose_name=_('Error Message'))
    
    class Meta:
        db_table = 'documents'
        verbose_name = _('Document')
        verbose_name_plural = _('Documents')
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'file_type']),
            models.Index(fields=['uploaded_at']),
        ]
    
    def __str__(self):
        return f"{self.file.name} ({self.status})"
    
    @property
    def filename(self):
        """Get the original filename."""
        return self.file.name.split('/')[-1]
