import logging
from typing import Dict, List, Tuple, Optional
from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from rapidfuzz import fuzz, process

from .models import ReconciliationJob, Discrepancy, DiscrepancyType, DiscrepancyStatus, JobStatus, ReconciliationScenario
from documents.models import Document

logger = logging.getLogger(__name__)


@shared_task
def reconcile_documents(job_id: str):
    """Reconcile two documents and detect discrepancies."""
    logger.info(f"Starting reconciliation for job_id: {job_id}")
    
    try:
        # Retrieve job
        job = ReconciliationJob.objects.get(id=job_id)
        
        # Check status
        if job.status != JobStatus.PENDING:
            logger.warning(f"Job {job_id} is not in pending status: {job.status}")
            return
        
        # Update status
        job.status = JobStatus.PROCESSING
        job.save()
        
        # Retrieve documents
        doc1 = job.document_1
        doc2 = job.document_2
        
        # Check if documents are processed
        if not doc1.extracted_data or not doc2.extracted_data:
            raise Exception("Both documents must be processed before reconciliation")
        
        # Detect scenario first
        detect_scenario(job_id)
        
        # Re-fetch job to get the detected scenario
        job.refresh_from_db()
        
        # Extract line items
        lines1 = doc1.extracted_data.get('lines', [])
        lines2 = doc2.extracted_data.get('lines', [])
        
        logger.info(f"Reconciling {len(lines1)} lines from doc1 with {len(lines2)} lines from doc2")
        logger.info(f"Detected scenario: {job.scenario}")
        
        # Perform matching based on scenario
        discrepancies = _match_documents(lines1, lines2, job.scenario)
        
        # Save discrepancies
        with transaction.atomic():
            # Clear old discrepancies
            Discrepancy.objects.filter(job=job).delete()
            
            # Create new discrepancies
            for discrepancy_data in discrepancies:
                # Map fields to match the Discrepancy model
                mapped_data = {
                    'field_name': discrepancy_data.get('field', 'unknown'),
                    'doc1_value': str(discrepancy_data.get('doc1_value')) if discrepancy_data.get('doc1_value') is not None else None,
                    'doc2_value': str(discrepancy_data.get('doc2_value')) if discrepancy_data.get('doc2_value') is not None else None,
                    'discrepancy_type': discrepancy_data.get('type', DiscrepancyType.MISSING),
                }
                Discrepancy.objects.create(
                    job=job,
                    **mapped_data
                )
        
        # Update job status
        job.status = JobStatus.DONE
        job.completed_at = timezone.now()
        job.save()
        
        logger.info(f"Reconciliation completed for job_id: {job_id} with {len(discrepancies)} discrepancies")
        
        return {
            'job_id': job_id,
            'status': 'done',
            'discrepancies_count': len(discrepancies)
        }
        
    except ReconciliationJob.DoesNotExist:
        logger.error(f"Job not found: {job_id}")
        raise
    except Exception as e:
        logger.error(f"Error reconciling documents for job {job_id}: {e}")
        
        try:
            job = ReconciliationJob.objects.get(id=job_id)
            job.status = JobStatus.ERROR
            job.save()
        except ReconciliationJob.DoesNotExist:
            pass
        
        raise


def _match_documents(lines1: List[Dict], lines2: List[Dict], scenario: str = ReconciliationScenario.UNKNOWN) -> List[Dict]:
    """Match line items between two documents and detect discrepancies based on scenario."""
    logger.info(f"Matching documents with scenario: {scenario}")
    
    # Different matching logic based on scenario
    if scenario == ReconciliationScenario.ORDER_CONFIRMATION:
        # Order + Confirmation: verify qty, price, rows, discounts, item codes
        return _match_order_confirmation(lines1, lines2)
    elif scenario == ReconciliationScenario.PRICE_CONFIRMATION:
        # Price List + Price Confirmation: verify prices item-by-item, flag deviations from reference price list
        return _match_price_confirmation(lines1, lines2)
    else:
        # Default matching logic
        return _match_default(lines1, lines2)


def _match_order_confirmation(lines1: List[Dict], lines2: List[Dict]) -> List[Dict]:
    """Match Order + Confirmation: verify qty, price, rows, discounts, item codes."""
    discrepancies = []
    matched_indices_2 = set()
    
    # Exact match on code only (simple version to fix syntax errors)
    for i, line1 in enumerate(lines1):
        code1 = line1.get('code')
        if not code1:
            continue
            
        # Find exact match in doc2
        for j, line2 in enumerate(lines2):
            if j in matched_indices_2:
                continue
                
            code2 = line2.get('code')
            if code1 == code2:
                # Compare fields: qty, price, discounts
                discrepancy = _compare_order_fields(line1, line2, i, j)
                if discrepancy:
                    discrepancies.append(discrepancy)
                matched_indices_2.add(j)
                break
        else:
            # No match found - missing in doc2
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': i + 1,
                'line_number_doc2': None,
                'field': 'code',
                'doc1_value': code1,
                'doc2_value': None,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Item {code1} not found in confirmation"
            })
    
    # Check for extra items in doc2
    for j, line2 in enumerate(lines2):
        if j not in matched_indices_2:
            code2 = line2.get('code')
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': None,
                'line_number_doc2': j + 1,
                'field': 'code',
                'doc1_value': None,
                'doc2_value': code2,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Extra item in confirmation: {code2}"
            })
    
    return discrepancies


def _match_price_confirmation(lines1: List[Dict], lines2: List[Dict]) -> List[Dict]:
    """Match Price List + Price Confirmation: verify prices item-by-item, flag deviations."""
    discrepancies = []
    matched_indices_2 = set()
    
    # Treat doc1 as price list (reference), doc2 as price confirmation
    for i, line1 in enumerate(lines1):
        code1 = line1.get('code')
        if not code1:
            continue
            
        # Find exact match in doc2
        for j, line2 in enumerate(lines2):
            if j in matched_indices_2:
                continue
                
            code2 = line2.get('code')
            if code1 == code2:
                # Compare prices specifically
                discrepancy = _compare_price_fields(line1, line2, i, j)
                if discrepancy:
                    discrepancies.append(discrepancy)
                matched_indices_2.add(j)
                break
        else:
            # Item not in price confirmation
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': i + 1,
                'line_number_doc2': None,
                'field': 'code',
                'doc1_value': code1,
                'doc2_value': None,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Item {code1} not found in price confirmation"
            })
    
    # Check for extra items in price confirmation
    for j, line2 in enumerate(lines2):
        if j not in matched_indices_2:
            code2 = line2.get('code')
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': None,
                'line_number_doc2': j + 1,
                'field_name': 'code',
                'doc1_value': None,
                'doc2_value': code2,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Item {code2} not in reference price list"
            })
    
    return discrepancies


def _match_default(lines1: List[Dict], lines2: List[Dict]) -> List[Dict]:
    """Default matching logic (original implementation)."""
    discrepancies = []
    matched_indices_2 = set()
    
    # First pass: exact match on code
    for i, line1 in enumerate(lines1):
        code1 = line1.get('code')
        if not code1:
            continue
            
        # Find exact match in doc2
        for j, line2 in enumerate(lines2):
            if j in matched_indices_2:
                continue
                
            code2 = line2.get('code')
            if code1 == code2:
                # Compare fields
                discrepancy = _compare_lines(line1, line2, i, j)
                if discrepancy:
                    discrepancies.append(discrepancy)
                matched_indices_2.add(j)
                break
        else:
            # No match found - missing in doc2
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': i + 1,
                'line_number_doc2': None,
                'field_name': 'code',
                'doc1_value': code1,
                'doc2_value': None,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Item {code1} not found in document 2"
            })
    
    # Second pass: fuzzy match on description
    for i, line1 in enumerate(lines1):
        if not line1.get('code') or _is_line_matched(i, discrepancies):
            continue
            
        desc1 = line1.get('description', '')
        if not desc1:
            continue
        
        # Find fuzzy match in unmatched doc2 lines
        best_match = None
        best_score = 0
        best_index = None
        
        for j, line2 in enumerate(lines2):
            if j in matched_indices_2:
                continue
                
            desc2 = line2.get('description', '')
            if not desc2:
                continue
            
            score = fuzz.ratio(desc1, desc2)
            if score > best_score and score >= 85:
                best_score = score
                best_match = line2
                best_index = j
        
        if best_match:
            discrepancy = _compare_lines(line1, best_match, i, best_index)
            if discrepancy:
                discrepancies.append(discrepancy)
            matched_indices_2.add(best_index)
        else:
            # No match found
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': i + 1,
                'line_number_doc2': None,
                'field_name': 'description',
                'doc1_value': desc1,
                'doc2_value': None,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"No match found for item: {desc1}"
            })
    
    # Check for extra items in doc2
    for j, line2 in enumerate(lines2):
        if j not in matched_indices_2:
            code2 = line2.get('code')
            desc2 = line2.get('description', '')
            discrepancies.append({
                'type': DiscrepancyType.MISSING,
                'line_number_doc1': None,
                'line_number_doc2': j + 1,
                'field_name': 'code' if code2 else 'description',
                'doc1_value': None,
                'doc2_value': code2 or desc2,
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Extra item in document 2: {code2 or desc2}"
            })
    
    # Third pass: LLM for ambiguous cases
    if discrepancies:
        ambiguous = [d for d in discrepancies if d.get('type') == DiscrepancyType.MISSING]
        if ambiguous:
            _resolve_with_llm(ambiguous, lines1, lines2)
    
    return discrepancies


def _compare_order_fields(line1: Dict, line2: Dict, idx1: int, idx2: int) -> Optional[Dict]:
    """Compare order fields: qty, price, discounts, total."""
    discrepancies_found = []
    
    # Compare quantity
    qty1 = line1.get('quantity')
    qty2 = line2.get('quantity')
    if qty1 != qty2 and qty1 is not None and qty2 is not None:
        # Handle string quantities
        try:
            qty1_num = float(qty1) if isinstance(qty1, str) else qty1
            qty2_num = float(qty2) if isinstance(qty2, str) else qty2
            delta = abs(qty1_num - qty2_num)
            delta_percent = (delta / qty1_num) * 100 if qty1_num != 0 else 0
            discrepancies_found.append({
                'field': 'quantity',
                'doc1_value': qty1,
                'doc2_value': qty2,
                'delta_absolute': delta,
                'delta_percent': delta_percent
            })
        except (ValueError, TypeError):
            # If conversion fails, just compare as strings
            discrepancies_found.append({
                'field': 'quantity',
                'doc1_value': str(qty1),
                'doc2_value': str(qty2),
                'delta_absolute': None,
                'delta_percent': None
            })
    
    # Compare unit price
    price1 = line1.get('unit_price')
    price2 = line2.get('unit_price')
    if price1 != price2 and price1 is not None and price2 is not None:
        # Handle string prices
        try:
            price1_num = float(price1) if isinstance(price1, str) else price1
            price2_num = float(price2) if isinstance(price2, str) else price2
            delta = abs(price1_num - price2_num)
            delta_percent = (delta / price1_num) * 100 if price1_num != 0 else 0
            discrepancies_found.append({
                'field': 'unit_price',
                'doc1_value': price1,
                'doc2_value': price2,
                'delta_absolute': delta,
                'delta_percent': delta_percent
            })
        except (ValueError, TypeError):
            # If conversion fails, just compare as strings
            discrepancies_found.append({
                'field': 'unit_price',
                'doc1_value': str(price1),
                'doc2_value': str(price2),
                'delta_absolute': None,
                'delta_percent': None
            })
    
    # Compare discount
    discount1 = line1.get('discount')
    discount2 = line2.get('discount')
    if discount1 != discount2 and discount1 is not None and discount2 is not None:
        # Handle string discounts (e.g., "50%+5%")
        if isinstance(discount1, str) or isinstance(discount2, str):
            # For string discounts, just compare as strings without calculation
            discrepancies_found.append({
                'field': 'discount',
                'doc1_value': str(discount1),
                'doc2_value': str(discount2),
                'delta_absolute': None,
                'delta_percent': None
            })
        else:
            # For numeric discounts, calculate delta
            delta = abs(discount1 - discount2)
            delta_percent = (delta / discount1) * 100 if discount1 != 0 else 0
            discrepancies_found.append({
                'field': 'discount',
                'doc1_value': discount1,
                'doc2_value': discount2,
                'delta_absolute': delta,
                'delta_percent': delta_percent
            })
    
    # Compare total
    total1 = line1.get('total')
    total2 = line2.get('total')
    if total1 != total2 and total1 is not None and total2 is not None:
        # Handle string totals
        try:
            total1_num = float(total1) if isinstance(total1, str) else total1
            total2_num = float(total2) if isinstance(total2, str) else total2
            delta = abs(total1_num - total2_num)
            delta_percent = (delta / total1_num) * 100 if total1_num != 0 else 0
            discrepancies_found.append({
                'field': 'total',
                'doc1_value': total1,
                'doc2_value': total2,
                'delta_absolute': delta,
                'delta_percent': delta_percent
            })
        except (ValueError, TypeError):
            # If conversion fails, just compare as strings
            discrepancies_found.append({
                'field': 'total',
                'doc1_value': str(total1),
                'doc2_value': str(total2),
                'delta_absolute': None,
                'delta_percent': None
            })
    
    if discrepancies_found:
        first = discrepancies_found[0]
        return {
            'type': DiscrepancyType.CHANGED,
            'line_number_doc1': idx1 + 1,
            'line_number_doc2': idx2 + 1,
            'description': f"Order field {first['field']} changed",
            **first
        }
    
    return None


def _compare_price_fields(line1: Dict, line2: Dict, idx1: int, idx2: int) -> Optional[Dict]:
    """Compare price fields specifically for price list confirmation."""
    # Compare unit price (reference vs actual)
    price1 = line1.get('unit_price')  # Reference price from price list
    price2 = line2.get('unit_price')  # Actual price from confirmation
    
    if price1 is not None and price2 is not None:
        # Handle string prices
        try:
            price1_num = float(price1) if isinstance(price1, str) else price1
            price2_num = float(price2) if isinstance(price2, str) else price2
        except (ValueError, TypeError):
            # If conversion fails, just compare as strings
            if price1 != price2:
                return {
                    'type': DiscrepancyType.CHANGED,
                    'line_number_doc1': idx1 + 1,
                    'line_number_doc2': idx2 + 1,
                    'field_name': 'unit_price',
                    'doc1_value': str(price1),
                    'doc2_value': str(price2),
                    'delta_absolute': None,
                    'delta_percent': None,
                    'description': f"Price difference (reference: {price1}, actual: {price2})"
                }
            return None
        
        if price1_num != price2_num:
            delta = price2_num - price1_num  # Positive = price increased, Negative = price decreased
            delta_percent = (delta / price1_num) * 100 if price1_num != 0 else 0
            
            return {
                'type': DiscrepancyType.CHANGED,
                'line_number_doc1': idx1 + 1,
                'line_number_doc2': idx2 + 1,
                'field_name': 'unit_price',
                'doc1_value': price1,
                'doc2_value': price2,
                'delta_absolute': delta,
                'delta_percent': delta_percent,
                'description': f"Price deviation: {delta_percent:+.2f}% (reference: {price1}, actual: {price2})"
            }
    
    # Compare validity dates if present
    valid_from1 = line1.get('valid_from')
    valid_to1 = line1.get('valid_to')
    valid_from2 = line2.get('valid_from')
    valid_to2 = line2.get('valid_to')
    
    if valid_from1 or valid_to1 or valid_from2 or valid_to2:
        # Check if validity periods differ
        if valid_from1 != valid_from2 or valid_to1 != valid_to2:
            return {
                'type': DiscrepancyType.CHANGED,
                'line_number_doc1': idx1 + 1,
                'line_number_doc2': idx2 + 1,
                'field_name': 'validity_period',
                'doc1_value': f"{valid_from1} - {valid_to1}",
                'doc2_value': f"{valid_from2} - {valid_to2}",
                'delta_absolute': None,
                'delta_percent': None,
                'description': f"Validity period differs (reference: {valid_from1}-{valid_to1}, actual: {valid_from2}-{valid_to2})"
            }
    
    return None


def _compare_lines(line1: Dict, line2: Dict, idx1: int, idx2: int) -> Optional[Dict]:
    """Compare two line items and return discrepancy if found."""
    discrepancies_found = []
    
    # Compare quantity
    qty1 = line1.get('quantity')
    qty2 = line2.get('quantity')
    if qty1 != qty2 and qty1 is not None and qty2 is not None:
        delta = abs(qty1 - qty2)
        delta_percent = (delta / qty1) * 100 if qty1 != 0 else 0
        discrepancies_found.append({
            'field_name': 'quantity',
            'doc1_value': qty1,
            'doc2_value': qty2,
            'delta_absolute': delta,
            'delta_percent': delta_percent
        })
    
    # Compare unit price
    price1 = line1.get('unit_price')
    price2 = line2.get('unit_price')
    if price1 != price2 and price1 is not None and price2 is not None:
        delta = abs(price1 - price2)
        delta_percent = (delta / price1) * 100 if price1 != 0 else 0
        discrepancies_found.append({
            'field_name': 'unit_price',
            'doc1_value': price1,
            'doc2_value': price2,
            'delta_absolute': delta,
            'delta_percent': delta_percent
        })
    
    # Compare total
    total1 = line1.get('total')
    total2 = line2.get('total')
    if total1 != total2 and total1 is not None and total2 is not None:
        delta = abs(total1 - total2)
        delta_percent = (delta / total1) * 100 if total1 != 0 else 0
        discrepancies_found.append({
            'field_name': 'total',
            'doc1_value': total1,
            'doc2_value': total2,
            'delta_absolute': delta,
            'delta_percent': delta_percent
        })
    
    if discrepancies_found:
        # Return first discrepancy (or could return all)
        first = discrepancies_found[0]
        return {
            'type': DiscrepancyType.CHANGED,
            'line_number_doc1': idx1 + 1,
            'line_number_doc2': idx2 + 1,
            'description': f"Field {first['field']} changed",
            **first
        }
    
    return None


def _is_line_matched(idx: int, discrepancies: List[Dict]) -> bool:
    """Check if a line index has already been matched."""
    return any(d.get('line_number_doc1') == idx + 1 for d in discrepancies)


def _resolve_with_llm(ambiguous: List[Dict], lines1: List[Dict], lines2: List[Dict]):
    """Use LLM to resolve ambiguous discrepancies."""
    try:
        # Prepare context for LLM
        context = {
            'ambiguous_cases': ambiguous[:5],  # Limit to 5 cases
            'doc1_lines': lines1,
            'doc2_lines': lines2
        }
        
        # Call LLM service (placeholder - implement based on your LLM setup)
        # result = llm_service.resolve_discrepancies(context)
        
        logger.info(f"LLM resolution called for {len(ambiguous)} ambiguous cases")
        
    except Exception as e:
        logger.error(f"Error resolving with LLM: {e}")


def detect_scenario(job_id: str):
    """Detect the reconciliation scenario based on document content."""
    logger.info(f"Detecting scenario for job_id: {job_id}")
    
    try:
        job = ReconciliationJob.objects.get(id=job_id)
        doc1 = job.document_1
        doc2 = job.document_2
        
        if not doc1.extracted_data or not doc2.extracted_data:
            raise Exception("Both documents must be processed before scenario detection")
        
        # Analyze document content to detect scenario
        doc1_data = doc1.extracted_data
        doc2_data = doc2.extracted_data
        
        doc1_type = doc1_data.get('document_type', '').lower()
        doc2_type = doc2_data.get('document_type', '').lower()
        
        # Check for keywords in document content
        doc1_text = str(doc1_data).lower()
        doc2_text = str(doc2_data).lower()
        
        # Detect scenario based on content analysis
        scenario = ReconciliationScenario.UNKNOWN
        
        # Order + Confirmation detection
        order_keywords = ['ordine', 'order', 'po', 'purchase order']
        confirmation_keywords = ['conferma', 'confirmation', 'delivery note', 'ddt']
        
        # Price List + Price Confirmation detection
        pricelist_keywords = ['listino', 'price list', 'catalog', 'catalogo']
        price_confirmation_keywords = ['conferma prezzi', 'price confirmation', 'offerta', 'quote']
        
        # Check if doc1 is order and doc2 is confirmation
        if (any(kw in doc1_type or kw in doc1_text for kw in order_keywords) and 
            any(kw in doc2_type or kw in doc2_text for kw in confirmation_keywords)):
            scenario = ReconciliationScenario.ORDER_CONFIRMATION
        # Check if doc1 is price list and doc2 is price confirmation
        elif (any(kw in doc1_type or kw in doc1_text for kw in pricelist_keywords) and 
              any(kw in doc2_type or kw in doc2_text for kw in price_confirmation_keywords)):
            scenario = ReconciliationScenario.PRICE_CONFIRMATION
        # Reverse order (confirmation + order)
        elif (any(kw in doc2_type or kw in doc2_text for kw in order_keywords) and 
              any(kw in doc1_type or kw in doc1_text for kw in confirmation_keywords)):
            scenario = ReconciliationScenario.ORDER_CONFIRMATION
        # Reverse price list (price confirmation + price list)
        elif (any(kw in doc2_type or kw in doc2_text for kw in pricelist_keywords) and 
              any(kw in doc1_type or kw in doc1_text for kw in price_confirmation_keywords)):
            scenario = ReconciliationScenario.PRICE_CONFIRMATION
        # Fallback: analyze structure
        else:
            lines1 = doc1_data.get('lines', [])
            lines2 = doc2_data.get('lines', [])
            
            # If both have similar structure with quantities and prices -> order confirmation
            if (len(lines1) > 0 and len(lines2) > 0 and
                all('quantity' in line for line in lines1) and
                all('quantity' in line for line in lines2)):
                scenario = ReconciliationScenario.ORDER_CONFIRMATION
            # If one has prices and the other has prices -> price confirmation
            elif (len(lines1) > 0 and len(lines2) > 0 and
                  all('unit_price' in line for line in lines1) and
                  all('unit_price' in line for line in lines2)):
                scenario = ReconciliationScenario.PRICE_CONFIRMATION
        
        # Save scenario
        job.scenario = scenario
        job.save()
        
        logger.info(f"Scenario detected for job {job_id}: {scenario}")
        
        return {
            'job_id': job_id,
            'scenario': scenario
        }
        
    except ReconciliationJob.DoesNotExist:
        logger.error(f"Job not found: {job_id}")
        raise
    except Exception as e:
        logger.error(f"Error detecting scenario for job {job_id}: {e}")
        raise
