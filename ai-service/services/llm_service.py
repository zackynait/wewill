import asyncio
import base64
from typing import Optional, Dict, Any, List
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import json
import logging

from config import settings
from models import ExtractedDocument, DocumentClassification, DocumentLine

logger = logging.getLogger(__name__)


class LLMService:
    """Service for LLM-based document extraction and classification."""
    
    def __init__(self):
        self.openai_client = None
        self.anthropic_client = None
        
        if settings.is_openai_configured:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            logger.info("OpenAI client initialized")
        
        if settings.is_anthropic_configured:
            self.anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            logger.info("Anthropic client initialized")
    
    async def classify_document(self, text_content: str) -> DocumentClassification:
        """Classify document type from text content."""
        classification_prompt = f"""
Analizza il seguente contenuto di un documento e classificalo.

Contenuto del documento:
{text_content[:5000]}

ISTRUZIONI IMPORTANTI PER LA CLASSIFICAZIONE:
1. Cerca parole chiave specifiche nel documento:
   - "CONFERMA D'ORDINE", "Conferma Ordine", "CO-" → classifica come "conferma"
   - "ORDINE CLIENTE", "Ordine Cliente", "ORD_CLI_", "OC-" → classifica come "ordine"
   - "LISTINO PREZZI", "Listino", "Price List" → classifica come "listino"
   - "CONFERMA PREZZI", "Conferma Prezzi", "Price Confirmation" → classifica come "conferma_prezzi"

2. Controlla il numero documento:
   - Se inizia con "CO-" → è una conferma ordine
   - Se contiene "ORD_CLI_" o "OC-" → è un ordine cliente

3. Analizza l'intestazione del documento:
   - Se dice "CONFERMA D'ORDINE" → conferma
   - Se dice "ORDINE CLIENTE" → ordine

Classifica il documento in una di queste categorie:
- ordine (ordine di acquisto / ordine cliente)
- conferma (conferma ordine)
- listino (listino prezzi)
- conferma_prezzi (conferma prezzi fornitore)
- altro (se non rientra nelle categorie sopra)

Rispondi con un JSON in questo formato:
{{
  "type": "tipo_documento",
  "confidence": 0.0-1.0,
  "reasoning": "spiegazione della classificazione"
}}
"""
        
        for attempt in range(settings.MAX_RETRIES):
            try:
                temperature = 0.0 if attempt > 0 else settings.OPENAI_TEMPERATURE
                
                if self.openai_client:
                    response = await self.openai_client.chat.completions.create(
                        model=settings.OPENAI_MODEL,
                        messages=[
                            {"role": "system", "content": "Sei un esperto nell'analisi di documenti aziendali."},
                            {"role": "user", "content": classification_prompt}
                        ],
                        temperature=temperature,
                        max_tokens=500,
                        response_format={"type": "json_object"}
                    )
                    
                    result = json.loads(response.choices[0].message.content)
                    return DocumentClassification(**result)
                
                elif self.anthropic_client:
                    response = await self.anthropic_client.messages.create(
                        model=settings.ANTHROPIC_MODEL,
                        max_tokens=500,
                        temperature=temperature,
                        messages=[
                            {"role": "user", "content": classification_prompt}
                        ]
                    )
                    
                    result = json.loads(response.content[0].text)
                    return DocumentClassification(**result)
                
                else:
                    raise ValueError("No LLM client configured")
                    
            except json.JSONDecodeError as e:
                logger.warning(f"JSON parse error on attempt {attempt + 1}: {e}")
                if attempt == settings.MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"LLM classification error on attempt {attempt + 1}: {e}")
                if attempt == settings.MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(2)
        
        # Fallback
        return DocumentClassification(
            type="altro",
            confidence=0.0,
            reasoning="Classification failed"
        )
    
    async def extract_from_text(self, text_content: str, classification: DocumentClassification) -> ExtractedDocument:
        """Extract structured data from text content using LLM with fallback strategy."""
        
        extraction_prompt = f"""
Estrai i dati strutturati dal seguente documento di tipo "{classification.type}" in formato tabellare JSON.

ISTRUZIONI IMPORTANTI:
1. Estrai i dati come TABELLA JSON strutturata
2. Per ogni riga articolo, estrai ESATTAMENTE questi campi: codice, descrizione, quantità, unità, prezzo unitario, sconto (%), totale, settimana consegna
3. Il campo "codice" è CRITICO - estrailo con massima precisione, INCLUDI TUTTI i caratteri (numeri, lettere, simboli) ESATTAMENTE come appaiono nel documento
4. Non inventare dati - se un campo non è presente, usa null
5. Per dati bancari: cerca attentamente sezioni come "Dati Bancari", "Coordinate Bancarie", "IBAN", "Banca", "Pagamento", "Modalità di pagamento"
6. Estrai: IBAN (se presente, formato ITXX...), ABI, CAB, Banca (nome istituto)

Contenuto del documento:
{text_content[:8000]}

Estrai:
- tipo documento: {classification.type}
- fornitore: nome del fornitore
- cliente: nome del cliente
- numero documento: numero del documento
- data documento: data del documento in formato ISO (YYYY-MM-DD)
- data scadenza: data di scadenza in formato ISO (YYYY-MM-DD)
- importo totale: importo totale del documento
- valuta: codice valuta (es. EUR, USD)
- IBAN: codice IBAN completo (cerca in tutto il documento)
- ABI: codice ABI bancario
- CAB: codice CAB bancario
- banca: nome della banca/istituto bancario
- modalita_pagamento: modalità di pagamento (es. Ri.Ba., Bonifico, etc.)
- scadenza_pagamento: termini di scadenza pagamento (es. 60gg d.f.f.m.)
- porto: porto/termini di spedizione (es. DAP, Franco)
- trasporto_curante: trasporto a cura di (es. DHL Supply Chain)
- righe: lista di righe come tabella JSON

Rispondi con un JSON in questo formato:
{{
  "document_type": "{classification.type}",
  "supplier": "nome fornitore",
  "customer": "nome cliente",
  "document_number": "numero documento",
  "document_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "total_amount": 0.0,
  "currency": "EUR",
  "iban": "codice IBAN completo (es. ITXX...)",
  "abi": "codice ABI bancario",
  "cab": "codice CAB bancario",
  "bank": "nome banca",
  "payment_method": "modalità pagamento (es. Ri.Ba.)",
  "payment_terms": "termini scadenza (es. 60gg d.f.f.m.)",
  "porto": "porto/termini spedizione",
  "transport_care_of": "trasporto a cura di",
  "lines": [
    {{
      "code": "codice articolo (ESATTO come nel documento, TUTTI i caratteri)",
      "description": "descrizione breve",
      "quantity": 0.0,
      "unit": "unità di misura",
      "unit_price": 0.0,
      "discount": 0.0,
      "total": 0.0,
      "delivery_week": "settimana consegna (es. 24ª sett.)",
      "confidence": 0.0-1.0
    }}
  ]
}}

IMPORTANTE:
- Il campo "code" deve essere ESTRATTO CON PRECISIONE dal documento, NON generato o semplificato
- Cerca IBAN, ABI, CAB in tutto il documento (spesso in fondo o in sezione "Pagamento")
- Se IBAN non è presente, cerca ABI/CAB (codici bancari italiani)
- Estrai sempre il nome della banca se presente
"""
        
        last_error = None
        processing_notes = []
        
        # Strategy 1: Try with default model
        for attempt in range(settings.MAX_RETRIES):
            try:
                temperature = 0.0 if attempt > 0 else settings.OPENAI_TEMPERATURE
                
                result = await self._call_llm(extraction_prompt, settings.OPENAI_MODEL, temperature)
                
                # Calculate confidence and check threshold
                lines = result.get("lines", [])
                line_confidences = [line.get("confidence", 0.5) for line in lines]
                overall_confidence = sum(line_confidences) / len(line_confidences) if line_confidences else 0.5
                
                # If confidence is acceptable, return result
                if overall_confidence >= settings.CONFIDENCE_THRESHOLD:
                    return ExtractedDocument(
                        **result,
                        classification=classification,
                        overall_confidence=overall_confidence,
                        processing_notes=processing_notes,
                        requires_manual_review=False
                    )
                else:
                    # Low confidence - try fallback model
                    processing_notes.append(f"Low confidence ({overall_confidence:.2f}) with {settings.OPENAI_MODEL}, trying fallback model")
                    logger.warning(f"Low confidence {overall_confidence:.2f} with {settings.OPENAI_MODEL}, trying fallback")
                    break
                    
            except json.JSONDecodeError as e:
                logger.warning(f"JSON parse error on attempt {attempt + 1} with {settings.OPENAI_MODEL}: {e}")
                processing_notes.append(f"JSON parse error attempt {attempt + 1}")
                last_error = e
                if attempt == settings.MAX_RETRIES - 1:
                    break
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"LLM extraction error on attempt {attempt + 1} with {settings.OPENAI_MODEL}: {e}")
                processing_notes.append(f"Error attempt {attempt + 1}: {str(e)}")
                last_error = e
                if attempt == settings.MAX_RETRIES - 1:
                    break
                await asyncio.sleep(2)
        
        # Strategy 2: Try with fallback model (more powerful)
        if settings.OPENAI_FALLBACK_MODEL and settings.OPENAI_FALLBACK_MODEL != settings.OPENAI_MODEL:
            logger.info(f"Trying fallback model: {settings.OPENAI_FALLBACK_MODEL}")
            processing_notes.append(f"Trying fallback model: {settings.OPENAI_FALLBACK_MODEL}")
            
            for attempt in range(2):  # Fewer retries for fallback model
                try:
                    result = await self._call_llm(extraction_prompt, settings.OPENAI_FALLBACK_MODEL, 0.0)
                    
                    lines = result.get("lines", [])
                    line_confidences = [line.get("confidence", 0.5) for line in lines]
                    overall_confidence = sum(line_confidences) / len(line_confidences) if line_confidences else 0.5
                    
                    if overall_confidence >= settings.CONFIDENCE_THRESHOLD:
                        processing_notes.append(f"Success with fallback model (confidence: {overall_confidence:.2f})")
                        return ExtractedDocument(
                            **result,
                            classification=classification,
                            overall_confidence=overall_confidence,
                            processing_notes=processing_notes,
                            requires_manual_review=False
                        )
                    else:
                        # Still low confidence - return partial with manual review flag
                        processing_notes.append(f"Low confidence even with fallback model ({overall_confidence:.2f})")
                        return ExtractedDocument(
                            **result,
                            classification=classification,
                            overall_confidence=overall_confidence,
                            processing_notes=processing_notes,
                            requires_manual_review=True
                        )
                        
                except Exception as e:
                    logger.error(f"Fallback model error on attempt {attempt + 1}: {e}")
                    processing_notes.append(f"Fallback error attempt {attempt + 1}: {str(e)}")
                    last_error = e
                    await asyncio.sleep(2)
        
        # Strategy 3: Escalation to human review (complete failure)
        logger.error(f"All extraction strategies failed for document. Last error: {last_error}")
        processing_notes.append("All extraction strategies failed - requires manual review")
        
        return ExtractedDocument(
            document_type=classification.type,
            classification=classification,
            overall_confidence=0.0,
            processing_notes=processing_notes,
            requires_manual_review=True
        )
    
    async def _call_llm(self, prompt: str, model: str, temperature: float) -> dict:
        """Helper method to call LLM with given model and temperature."""
        if self.openai_client:
            response = await self.openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Sei un esperto nell'estrazione di dati da documenti aziendali. Estrai i dati con precisione e assegna confidence scores realistici."},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=settings.OPENAI_MAX_TOKENS,
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        elif self.anthropic_client:
            response = await self.anthropic_client.messages.create(
                model=model,
                max_tokens=settings.OPENAI_MAX_TOKENS,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}]
            )
            return json.loads(response.content[0].text)
        else:
            raise ValueError("No LLM client configured")
    
    async def extract_from_image(self, image_base64: str, classification: DocumentClassification) -> ExtractedDocument:
        """Extract structured data from image using vision model with fallback strategy."""
        
        vision_prompt = f"""
Analizza questo documento di tipo "{classification.type}" ed estrai i dati strutturati in formato tabellare.

ISTRUZIONI IMPORTANTI:
1. Estrai i dati come TABELLA JSON strutturata
2. Per ogni riga articolo, estrai ESATTAMENTE questi campi: codice, descrizione, quantità, unità, prezzo unitario, sconto (%), totale, settimana consegna
3. Il campo "codice" è CRITICO - estrailo con massima precisione, INCLUDI TUTTI i caratteri (numeri, lettere, simboli) ESATTAMENTE come appaiono nel documento
4. Non inventare dati - se un campo non è presente, usa null
5. Per dati bancari: cerca attentamente sezioni come "Dati Bancari", "Coordinate Bancarie", "IBAN", "Banca", "Pagamento", "Modalità di pagamento"
6. Estrai: IBAN (se presente, formato ITXX...), ABI, CAB, Banca (nome istituto)

Estrai:
- tipo documento: {classification.type}
- fornitore: nome del fornitore
- cliente: nome del cliente
- numero documento: numero del documento
- data documento: data del documento in formato ISO (YYYY-MM-DD)
- data scadenza: data di scadenza in formato ISO (YYYY-MM-DD)
- importo totale: importo totale del documento
- valuta: codice valuta (es. EUR, USD)
- IBAN: codice IBAN completo (cerca in tutto il documento)
- ABI: codice ABI bancario
- CAB: codice CAB bancario
- banca: nome della banca/istituto bancario
- modalita_pagamento: modalità di pagamento (es. Ri.Ba., Bonifico, etc.)
- scadenza_pagamento: termini di scadenza pagamento (es. 60gg d.f.f.m.)
- porto: porto/termini di spedizione (es. DAP, Franco)
- trasporto_curante: trasporto a cura di (es. DHL Supply Chain)
- righe: lista di righe come tabella JSON

Rispondi con un JSON in questo formato:
{{
  "document_type": "{classification.type}",
  "supplier": "nome fornitore",
  "customer": "nome cliente",
  "document_number": "numero documento",
  "document_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "total_amount": 0.0,
  "currency": "EUR",
  "iban": "codice IBAN completo (es. ITXX...)",
  "abi": "codice ABI bancario",
  "cab": "codice CAB bancario",
  "bank": "nome banca",
  "payment_method": "modalità pagamento (es. Ri.Ba.)",
  "payment_terms": "termini scadenza (es. 60gg d.f.f.m.)",
  "porto": "porto/termini spedizione",
  "transport_care_of": "trasporto a cura di",
  "lines": [
    {{
      "code": "codice articolo (ESATTO come nel documento, TUTTI i caratteri)",
      "description": "descrizione breve",
      "quantity": 0.0,
      "unit": "unità di misura",
      "unit_price": 0.0,
      "discount": 0.0,
      "total": 0.0,
      "delivery_week": "settimana consegna (es. 24ª sett.)",
      "confidence": 0.0-1.0
    }}
  ]
}}

IMPORTANTE:
- Il campo "code" deve essere ESTRATTO CON PRECISIONE dal documento, NON generato o semplificato
- Cerca IBAN, ABI, CAB in tutto il documento (spesso in fondo o in sezione "Pagamento")
- Se IBAN non è presente, cerca ABI/CAB (codici bancari italiani)
- Estrai sempre il nome della banca se presente
"""
        
        last_error = None
        processing_notes = []
        
        # Strategy 1: Try with default model (vision)
        for attempt in range(settings.MAX_RETRIES):
            try:
                temperature = 0.0 if attempt > 0 else settings.OPENAI_TEMPERATURE
                
                result = await self._call_llm_vision(vision_prompt, image_base64, settings.OPENAI_MODEL, temperature)
                
                # Calculate confidence and check threshold
                lines = result.get("lines", [])
                line_confidences = [line.get("confidence", 0.5) for line in lines]
                overall_confidence = sum(line_confidences) / len(line_confidences) if line_confidences else 0.5
                
                # If confidence is acceptable, return result
                if overall_confidence >= settings.CONFIDENCE_THRESHOLD:
                    return ExtractedDocument(
                        **result,
                        classification=classification,
                        overall_confidence=overall_confidence,
                        processing_notes=processing_notes,
                        requires_manual_review=False
                    )
                else:
                    # Low confidence - try fallback model
                    processing_notes.append(f"Low confidence ({overall_confidence:.2f}) with {settings.OPENAI_MODEL}, trying fallback model")
                    logger.warning(f"Low confidence {overall_confidence:.2f} with {settings.OPENAI_MODEL}, trying fallback")
                    break
                    
            except json.JSONDecodeError as e:
                logger.warning(f"JSON parse error on attempt {attempt + 1} with {settings.OPENAI_MODEL}: {e}")
                processing_notes.append(f"JSON parse error attempt {attempt + 1}")
                last_error = e
                if attempt == settings.MAX_RETRIES - 1:
                    break
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Vision extraction error on attempt {attempt + 1} with {settings.OPENAI_MODEL}: {e}")
                processing_notes.append(f"Error attempt {attempt + 1}: {str(e)}")
                last_error = e
                if attempt == settings.MAX_RETRIES - 1:
                    break
                await asyncio.sleep(2)
        
        # Strategy 2: Try with fallback model (more powerful) if it supports vision
        if settings.OPENAI_FALLBACK_MODEL and settings.OPENAI_FALLBACK_MODEL != settings.OPENAI_MODEL:
            logger.info(f"Trying fallback model: {settings.OPENAI_FALLBACK_MODEL}")
            processing_notes.append(f"Trying fallback model: {settings.OPENAI_FALLBACK_MODEL}")
            
            for attempt in range(2):  # Fewer retries for fallback model
                try:
                    result = await self._call_llm_vision(vision_prompt, image_base64, settings.OPENAI_FALLBACK_MODEL, 0.0)
                    
                    lines = result.get("lines", [])
                    line_confidences = [line.get("confidence", 0.5) for line in lines]
                    overall_confidence = sum(line_confidences) / len(line_confidences) if line_confidences else 0.5
                    
                    if overall_confidence >= settings.CONFIDENCE_THRESHOLD:
                        processing_notes.append(f"Success with fallback model (confidence: {overall_confidence:.2f})")
                        return ExtractedDocument(
                            **result,
                            classification=classification,
                            overall_confidence=overall_confidence,
                            processing_notes=processing_notes,
                            requires_manual_review=False
                        )
                    else:
                        # Still low confidence - return partial with manual review flag
                        processing_notes.append(f"Low confidence even with fallback model ({overall_confidence:.2f})")
                        return ExtractedDocument(
                            **result,
                            classification=classification,
                            overall_confidence=overall_confidence,
                            processing_notes=processing_notes,
                            requires_manual_review=True
                        )
                        
                except Exception as e:
                    logger.error(f"Fallback model error on attempt {attempt + 1}: {e}")
                    processing_notes.append(f"Fallback error attempt {attempt + 1}: {str(e)}")
                    last_error = e
                    await asyncio.sleep(2)
        
        # Strategy 3: Escalation to human review (complete failure)
        logger.error(f"All vision extraction strategies failed for document. Last error: {last_error}")
        processing_notes.append("All vision extraction strategies failed - requires manual review")
        
        return ExtractedDocument(
            document_type=classification.type,
            classification=classification,
            overall_confidence=0.0,
            processing_notes=processing_notes,
            requires_manual_review=True
        )
    
    async def _call_llm_vision(self, prompt: str, image_base64: str, model: str, temperature: float) -> dict:
        """Helper method to call LLM with vision capabilities."""
        if self.openai_client:
            response = await self.openai_client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}"
                                }
                            }
                        ]
                    }
                ],
                temperature=temperature,
                max_tokens=settings.OPENAI_MAX_TOKENS,
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        else:
            raise ValueError("Only OpenAI supports vision for now")


# Singleton instance
llm_service = LLMService()
