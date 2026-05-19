# ADR 002: JWT Authentication with Refresh Tokens

## Status
Accepted

## Context
Il sistema richiede autenticazione stateless per API REST con supporto per:
- Access token a breve durata
- Refresh token per rotazione automatica
- Sicurezza in ambiente distribuito

## Decision
Abbiamo scelto **djangorestframework-simplejwt** con rotazione refresh token.

### Configurazione
```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
}
```

### Flow
1. Login → return access + refresh token
2. Access token usato per API calls (15 min)
3. Access scaduto → usa refresh per nuovo access
4. Refresh rotato → nuovo refresh token, vecchio blacklistato

## Consequences
### Positive
- Stateless, scalabile orizzontalmente
- Refresh rotation aumenta sicurezza
- Blacklist previene reuse
- Standard industry, ben testato

### Negative
- Access token breve = più refresh calls
- Richiede gestione blacklist (Redis)
- Logout richiede blacklist refresh token

## Alternatives Considerate
1. **Session-based auth**: Cookie session
   - Pro: Semplice, automatico
   - Contro: Stateful, non scalabile, non per API
   
2. **API Keys**: Chiave statica per tenant
   - Pro: Semplice
   - Contro: No user-level auth, non revocabile facilmente
   
3. **OAuth2**: Flow completo OAuth2
   - Pro: Standard, flessibile
   - Contro: Overkill per questo use case, complesso

## References
- Challenge requirement: "JWT con access + refresh + rotation"
- OWASP JWT best practices
