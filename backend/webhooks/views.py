import logging
import requests
import os
import uuid
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse
from django.conf import settings
from documents.models import Document
from documents.tasks import process_document

logger = logging.getLogger(__name__)


@csrf_exempt
def twilio_whatsapp_webhook(request):
    """
    Webhook endpoint for Twilio WhatsApp Sandbox.
    Receives messages and attachments (PDF, images) and triggers document processing.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        # Extract message data from Twilio
        from_number = request.POST.get('From', '')
        body = request.POST.get('Body', '')
        num_media = int(request.POST.get('NumMedia', 0))
        
        logger.info(f"Received WhatsApp message from {from_number}: {body}")
        logger.info(f"Number of media attachments: {num_media}")
        
        # Extract tenant from phone number (simplified - in production use proper mapping)
        # For now, use the first tenant or create based on phone number
        from tenants.models import Tenant
        tenant = Tenant.objects.first()
        
        if not tenant:
            return HttpResponse('No tenant configured', status=500)
        
        # Process media attachments if present
        documents_created = []
        
        for i in range(num_media):
            media_url = request.POST.get(f'MediaUrl{i}')
            media_type = request.POST.get(f'MediaContentType{i}')
            
            if not media_url:
                continue
            
            logger.info(f"Processing media {i}: {media_type} from {media_url}")
            
            # Download the media file
            try:
                response = requests.get(media_url, timeout=30)
                if response.status_code != 200:
                    logger.error(f"Failed to download media from {media_url}")
                    continue
                
                # Determine file extension from content type
                content_type_map = {
                    'application/pdf': '.pdf',
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'text/csv': '.csv',
                    'application/vnd.ms-excel': '.xls',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                }
                
                ext = content_type_map.get(media_type, '.bin')
                
                # Generate filename
                filename = f"whatsapp_{uuid.uuid4().hex[:8]}{ext}"
                
                # Save file to media directory
                from django.core.files.base import ContentFile
                from django.utils import timezone
                import io
                
                file_content = ContentFile(response.content)
                
                # Create document record
                document = Document.objects.create(
                    tenant=tenant,
                    filename=filename,
                    file_type=media_type,
                    status='pending',
                    uploaded_at=timezone.now(),
                    source='whatsapp',
                    source_metadata={
                        'from_number': from_number,
                        'message_body': body,
                        'media_url': media_url
                    }
                )
                
                # Save the file
                document.file.save(filename, file_content)
                document.save()
                
                # Trigger async processing
                process_document.delay(document.id)
                
                documents_created.append(document.id)
                logger.info(f"Created document {document.id} from WhatsApp")
                
            except Exception as e:
                logger.error(f"Error processing media {i}: {e}")
                continue
        
        # If no media but has text body, create a text document
        if num_media == 0 and body:
            from django.core.files.base import ContentFile
            import io
            
            filename = f"whatsapp_text_{uuid.uuid4().hex[:8]}.txt"
            file_content = ContentFile(body.encode('utf-8'))
            
            document = Document.objects.create(
                tenant=tenant,
                filename=filename,
                file_type='text/plain',
                status='pending',
                uploaded_at=timezone.now(),
                source='whatsapp',
                source_metadata={
                    'from_number': from_number,
                    'message_body': body
                }
            )
            
            document.file.save(filename, file_content)
            document.save()
            
            process_document.delay(document.id)
            documents_created.append(document.id)
            logger.info(f"Created text document {document.id} from WhatsApp message")
        
        # Return TwiML response (required by Twilio)
        response_message = f"Ricevuto {len(documents_created)} documento/i. Elaborazione in corso..."
        twiml_response = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{response_message}</Message></Response>'
        
        return HttpResponse(twiml_response, content_type='application/xml')
        
    except Exception as e:
        logger.error(f"Error in Twilio webhook: {e}")
        return HttpResponse('Error processing message', status=500)


@csrf_exempt
def mock_webhook(request):
    """
    Mock webhook endpoint for local testing.
    Simulates receiving a document via webhook.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        from tenants.models import Tenant
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.utils import timezone
        
        tenant = Tenant.objects.first()
        
        if not tenant:
            return JsonResponse({'error': 'No tenant configured'}, status=500)
        
        # Check if file is in request
        if 'file' not in request.FILES:
            return JsonResponse({'error': 'No file provided'}, status=400)
        
        uploaded_file = request.FILES['file']
        source = request.POST.get('source', 'mock')
        
        # Create document record
        document = Document.objects.create(
            tenant=tenant,
            filename=uploaded_file.name,
            file_type=uploaded_file.content_type,
            status='pending',
            uploaded_at=timezone.now(),
            source=source,
            source_metadata=request.POST.dict()
        )
        
        # Save the file
        document.file.save(uploaded_file.name, uploaded_file)
        document.save()
        
        # Trigger async processing
        process_document.delay(document.id)
        
        return JsonResponse({
            'status': 'received',
            'document_id': str(document.id),
            'filename': document.filename
        })
        
    except Exception as e:
        logger.error(f"Error in mock webhook: {e}")
        return JsonResponse({'error': str(e)}, status=500)
