import asyncio
import base64
import re
from pathlib import Path
from typing import Optional
import logging
from pdf2image import convert_from_path
import pdfplumber
import io

from config import settings
from models import ExtractedDocument
from services.llm_service import llm_service

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Processor for PDF documents using pdfplumber text extraction + LLM, with OCR fallback."""
    
    def __init__(self):
        self.max_pages = settings.MAX_PAGES_PDF
        self.min_text_length = 500  # Minimum text length to consider extraction successful
    
    async def process_pdf(self, file_path: str, file_id: str) -> ExtractedDocument:
        """Process a PDF document and extract structured data."""
        try:
            logger.info(f"Processing PDF: {file_path}")
            
            # Step 1: Try to extract text with pdfplumber (fast, cheap)
            text_content = await self._extract_text_with_pdfplumber(file_path)
            
            # Step 2: Check if extracted text is sufficient
            if self._is_text_sufficient(text_content):
                logger.info(f"Text extraction successful with pdfplumber ({len(text_content)} chars)")
                
                # Classify document from text
                classification = await llm_service.classify_document(text_content)
                logger.info(f"Document classified as: {classification.type} (confidence: {classification.confidence})")
                
                # Extract data using text-only LLM (cheaper)
                extracted_data = await llm_service.extract_from_text(text_content, classification)
                
                logger.info(f"PDF extraction completed with confidence: {extracted_data.overall_confidence}")
                return extracted_data
            else:
                logger.warning(f"Text extraction insufficient ({len(text_content)} chars), falling back to OCR")
                # Fallback to OCR + Vision API
                return await self._process_with_vision(file_path)
            
        except Exception as e:
            logger.error(f"Error processing PDF {file_path}: {e}")
            # Try vision fallback if pdfplumber fails
            try:
                logger.info("Attempting vision fallback after pdfplumber error")
                return await self._process_with_vision(file_path)
            except Exception as vision_error:
                logger.error(f"Vision fallback also failed: {vision_error}")
                raise
    
    async def _extract_text_with_pdfplumber(self, file_path: str) -> str:
        """Extract text from PDF using pdfplumber."""
        def sync_extract():
            text_parts = []
            try:
                with pdfplumber.open(file_path) as pdf:
                    for i, page in enumerate(pdf.pages[:self.max_pages]):
                        page_text = page.extract_text()
                        if page_text:
                            text_parts.append(f"=== Page {i+1} ===\n{page_text}")
                return "\n\n".join(text_parts)
            except Exception as e:
                logger.error(f"pdfplumber extraction error: {e}")
                return ""
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_extract)
    
    def _is_text_sufficient(self, text: str) -> bool:
        """Check if extracted text is sufficient for LLM processing."""
        if not text or len(text.strip()) < self.min_text_length:
            return False
        
        # Check for meaningful content (not just whitespace/garbage)
        # Remove common whitespace
        cleaned = re.sub(r'\s+', ' ', text.strip())
        
        # Check if it contains some meaningful words/patterns
        meaningful_patterns = [
            r'\d{2,}',  # Numbers
            r'[a-zA-Z]{3,}',  # Words
            r'€|\$|GBP',  # Currency symbols
            r'total|importo|prezzo|quantità|qty',  # Common document terms
        ]
        
        pattern_matches = sum(1 for pattern in meaningful_patterns if re.search(pattern, cleaned, re.IGNORECASE))
        
        # Need at least 2 meaningful patterns
        return pattern_matches >= 2
    
    async def _process_with_vision(self, file_path: str) -> ExtractedDocument:
        """Process PDF using OCR + Vision API (fallback)."""
        logger.info("Using OCR + Vision API fallback")
        
        # Convert PDF to images
        images = await self._convert_pdf_to_images(file_path)
        logger.info(f"Converted PDF to {len(images)} images")
        
        # Convert first image to base64
        first_image_base64 = await self._image_to_base64(images[0])
        
        # Classify document from first page using OCR text
        ocr_text = await self._extract_text_from_image(images[0])
        classification = await llm_service.classify_document(ocr_text)
        logger.info(f"Document classified as: {classification.type} (confidence: {classification.confidence})")
        
        # Extract data using vision API
        extracted_data = await llm_service.extract_from_image(
            first_image_base64,
            classification
        )
        
        logger.info(f"PDF extraction completed with confidence: {extracted_data.overall_confidence}")
        return extracted_data
    
    async def _convert_pdf_to_images(self, file_path: str):
        """Convert PDF pages to images."""
        def sync_convert():
            return convert_from_path(
                file_path,
                dpi=200,
                first_page=1,
                last_page=self.max_pages
            )
        
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
        """Extract text from image using OCR (placeholder - could use Tesseract)."""
        # For now, return placeholder
        # In production, integrate Tesseract or Google Vision API
        return "[Image content - OCR would extract text here]"


# Singleton instance
pdf_processor = PDFProcessor()
