from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReconciliationJobViewSet, DiscrepancyViewSet, AuditLogViewSet

router = DefaultRouter()
router.register(r'jobs', ReconciliationJobViewSet, basename='reconciliationjob')
router.register(r'discrepancies', DiscrepancyViewSet, basename='discrepancy')
router.register(r'audit-logs', AuditLogViewSet, basename='auditlog')

urlpatterns = [
    path('', include(router.urls)),
]
