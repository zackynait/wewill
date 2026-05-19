# Architettura WeWill

## Diagramma Architettura Generale

```mermaid
graph TB
    subgraph "Frontend - Next.js 14"
        UI[Dashboard UI]
        AUTH[Auth Component]
    end
    
    subgraph "Backend - Django 5"
        API[REST API]
        MIDDLEWARE[Tenant Middleware]
        DOCS[Documents App]
        RECONC[Reconciliations App]
        USERS[Users App]
        TENANTS[Tenants App]
        WEBHOOK[Webhooks App]
    end
    
    subgraph "AI Microservice - FastAPI"
        PDF[PDF Processor]
        CSV[CSV/Excel Processor]
        LLM[LLM Service]
    end
    
    subgraph "Task Queue"
        CELERY[Celery Worker]
        BEAT[Celery Beat]
    end
    
    subgraph "Real-time"
        DAPHNE[Daphne ASGI]
        SSE[SSE Events]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL 16)]
        REDIS[(Redis 7)]
    end
    
    subgraph "External"
        TWILIO[Twilio WhatsApp]
        OPENAI[OpenAI/Anthropic]
    end
    
    UI -->|JWT Token| API
    AUTH -->|Login/Refresh| API
    API --> MIDDLEWARE
    MIDDLEWARE --> TENANTS
    API --> DOCS
    API --> RECONC
    API --> WEBHOOK
    
    DOCS -->|Queue Task| CELERY
    RECONC -->|Queue Task| CELERY
    
    CELERY -->|Process PDF| PDF
    CELERY -->|Process CSV| CSV
    PDF --> LLM
    CSV --> LLM
    
    LLM -->|API Call| OPENAI
    
    CELERY -->|Cache/Queue| REDIS
    DAPHNE -->|SSE| SSE
    SSE --> REDIS
    
    DOCS --> PG
    RECONC --> PG
    USERS --> PG
    TENANTS --> PG
    
    WEBHOOK -->|Receive| TWILIO
    WEBHOOK --> DOCS
    
    style UI fill:#3b82f6,color:#fff
    style API fill:#10b981,color:#fff
    style PDF fill:#f59e0b,color:#fff
    style LLM fill:#ef4444,color:#fff
    style PG fill:#8b5cf6,color:#fff
    style REDIS fill:#ec4899,color:#fff
```

## Flusso Completo Ingestione Documenti

```mermaid
sequenceDiagram
    participant User
    participant UI as Next.js UI
    participant API as Django API
    participant Celery as Celery Worker
    participant FastAPI as FastAPI AI
    participant LLM as OpenAI/Anthropic
    participant PG as PostgreSQL
    participant Redis as Redis
    
    User->>UI: Upload PDF/CSV
    UI->>API: POST /api/documents/ (JWT)
    API->>API: Tenant Middleware (isola tenant)
    API->>PG: Create Document (status: pending)
    API->>Celery: process_document.delay(doc_id)
    API-->>UI: Return doc_id
    
    Celery->>PG: Get Document
    Celery->>PG: Update status: processing
    Celery->>Redis: Emit SSE event (processing)
    
    alt PDF File
        Celery->>FastAPI: POST /process/pdf
        FastAPI->>FastAPI: pdfplumber extract text
        alt Text Sufficient
            FastAPI->>FastAPI: Use LLM text-only
        else Text Insufficient
            FastAPI->>FastAPI: OCR + Vision API
        end
    else CSV/Excel File
        Celery->>FastAPI: POST /process/csv
        FastAPI->>FastAPI: Parse with pandas
        FastAPI->>FastAPI: Normalize formats (IT/EN)
    end
    
    FastAPI->>LLM: Classify document
    LLM-->>FastAPI: Document type + confidence
    FastAPI->>LLM: Extract structured data
    LLM-->>FastAPI: JSON with confidence scores
    
    FastAPI-->>Celery: Extracted data
    Celery->>PG: Update extracted_data, status: done
    Celery->>Redis: Emit SSE event (done)
    
    UI->>Redis: Poll/SSE for updates
    Redis-->>UI: Status change notification
    UI->>UI: Show processing complete
```

## Flusso Riconciliazione

```mermaid
sequenceDiagram
    participant User
    participant UI as Next.js UI
    participant API as Django API
    participant Celery as Celery Worker
    participant PG as PostgreSQL
    participant Redis as Redis
    participant LLM as OpenAI/Anthropic
    
    User->>UI: Select doc1 + doc2
    UI->>API: POST /api/reconciliations/jobs/
    API->>PG: Create ReconciliationJob (status: pending)
    API->>Celery: reconcile_documents.delay(job_id)
    API-->>UI: Return job_id
    
    Celery->>PG: Get Job + Documents
    Celery->>Celery: detect_scenario(job_id)
    Celery->>LLM: Detect scenario (ordine+conferma / listino+prezzi)
    LLM-->>Celery: Scenario type
    Celery->>PG: Update scenario
    
    Celery->>Celery: _match_documents(lines1, lines2)
    
    Note over Celery: Pass 1: Exact match on code
    Celery->>Celery: Compare codes doc1 vs doc2
    Celery->>Celery: _compare_lines() for matches
    Celery->>PG: Create Discrepancy (CHANGED/MISSING)
    
    Note over Celery: Pass 2: Fuzzy match on description
    Celery->>Celery: rapidfuzz ratio (threshold 85%)
    Celery->>Celery: _compare_lines() for matches
    Celery->>PG: Create Discrepancy (CHANGED/MISSING)
    
    Note over Celery: Pass 3: LLM for ambiguous cases
    Celery->>LLM: Resolve ambiguous matches
    LLM-->>Celery: Resolved matches
    
    Celery->>PG: Update status: done
    Celery->>Redis: Emit SSE event (done)
    
    UI->>API: GET /api/reconciliations/jobs/{id}/
    API->>PG: Get Job + Discrepancies
    API-->>UI: Return job + discrepancies
    
    User->>UI: Review discrepancies
    UI->>API: PATCH /api/discrepancies/{id}/ (approve/correct/reject)
    API->>PG: Update Discrepancy status
    API->>PG: Create AuditLog entry
    API-->>UI: Success
    
    User->>UI: Complete review
    UI->>API: POST /api/reconciliations/jobs/{id}/complete_review/
    API->>PG: Mark job complete
    API-->>UI: Success
```

## Schema Database

```mermaid
erDiagram
    TENANTS ||--o{ USERS : "has many"
    TENANTS ||--o{ DOCUMENTS : "has many"
    TENANTS ||--o{ RECONCILIATION_JOBS : "has many"
    TENANTS ||--o{ AUDIT_LOGS : "has many"
    
    DOCUMENTS ||--o{ RECONCILIATION_JOBS : "doc1 in"
    DOCUMENTS ||--o{ RECONCILIATION_JOBS : "doc2 in"
    RECONCILIATION_JOBS ||--o{ DISCREPANCIES : "has many"
    USERS ||--o{ AUDIT_LOGS : "performs"
    
    TENANTS {
        uuid id PK
        string name
        string slug UK
        datetime created_at
    }
    
    USERS {
        uuid id PK
        uuid tenant_id FK
        string email
        string password_hash
        string role
        datetime created_at
    }
    
    DOCUMENTS {
        uuid id PK
        uuid tenant_id FK
        file file
        string file_type
        string status
        datetime uploaded_at
        datetime processed_at
        json extracted_data
        string error_message
        string source
        json source_metadata
    }
    
    RECONCILIATION_JOBS {
        uuid id PK
        uuid tenant_id FK
        uuid document_1_id FK
        uuid document_2_id FK
        string status
        string scenario
        datetime created_at
        datetime completed_at
    }
    
    DISCREPANCIES {
        uuid id PK
        uuid job_id FK
        string field_name
        string doc1_value
        string doc2_value
        string discrepancy_type
        string status
        string operator_note
        datetime resolved_at
        datetime created_at
    }
    
    AUDIT_LOGS {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        string action
        string target_model
        string target_id
        json before
        json after
        datetime timestamp
    }
```

## Gestione Errori e Retry

```mermaid
graph TB
    START[Start Task] --> TRY1[Try Default Model]
    
    TRY1 -->|Success| SUCCESS[Return Result]
    TRY1 -->|JSON Parse Error| RETRY1[Retry Temp=0]
    TRY1 -->|Low Confidence| RETRY1
    TRY1 -->|API Error| RETRY1
    
    RETRY1 -->|Success| SUCCESS
    RETRY1 -->|Fail| RETRY2[Retry Powerful Model]
    
    RETRY2 -->|Success| SUCCESS
    RETRY2 -->|Fail| PARTIAL[Partial Extraction]
    
    PARTIAL -->|Confidence < 0.5| MANUAL[Escalation Human]
    PARTIAL -->|Confidence >= 0.5| SUCCESS
    
    MANUAL --> CREATE[Create requires_manual_review flag]
    CREATE --> NOTIFY[Notify Operator via UI]
    
    style SUCCESS fill:#10b981,color:#fff
    style MANUAL fill:#f59e0b,color:#fff
    style RETRY1 fill:#ef4444,color:#fff
    style RETRY2 fill:#ef4444,color:#fff
```

## Multi-Tenant Isolation

```mermaid
graph LR
    subgraph "Request Flow"
        REQ[HTTP Request] --> AUTH[JWT Validation]
        AUTH --> MIDDLEWARE[Tenant Middleware]
    end
    
    subgraph "Tenant Resolution"
        MIDDLEWARE --> TOKEN[Extract tenant from JWT]
        TOKEN --> THREAD[Set thread-local tenant]
        THREAD --> QUERY[QuerySet Manager]
    end
    
    subgraph "Database Isolation"
        QUERY --> FILTER[Auto-filter by tenant_id]
        FILTER --> PG[(PostgreSQL)]
    end
    
    subgraph "Security Layers"
        AUTH -.-> MIDDLEWARE
        MIDDLEWARE -.-> QUERY
        QUERY -.-> FILTER
    end
    
    style AUTH fill:#3b82f6,color:#fff
    style MIDDLEWARE fill:#10b981,color:#fff
    style QUERY fill:#f59e0b,color:#fff
    style PG fill:#8b5cf6,color:#fff
```

## Deploy Architecture

```mermaid
graph TB
    subgraph "GitHub"
        REPO[Repository]
        ACTIONS[GitHub Actions]
    end
    
    subgraph "Docker Hub"
        DHUB[Docker Hub Registry]
    end
    
    subgraph "VPS - Hetzner"
        DOCKER[Docker Engine]
        COMPOSE[Docker Compose]
        WATCHTOWER[Watchtower]
    end
    
    subgraph "Containers"
        POSTGRES[PostgreSQL]
        REDIS[Redis]
        DJANGO[Django]
        DAPHNE[Daphne]
        CELERY[Celery Worker/Beat]
        FASTAPI[FastAPI AI]
        NEXTJS[Next.js]
    end
    
    REPO -->|Push| ACTIONS
    ACTIONS -->|Build & Push| DHUB
    DHUB -->|Pull| WATCHTOWER
    WATCHTOWER -->|Auto-update| DOCKER
    DOCKER -->|Orchestrate| COMPOSE
    COMPOSE --> POSTGRES
    COMPOSE --> REDIS
    COMPOSE --> DJANGO
    COMPOSE --> DAPHNE
    COMPOSE --> CELERY
    COMPOSE --> FASTAPI
    COMPOSE --> NEXTJS
    
    style REPO fill:#3b82f6,color:#fff
    style ACTIONS fill:#10b981,color:#fff
    style DHUB fill:#f59e0b,color:#fff
    style WATCHTOWER fill:#ef4444,color:#fff
```

## Tabelle Database

### Tabella: `tenants`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | UUID (PK) | Identificativo univoco |
| `name` | VARCHAR(255) | Nome tenant |
| `slug` | VARCHAR(255) (UK) | Slug URL-friendly |
| `created_at` | TIMESTAMP | Data creazione |

### Tabella: `users`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | UUID (PK) | Identificativo univoco |
| `tenant_id` | UUID (FK) | Tenant appartentenza |
| `email` | VARCHAR(255) (UK) | Email utente |
| `password_hash` | VARCHAR(255) | Hash password |
| `role` | VARCHAR(50) | Ruolo (admin/user) |
| `created_at` | TIMESTAMP | Data creazione |

### Tabella: `documents`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | UUID (PK) | Identificativo univoco |
| `tenant_id` | UUID (FK) | Tenant appartentenza |
| `file` | FILE | File documento |
| `file_type` | VARCHAR(10) | pdf/csv/xlsx/xls |
| `status` | VARCHAR(20) | pending/processing/done/error |
| `uploaded_at` | TIMESTAMP | Data upload |
| `processed_at` | TIMESTAMP | Data processing |
| `extracted_data` | JSON | Dati estratti |
| `error_message` | TEXT | Messaggio errore |
| `source` | VARCHAR(50) | dashboard/whatsapp/mock |
| `source_metadata` | JSON | Metadata sorgente |

### Tabella: `reconciliation_jobs`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | UUID (PK) | Identificativo univoco |
| `tenant_id` | UUID (FK) | Tenant appartentenza |
| `document_1_id` | UUID (FK) | Primo documento |
| `document_2_id` | UUID (FK) | Secondo documento |
| `status` | VARCHAR(20) | pending/processing/done/error |
| `scenario` | VARCHAR(100) | order_confirmation/price_confirmation/unknown |
| `created_at` | TIMESTAMP | Data creazione |
| `completed_at` | TIMESTAMP | Data completamento |

### Tabella: `discrepancies`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | UUID (PK) | Identificativo univoco |
| `job_id` | UUID (FK) | Job parent |
| `field_name` | VARCHAR(255) | Nome campo |
| `doc1_value` | TEXT | Valore documento 1 |
| `doc2_value` | TEXT | Valore documento 2 |
| `discrepancy_type` | VARCHAR(50) | missing/changed/equivalent_different |
| `status` | VARCHAR(20) | pending/approved/corrected/rejected |
| `operator_note` | TEXT | Note operatore |
| `resolved_at` | TIMESTAMP | Data risoluzione |
| `created_at` | TIMESTAMP | Data creazione |

### Tabella: `audit_logs`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | UUID (PK) | Identificativo univoco |
| `tenant_id` | UUID (FK) | Tenant appartentenza |
| `user_id` | UUID (FK) | Utente azione |
| `action` | VARCHAR(100) | Azione eseguita |
| `target_model` | VARCHAR(100) | Modello target |
| `target_id` | VARCHAR(100) | ID target |
| `before` | JSON | Stato prima |
| `after` | JSON | Stato dopo |
| `timestamp` | TIMESTAMP | Data azione |
