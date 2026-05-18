import re
import pandas as pd
import openpyxl
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class AdvancedCSVParser:
    """Advanced CSV/Excel parser with multi-format support."""
    
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
        'qty': 'quantity',
        'unit price': 'unit_price',
        'price': 'unit_price',
        'discount': 'discount',
        'total': 'total',
        'amount': 'total',
        'delivery week': 'delivery_week',
        'unit': 'unit',
    }
    
    def __init__(self):
        self.detected_format = None  # 'european' or 'american'
    
    def parse_file(self, file_path: str) -> Dict:
        """Parse CSV or Excel file with auto-detection of format."""
        try:
            file_ext = file_path.split('.')[-1].lower()
            
            if file_ext in ['xlsx', 'xls']:
                return self._parse_excel(file_path)
            elif file_ext == 'csv':
                return self._parse_csv(file_path)
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
                
        except Exception as e:
            logger.error(f"Error parsing file {file_path}: {e}")
            raise
    
    def _parse_excel(self, file_path: str) -> Dict:
        """Parse Excel file with multi-sheet support."""
        try:
            # Load all sheets
            excel_file = pd.ExcelFile(file_path)
            
            # Find the sheet with the most data (likely the main data sheet)
            best_sheet = None
            max_rows = 0
            
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None)
                if len(df) > max_rows:
                    max_rows = len(df)
                    best_sheet = sheet_name
            
            if not best_sheet:
                raise ValueError("No data found in Excel file")
            
            logger.info(f"Using sheet: {best_sheet} with {max_rows} rows")
            
            # Parse the best sheet
            return self._parse_dataframe(pd.read_excel(excel_file, sheet_name=best_sheet, header=None))
            
        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}")
            raise
    
    def _parse_csv(self, file_path: str) -> Dict:
        """Parse CSV file with auto-detection of delimiter and encoding."""
        try:
            # Try different delimiters
            delimiters = [';', ',', '\t', '|']
            best_df = None
            best_delimiter = None
            max_columns = 0
            
            for delimiter in delimiters:
                try:
                    df = pd.read_csv(file_path, delimiter=delimiter, header=None, encoding='utf-8')
                    if len(df.columns) > max_columns:
                        max_columns = len(df.columns)
                        best_df = df
                        best_delimiter = delimiter
                except:
                    continue
            
            if best_df is None:
                # Try with different encodings
                for encoding in ['latin-1', 'iso-8859-1', 'cp1252']:
                    try:
                        best_df = pd.read_csv(file_path, delimiter=',', header=None, encoding=encoding)
                        best_delimiter = ','
                        break
                    except:
                        continue
            
            if best_df is None:
                raise ValueError("Could not parse CSV file")
            
            logger.info(f"Detected delimiter: {best_delimiter}, columns: {max_columns}")
            
            return self._parse_dataframe(best_df)
            
        except Exception as e:
            logger.error(f"Error parsing CSV file: {e}")
            raise
    
    def _parse_dataframe(self, df: pd.DataFrame) -> Dict:
        """Parse DataFrame with auto-detection of header row and number format."""
        try:
            # Detect header row
            header_row = self._detect_header_row(df)
            logger.info(f"Detected header row: {header_row}")
            
            # Set header
            df.columns = df.iloc[header_row]
            df = df.drop(header_row).reset_index(drop=True)
            
            # Detect number format
            self._detect_number_format(df)
            logger.info(f"Detected number format: {self.detected_format}")
            
            # Normalize column names
            df = self._normalize_columns(df)
            
            # Convert numbers based on detected format
            df = self._convert_numbers(df)
            
            # Extract lines
            lines = self._extract_lines(df)
            
            return {
                'lines': lines,
                'header_row': header_row,
                'number_format': self.detected_format
            }
            
        except Exception as e:
            logger.error(f"Error parsing DataFrame: {e}")
            raise
    
    def _detect_header_row(self, df: pd.DataFrame) -> int:
        """Detect the header row by looking for common column names."""
        common_keywords = ['codice', 'code', 'descrizione', 'description', 'quantità', 'quantity', 
                          'prezzo', 'price', 'sconto', 'discount', 'totale', 'total']
        
        best_score = 0
        best_row = 0
        
        # Check first 10 rows
        for i in range(min(10, len(df))):
            row_text = ' '.join(str(cell).lower() for cell in df.iloc[i] if pd.notna(cell))
            score = sum(1 for keyword in common_keywords if keyword in row_text)
            
            if score > best_score:
                best_score = score
                best_row = i
        
        return best_row
    
    def _detect_number_format(self, df: pd.DataFrame):
        """Detect European vs American number format."""
        european_count = 0
        american_count = 0
        
        # Sample some cells to detect format
        for col in df.columns:
            sample_values = df[col].dropna().head(10)
            for val in sample_values:
                val_str = str(val)
                # European format: 1.234,56 (dot as thousands, comma as decimal)
                if re.search(r'\d{1,3}\.\d{3},\d{2}', val_str):
                    european_count += 1
                # American format: 1,234.56 (comma as thousands, dot as decimal)
                elif re.search(r'\d{1,3},\d{3}\.\d{2}', val_str):
                    american_count += 1
        
        self.detected_format = 'european' if european_count > american_count else 'american'
    
    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize column names to standard English names."""
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
    
    def _convert_numbers(self, df: pd.DataFrame) -> pd.DataFrame:
        """Convert string numbers to float based on detected format."""
        numeric_columns = ['quantity', 'unit_price', 'discount', 'total']
        
        for col in numeric_columns:
            if col in df.columns:
                df[col] = df[col].apply(self._parse_number)
        
        return df
    
    def _parse_number(self, value) -> Optional[float]:
        """Parse a number string based on detected format."""
        if pd.isna(value):
            return None
        
        value_str = str(value).strip()
        
        # Remove currency symbols and spaces
        value_str = re.sub(r'[€$£\s]', '', value_str)
        
        try:
            if self.detected_format == 'european':
                # European: 1.234,56 -> 1234.56
                value_str = value_str.replace('.', '').replace(',', '.')
            else:
                # American: 1,234.56 -> 1234.56
                value_str = value_str.replace(',', '')
            
            return float(value_str)
        except ValueError:
            return None
    
    def _extract_lines(self, df: pd.DataFrame) -> List[Dict]:
        """Extract line items from DataFrame."""
        lines = []
        
        # Find rows with actual data (skip empty rows and summary rows)
        for idx, row in df.iterrows():
            # Skip empty rows
            if row.isna().all():
                continue
            
            # Skip summary rows (rows with "totale", "sum", etc.)
            row_text = ' '.join(str(cell).lower() for cell in row if pd.notna(cell))
            if any(keyword in row_text for keyword in ['totale', 'sum', 'total', 'subtotale', 'subtotal']):
                continue
            
            # Extract line data
            line = {}
            for col in ['code', 'description', 'quantity', 'unit', 'unit_price', 'discount', 'total', 'delivery_week']:
                if col in df.columns:
                    value = row[col]
                    if pd.notna(value):
                        line[col] = value
            
            # Only add if we have at least code or description
            if line.get('code') or line.get('description'):
                lines.append(line)
        
        return lines


# Singleton instance
csv_parser = AdvancedCSVParser()
