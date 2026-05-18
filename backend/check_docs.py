import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from documents.models import Document

# Get all documents with extracted data
docs = Document.objects.filter(status='done').order_by('-uploaded_at')[:4]
print(f'Total documents with extracted data: {docs.count()}')
for d in docs:
    print(f'\n=== {d.filename} ===')
    print(f'Status: {d.status}')
    if d.extracted_data:
        lines = d.extracted_data.get('lines', [])
        print(f'Total lines: {len(lines)}')
        print(f'Document type: {d.extracted_data.get("document_type")}')
        print(f'Customer: {d.extracted_data.get("customer")}')
        for i, line in enumerate(lines):
            print(f'Line {i}: code={line.get("code")}, quantity={line.get("quantity")}, unit_price={line.get("unit_price")}')
    else:
        print('No extracted data')
