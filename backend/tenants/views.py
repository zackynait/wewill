from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from config.permissions import IsTenantUser
from .models import Tenant
from .serializers import TenantSerializer


class TenantViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing tenants (read-only for regular users)."""
    
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated, IsTenantUser]
