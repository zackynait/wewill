from django.urls import path
from .views import twilio_whatsapp_webhook, mock_webhook

app_name = 'webhooks'

urlpatterns = [
    path('twilio/whatsapp/', twilio_whatsapp_webhook, name='twilio_whatsapp'),
    path('mock/', mock_webhook, name='mock_webhook'),
]
