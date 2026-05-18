import asyncio
import base64
from pathlib import Path
from typing import Optional
import logging
from pdf2image import convert_from_path
import io

from config import settings
from models import ExtractedDocument
from services.llm_service import llm_service

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Processor for PDF documents using OCR + LLM Vision."""
    
    def __init__(self):
        self.max_pages = settings.MAX_PAGES_PDF
    
    async def process_pdf(self, file_path: str, file_id: str) -> ExtractedDocument:
        """Process a PDF document and extract structured data."""
        try:
            logger.info(f"Processing PDF: {file_path}")
            
            # Convert PDF to images
            images = await self._convert_pdf_to_images(file_path)
            logger.info(f"Converted PDF to {len(images)} images")
            
            # Convert first image to base64 for classification
            first_image_base64 = await self._image_to_base64(images[0])
            
            # Classify document from first page
            from .llm_service import llm_service
            classification = await llm_service.classify_document(
                await self._extract_text_from_image(images[0])
            )
            logger.info(f"Document classified as: {classification.type} (confidence: {classification.confidence})")
            
            # Extract data from first page (or combine multiple pages if needed)
            extracted_data = await llm_service.extract_from_image(
                first_image_base64,
                classification
            )
            
            logger.info(f"PDF extraction completed with confidence: {extracted_data.overall_confidence}")
            return extracted_data
            
        except Exception as e:
            logger.error(f"Error processing PDF {file_path}: {e}")
            raise
    
    async def _convert_pdf_to_images(self, file_path: str):
        """Convert PDF pages to images."""
        def sync_convert():
            return convert_from_path(
                file_path,
                dpi=200,
                first_page=1,
                last_page=self.max_pages
            )
        
        # Run in thread pool since pdf2image is blocking
        loop = asyncio.get_event_loop()
        images = await loop.run_in_executor(None, sync_convert)
        return images
    
    async def _image_to_base64(self, image) -> str:
        """Convert PIL image to base64 string."""
        def sync_convert():
            buffered = io.BytesIO()
            image.save(buffered, format="JPEG", quality=85)
            return base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_convert)
    
    async def _extract_text_from_image(self, image) -> str:
        """Extract text from image using OCR (placeholder for now)."""
        # For now, we'll use a simple placeholder
        # In production, you might use Tesseract or Google Vision API
        return "[Image content - OCR would extract text here]"


# Singleton instance
pdf_processor = PDFProcessor()
