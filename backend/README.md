# WeWill Backend - Django 5

Backend Django 5 con sistema multi-tenant nativo, JWT auth e API REST.

## Architettura Multi-Tenant

### Tenant Isolation Strategy
- **Tenant Model**: Ogni tenant ha UUID, name, slug, created_at
- **TenantMixin**: Mixin per modelli business con ForeignKey automatica a Tenant
- **TenantManager**: Manager custom che filtra automaticamente per tenant corrente
- **TenantMiddleware**: Estrae tenant dal JWT e lo mette in thread-local storage
- **IsTenantUser Permission**: Permission DRF per verificare ownership tenant

### Thread-Local Tenant
Il middleware estrae il tenant dal JWT token e lo rende disponibile via thread-local:
```python
from config.middleware import get_current_tenant
tenant = get_current_tenant()
```

## JWT Authentication

### Configuration
- **Access Token**: 15 minuti
- **Refresh Token**: 7 giorni
- **Token Rotation**: Abilitato
- **Blacklist**: Refresh token blacklist dopo rotation

### Endpoints
- `POST /api/auth/login/` - Login e ottieni token
- `POST /api/auth/refresh/` - Refresh access token
- `POST /api/auth/logout/` - Logout (blacklist refresh token)
- `POST /api/auth/verify/` - Verifica token validity
- `GET /api/auth/users/me/` - Get current user profile

### Token Payload
Il token JWT include:
- `user_id`: UUID dell'utente
- `email`: Email dell'utente
- `tenant_id`: UUID del tenant
- `tenant_slug`: Slug del tenant

## Modelli

### Tenant
```python
- id (UUID, PK)
- name (CharField)
- slug (SlugField, unique)
- created_at (DateTime)
```

### User (Custom User Model)
```python
- id (UUID, PK)
- email (EmailField, unique)
- first_name (CharField)
- last_name (CharField)
- tenant (ForeignKey → Tenant)
- is_active (BooleanField)
- is_staff (BooleanField)
- created_at (DateTime)
- updated_at (DateTime)
```

### Document
```python
- id (UUID, PK)
- tenant (ForeignKey → Tenant)
- file (FileField)
- file_type (Choice: pdf/csv/xlsx/xls)
- status (Choice: pending/processing/done/error)
- uploaded_at (DateTime)
- processed_at (DateTime)
- extracted_data (JSONField)
- error_message (TextField)
```

### ReconciliationJob
```python
- id (UUID, PK)
- tenant (ForeignKey → Tenant)
- document_1 (ForeignKey → Document)
- document_2 (ForeignKey → Document)
- status (Choice: pending/processing/done/error)
- scenario (CharField, auto-detected)
- created_at (DateTime)
- completed_at (DateTime)
```

### Discrepancy
```python
- id (UUID, PK)
- job (ForeignKey → ReconciliationJob)
- field_name (CharField)
- doc1_value (TextField)
- doc2_value (TextField)
- discrepancy_type (Choice: missing/changed/equivalent_different)
- status (Choice: pending/approved/corrected/rejected)
- operator_note (TextField)
- resolved_at (DateTime)
- created_at (DateTime)
```

### AuditLog
```python
- id (UUID, PK)
- tenant (ForeignKey → Tenant)
- user (ForeignKey → User)
- action (CharField)
- target_model (CharField)
- target_id (CharField)
- before (JSONField)
- after (JSONField)
- timestamp (DateTime)
```

## API Endpoints

### Tenants
- `GET /api/tenants/` - List tenants (read-only)

### Auth
- `POST /api/auth/login/` - Login
- `POST /api/auth/refresh/` - Refresh token
- `POST /api/auth/logout/` - Logout
- `GET /api/auth/users/` - List users
- `GET /api/auth/users/me/` - Current user profile

### Documents
- `GET /api/documents/` - List documents
- `POST /api/documents/` - Upload document
- `GET /api/documents/{id}/` - Get document
- `PUT /api/documents/{id}/` - Update document
- `DELETE /api/documents/{id}/` - Delete document
- `POST /api/documents/{id}/process/` - Trigger processing

### Reconciliations
- `GET /api/reconciliations/jobs/` - List reconciliation jobs
- `POST /api/reconciliations/jobs/` - Create job
- `GET /api/reconciliations/jobs/{id}/` - Get job
- `POST /api/reconciliations/jobs/{id}/start/` - Start reconciliation
- `GET /api/reconciliations/discrepancies/` - List discrepancies
- `GET /api/reconciliations/discrepancies/{id}/` - Get discrepancy
- `PUT /api/reconciliations/discrepancies/{id}/` - Update discrepancy
- `GET /api/reconciliations/audit-logs/` - List audit logs

## Setup

### Prerequisiti
- Python 3.11+
- PostgreSQL 16
- Redis 7

### Installazione
```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp ../.env.example ../.env

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server
python manage.py runserver
```

### Docker
```bash
# Build and start containers
make up

# Run migrations
make migrate

# Create superuser
make createsuperuser
```

## Development

### Run Celery Worker
```bash
celery -A config worker --loglevel=info --concurrency=4
```

### Run Celery Beat
```bash
celery -A config beat --loglevel=info
```

### Run Daphne (ASGI)
```bash
daphne -b 0.0.0.0 -p 8002 config.asgi:application
```

## Testing

### Run tests
```bash
python manage.py test
```

### Create test tenant and user
```python
from tenants.models import Tenant
from users.models import User

tenant = Tenant.objects.create(name="Test Tenant", slug="test-tenant")
user = User.objects.create_user(
    email="test@example.com",
    password="testpass123",
    tenant=tenant
)
```

## Multi-Tenant Data Isolation

Tutti i modelli business ereditano da `TenantMixin`:
- `Document`
- `ReconciliationJob`

Il `TenantManager` filtra automaticamente per tenant corrente. Il `TenantMiddleware` estrae il tenant dal JWT.

### Esempio
```python
# Questo query è automaticamente filtrato per tenant corrente
documents = Document.objects.all()

# Equivalente a:
from config.middleware import get_current_tenant
documents = Document.objects.filter(tenant=get_current_tenant())
```

## Audit Logging

Le azioni sugli oggetti vengono loggate automaticamente in `AuditLog`:
- User che ha fatto l'azione
- Azione eseguita
- Target model e ID
- Stato before/after
- Timestamp
