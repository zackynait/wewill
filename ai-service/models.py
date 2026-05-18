from pydantic import BaseModel, Field
from typing import Optional, List, Union
from datetime import datetime
from enum import Enum


class DiscrepancyType(str, Enum):
    MISSING = "missing"
    CHANGED = "changed"
    EQUIVALENT_DIFFERENT = "equivalent_different"


class DocumentLine(BaseModel):
    """Single line item in a document."""
    code: Optional[str] = Field(None, description="Product or service code")
    description: str = Field(..., description="Product or service description")
    quantity: Optional[float] = Field(None, description="Quantity")
    unit: Optional[str] = Field(None, description="Unit of measure")
    unit_price: Optional[float] = Field(None, description="Unit price")
    discount: Optional[Union[float, str]] = Field(None, description="Discount percentage or amount (can be number or complex like '50%+5%')")
    total: Optional[float] = Field(None, description="Line total")
    delivery_week: Optional[str] = Field(None, description="Delivery week")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score for this line")


class DocumentClassification(BaseModel):
    """Document classification result."""
    type: str = Field(..., description="Document type (e.g., 'ordine', 'conferma', 'listino', 'conferma_prezzi')")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Classification confidence")
    reasoning: str = Field(..., description="Reasoning for the classification")


class ExtractedDocument(BaseModel):
    """Structured extraction from a document."""
    document_type: str = Field(..., description="Type of document")
    supplier: Optional[str] = Field(None, description="Supplier name")
    customer: Optional[str] = Field(None, description="Customer name")
    document_number: Optional[str] = Field(None, description="Document number")
    document_date: Optional[str] = Field(None, description="Document date (ISO format)")
    due_date: Optional[str] = Field(None, description="Due date (ISO format)")
    total_amount: Optional[float] = Field(None, description="Total amount")
    currency: Optional[str] = Field(None, description="Currency code")
    iban: Optional[str] = Field(None, description="IBAN")
    abi: Optional[str] = Field(None, description="ABI code")
    cab: Optional[str] = Field(None, description="CAB code")
    bank: Optional[str] = Field(None, description="Bank name")
    payment_method: Optional[str] = Field(None, description="Payment method")
    payment_terms: Optional[str] = Field(None, description="Payment terms")
    porto: Optional[str] = Field(None, description="Porto/Shipping terms")
    transport_care_of: Optional[str] = Field(None, description="Transport care of")
    shipping_company: Optional[str] = Field(None, description="Shipping company")
    merchandise_value: Optional[float] = Field(None, description="Merchandise value")
    cash_discount_percent: Optional[float] = Field(None, description="Cash discount percentage")
    net_value: Optional[float] = Field(None, description="Net value")
    transport_costs: Optional[float] = Field(None, description="Transport costs")
    taxable_amount: Optional[float] = Field(None, description="Taxable amount (Imponibile)")
    vat_amount: Optional[float] = Field(None, description="VAT amount (I.v.a.)")
    commercial_ref: Optional[str] = Field(None, description="Commercial referent")
    supplier_email: Optional[str] = Field(None, description="Supplier email")
    destination_address: Optional[str] = Field(None, description="Destination address")
    agent: Optional[str] = Field(None, description="Agent")
    agency: Optional[str] = Field(None, description="Agency")
    lines: List[DocumentLine] = Field(default_factory=list, description="Line items")
    classification: DocumentClassification = Field(..., description="Document classification")
    overall_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Overall extraction confidence")
    processing_notes: List[str] = Field(default_factory=list, description="Notes about processing")


class ProcessRequest(BaseModel):
    """Request to process a document."""
    file_id: str = Field(..., description="Document ID")
    file_path: str = Field(..., description="Path to the file")
    tenant_id: str = Field(..., description="Tenant ID")


class ProcessResponse(BaseModel):
    """Response from document processing."""
    file_id: str
    status: str
    extracted_data: Optional[ExtractedDocument] = None
    error: Optional[str] = None
    processing_time: float


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    openai_configured: bool
    anthropic_configured: bool
    version: str = "1.0.0"
