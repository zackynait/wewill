import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from config import settings
from models import ProcessRequest, ProcessResponse, HealthResponse
from services.pdf_processor import pdf_processor
from services.csv_processor import csv_processor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    logger.info("Starting FastAPI AI Service...")
    logger.info(f"OpenAI configured: {settings.is_openai_configured}")
    logger.info(f"Anthropic configured: {settings.is_anthropic_configured}")
    yield
    logger.info("Shutting down FastAPI AI Service...")


# Create FastAPI app
app = FastAPI(
    title="WeWill AI Service",
    description="Microservizio per l'elaborazione di documenti con AI",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        openai_configured=settings.is_openai_configured,
        anthropic_configured=settings.is_anthropic_configured
    )


@app.post("/process/pdf", response_model=ProcessResponse)
async def process_pdf(request: ProcessRequest):
    """Process a PDF document with OCR + LLM extraction."""
    start_time = time.time()
    
    try:
        # Validate file exists
        file_path = Path(request.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
        
        # Process PDF
        extracted_data = await pdf_processor.process_pdf(
            str(file_path),
            request.file_id
        )
        
        processing_time = time.time() - start_time
        
        return ProcessResponse(
            file_id=request.file_id,
            status="success",
            extracted_data=extracted_data,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"Error processing PDF {request.file_id}: {e}")
        processing_time = time.time() - start_time
        
        return ProcessResponse(
            file_id=request.file_id,
            status="error",
            error=str(e),
            processing_time=processing_time
        )


@app.post("/process/csv", response_model=ProcessResponse)
async def process_csv(request: ProcessRequest):
    """Process a CSV/Excel document with parsing + LLM extraction."""
    start_time = time.time()
    
    try:
        # Validate file exists
        file_path = Path(request.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
        
        # Process CSV/Excel
        extracted_data = await csv_processor.process_file(
            str(file_path),
            request.file_id
        )
        
        processing_time = time.time() - start_time
        
        return ProcessResponse(
            file_id=request.file_id,
            status="success",
            extracted_data=extracted_data,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"Error processing CSV {request.file_id}: {e}")
        processing_time = time.time() - start_time
        
        return ProcessResponse(
            file_id=request.file_id,
            status="error",
            error=str(e),
            processing_time=processing_time
        )


@app.post("/process/excel", response_model=ProcessResponse)
async def process_excel(request: ProcessRequest):
    """Process an Excel document with parsing + LLM extraction (alias for CSV endpoint)."""
    return await process_csv(request)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "WeWill AI Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "process_pdf": "/process/pdf",
            "process_csv": "/process/csv",
            "process_excel": "/process/excel"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.FASTAPI_PORT,
        reload=settings.FASTAPI_DEBUG
    )
