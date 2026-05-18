import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


class Tenant(models.Model):
    """Tenant model for multi-tenant architecture."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, verbose_name=_('Tenant Name'))
    slug = models.SlugField(max_length=255, unique=True, verbose_name=_('Slug'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Created At'))
    
    class Meta:
        db_table = 'tenants'
        verbose_name = _('Tenant')
        verbose_name_plural = _('Tenants')
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class TenantManager(models.Manager):
    """Custom manager that filters by current tenant automatically."""
    
    def get_queryset(self):
        """Filter queryset by current tenant from thread-local storage."""
        from config.middleware import get_current_tenant
        
        queryset = super().get_queryset()
        current_tenant = get_current_tenant()
        
        if current_tenant:
            # Filter by tenant if model has tenant field
            if hasattr(self.model, 'tenant'):
                queryset = queryset.filter(tenant=current_tenant)
        
        return queryset


class TenantMixin(models.Model):
    """Mixin to add tenant field and manager to models."""
    
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='%(class)ss',
        verbose_name=_('Tenant')
    )
    
    objects = TenantManager()
    
    class Meta:
        abstract = True
    
    def save(self, *args, **kwargs):
        """Automatically set tenant from current context if not set."""
        from config.middleware import get_current_tenant
        
        if not self.tenant_id:
            current_tenant = get_current_tenant()
            if current_tenant:
                self.tenant = current_tenant
        
        super().save(*args, **kwargs)
