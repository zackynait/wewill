import asyncio
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
import logging
import pandas as pd
import openpyxl

from config import settings
from models import ExtractedDocument
from services.llm_service import llm_service

logger = logging.getLogger(__name__)


class CSVProcessor:
    """Processor for CSV/Excel documents with automatic format detection."""
    
    # Column name mappings (IT → EN)
    COLUMN_MAPPINGS = {
        # Italian
        'codice': 'code',
        'codice articolo': 'code',
        'descrizione': 'description',
        'quantità': 'quantity',
        'qty': 'quantity',
        'prezzo': 'unit_price',
        'prezzo unitario': 'unit_price',
        'sconto': 'discount',
        'totale': 'total',
        'importo': 'total',
        'data consegna': 'delivery_week',
        'unità': 'unit',
        # English
        'code': 'code',
        'item code': 'code',
        'sku': 'code',
        'description': 'description',
        'item': 'description',
        'quantity': 'quantity',
        'unit price': 'unit_price',
        'price': 'unit_price',
        'discount': 'discount',
        'total': 'total',
        'amount': 'total',
        'delivery week': 'delivery_week',
        'unit': 'unit',
    }
    
    def __init__(self):
        pass
    
    async def process_file(self, file_path: str, file_id: str) -> ExtractedDocument:
        """Process a CSV or Excel file and extract structured data."""
        try:
            logger.info(f"Processing file: {file_path}")
            
            # Detect file type
            file_ext = Path(file_path).suffix.lower()
            
            if file_ext in ['.xlsx', '.xls']:
                text_content = await self._process_excel(file_path)
            elif file_ext == '.csv':
                text_content = await self._process_csv(file_path)
            else:
                raise ValueError(f"Unsupported file type: {file_ext}")
            
            # Classify document
            classification = await llm_service.classify_document(text_content)
            logger.info(f"Document classified as: {classification.type} (confidence: {classification.confidence})")
            
            # Extract structured data
            extracted_data = await llm_service.extract_from_text(text_content, classification)
            
            logger.info(f"File extraction completed with confidence: {extracted_data.overall_confidence}")
            return extracted_data
            
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            raise
    
    async def _process_csv(self, file_path: str) -> str:
        """Process CSV file with automatic separator and header detection."""
        def sync_process():
            # Detect separator
            with open(file_path, 'r', encoding='utf-8') as f:
                sample = f.read(1024)
            
            sep = self._detect_separator(sample)
            logger.info(f"Detected separator: '{sep}'")
            
            # Detect header row
            df = pd.read_csv(file_path, sep=sep, encoding='utf-8', header=None, nrows=20)
            header_row = self._detect_header_row(df)
            logger.info(f"Detected header row: {header_row}")
            
            # Read with detected header
            df = pd.read_csv(file_path, sep=sep, encoding='utf-8', header=header_row)
            
            # Normalize column names (IT → EN)
            df = self._normalize_column_names(df)
            
            # Normalize numeric formats
            df = self._normalize_numeric_columns(df)
            
            # Convert to text representation
            return self._dataframe_to_text(df)
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_process)
    
    async def _process_excel(self, file_path: str) -> str:
        """Process Excel file with multi-sheet support."""
        def sync_process():
            # Load all sheets
            excel_file = pd.ExcelFile(file_path)
            logger.info(f"Found {len(excel_file.sheet_names)} sheets: {excel_file.sheet_names}")
            
            all_data = []
            
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, nrows=20)
                
                # Detect header row
                header_row = self._detect_header_row(df)
                logger.info(f"Sheet '{sheet_name}' - Detected header row: {header_row}")
                
                # Read with detected header
                df = pd.read_excel(excel_file, sheet_name=sheet_name, header=header_row)
                
                # Normalize column names (IT → EN)
                df = self._normalize_column_names(df)
                
                # Normalize numeric formats
                df = self._normalize_numeric_columns(df)
                
                all_data.append(f"=== Sheet: {sheet_name} ===\n{self._dataframe_to_text(df)}")
            
            return "\n\n".join(all_data)
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_process)
    
    def _detect_separator(self, sample: str) -> str:
        """Detect the most likely separator in a CSV file."""
        separators = [',', ';', '\t', '|']
        counts = {sep: sample.count(sep) for sep in separators}
        return max(counts, key=counts.get)
    
    def _detect_header_row(self, df: pd.DataFrame) -> int:
        """Detect the header row by finding the row with most non-numeric columns."""
        best_row = 0
        max_non_numeric = 0
        
        for idx, row in df.iterrows():
            non_numeric_count = sum(1 for val in row if not str(val).replace('.', '').replace(',', '').replace('-', '').isdigit())
            if non_numeric_count > max_non_numeric:
                max_non_numeric = non_numeric_count
                best_row = idx
        
        return best_row
    
    def _normalize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize column names to standard English names using IT/EN mapping."""
        new_columns = {}
        
        for col in df.columns:
            col_lower = str(col).lower().strip()
            # Remove special characters
            col_clean = re.sub(r'[^\w\s]', '', col_lower)
            # Map to standard name
            standard_name = self.COLUMN_MAPPINGS.get(col_clean, col_clean)
            new_columns[col] = standard_name
        
        df = df.rename(columns=new_columns)
        return df
    
    def _normalize_numeric_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize numeric formats (IT: 1.234,56 vs EN: 1,234.56)."""
        for col in df.columns:
            # Try to convert to numeric, handling both IT and EN formats
            if df[col].dtype == 'object':
                df[col] = df[col].astype(str)
                
                # Remove thousands separators and replace decimal separator
                df[col] = df[col].apply(self._normalize_number)
                
                # Try to convert to float
                try:
                    df[col] = pd.to_numeric(df[col], errors='ignore')
                except:
                    pass
        
        return df
    
    def _normalize_number(self, value: str) -> str:
        """Normalize a number string to standard format."""
        if not isinstance(value, str):
            return str(value)
        
        # Remove spaces
        value = value.strip()
        
        # Check if it's a number
        if not re.search(r'\d', value):
            return value
        
        # Italian format: 1.234,56 -> 1234.56
        if re.search(r'\.\d{3},\d+', value):
            value = value.replace('.', '').replace(',', '.')
        # English format: 1,234.56 -> 1234.56
        elif re.search(r',\d{3}\.\d+', value):
            value = value.replace(',', '')
        
        return value
    
    def _dataframe_to_text(self, df: pd.DataFrame) -> str:
        """Convert DataFrame to text representation for LLM processing."""
        output = []
        
        # Add column headers
        output.append("Columns: " + ", ".join(str(col) for col in df.columns))
        output.append("")
        
        # Add data rows (limit to first 100 rows)
        for idx, row in df.head(100).iterrows():
            row_str = ", ".join(f"{col}: {val}" for col, val in row.items() if pd.notna(val))
            output.append(f"Row {idx}: {row_str}")
        
        # Add summary if there are more rows
        if len(df) > 100:
            output.append(f"... ({len(df) - 100} more rows)")
        
        return "\n".join(output)


# Singleton instance
csv_processor = CSVProcessor()
