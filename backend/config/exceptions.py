from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """Custom exception handler for consistent error responses."""
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)
    
    if response is not None:
        # Customize the error response
        custom_response_data = {
            'error': True,
            'status_code': response.status_code,
            'message': str(exc),
            'detail': response.data if hasattr(response, 'data') else None,
        }
        
        response.data = custom_response_data
    
    return response
