from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse


def api_root(request):
    """API root endpoint with available endpoints."""
    return JsonResponse({
        "service": "WeWill API",
        "version": "1.0.0",
        "endpoints": {
            "admin": "/admin/",
            "auth": "/api/auth/",
            "tenants": "/api/tenants/",
            "documents": "/api/documents/",
            "reconciliations": "/api/reconciliations/"
        }
    })


urlpatterns = [
    path('', api_root),
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),
    path('api/tenants/', include('tenants.urls')),
    path('api/documents/', include('documents.urls')),
    path('api/reconciliations/', include('reconciliations.urls')),
    path('api/webhooks/', include('webhooks.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
