# ADR 001: Multi-Tenant Isolation Strategy

## Status
Accepted

## Context
Il sistema deve supportare multi-tenancy nativo con isolamento dati tra tenant. I requisiti richiedono che un utente del tenant A non possa mai vedere dati del tenant B, anche in caso di bug.

## Decision
Abbiamo scelto un approccio **middleware + queryset manager** con PostgreSQL Row-Level Security come layer aggiuntivo.

### Implementazione
1. **TenantMiddleware**: Estrae tenant dal JWT e lo setta in thread-local storage
2. **TenantMixin**: Aggiunge campo `tenant_id` a tutti i modelli multi-tenant
3. **TenantManager**: Filtra automaticamente queryset per tenant corrente
4. **Row-Level Security**: PostgreSQL RLS come defense in depth

### Codice Chiave
```python
# Middleware
def get_current_tenant():
    return _tenant_context.get()

# TenantManager
class TenantManager(models.Manager):
    def get_queryset(self):
        queryset = super().get_queryset()
        current_tenant = get_current_tenant()
        if current_tenant and hasattr(self.model, 'tenant'):
            queryset = queryset.filter(tenant=current_tenant)
        return queryset
```

## Consequences
### Positive
- Isolamento nativo, non bolt-on
- Difficile bypassare accidentalmente
- Performance accettabili (index su tenant_id)
- Facile debugging

### Negative
- Richiede discipline nel codice (non dimenticare TenantMixin)
- Query complesse potrebbero richiedere attenzione
- Migrazioni più complesse per modelli esistenti

## Alternatives Considerate
1. **Schema-per-tenant**: Ogni tenant ha schema separato
   - Pro: Isolamento perfetto
   - Contro: Complesso, difficile manutenzione, scaling orizzontale difficile
   
2. **Database-per-tenant**: Ogni tenant ha DB separato
   - Pro: Isolamento perfetto, scaling facile
   - Contro: Molto costoso, complesso gestione
   
3. **Soft-isolation (app-level only)**: Solo filtri application
   - Pro: Semplice
   - Contro: Facile bug, non conforme requisiti

## References
- Challenge requirement: "Architettura libera ma deve essere nativa, non bolt-on"
- Django multi-tenant best practices
