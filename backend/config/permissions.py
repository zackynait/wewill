from rest_framework import permissions


class IsTenantUser(permissions.BasePermission):
    """Permission to check if user belongs to the correct tenant."""
    
    def has_permission(self, request, view):
        """Check if user is authenticated."""
        return request.user and request.user.is_authenticated
    
    def has_object_permission(self, request, view, obj):
        """Check if object belongs to user's tenant."""
        if hasattr(obj, 'tenant'):
            return obj.tenant == request.user.tenant
        # If object doesn't have tenant field, allow access
        return True
