import threading
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication


# Thread-local storage for tenant
_tenant_local = threading.local()


def get_current_tenant():
    """Get the current tenant from thread-local storage."""
    return getattr(_tenant_local, 'tenant', None)


def set_current_tenant(tenant):
    """Set the current tenant in thread-local storage."""
    _tenant_local.tenant = tenant


def clear_current_tenant():
    """Clear the current tenant from thread-local storage."""
    if hasattr(_tenant_local, 'tenant'):
        delattr(_tenant_local, 'tenant')


class TenantMiddleware:
    """Middleware to extract tenant from JWT and set it in thread-local storage."""
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt_auth = JWTAuthentication()

    def __call__(self, request):
        # Clear any previous tenant
        clear_current_tenant()
        
        # Try to authenticate and extract tenant
        try:
            user_auth_tuple = self.jwt_auth.authenticate(request)
            if user_auth_tuple is not None:
                user, _ = user_auth_tuple
                if not isinstance(user, AnonymousUser) and hasattr(user, 'tenant'):
                    set_current_tenant(user.tenant)
        except Exception:
            # If authentication fails, continue without tenant
            pass
        
        response = self.get_response(request)
        
        # Clear tenant after request
        clear_current_tenant()
        
        return response
