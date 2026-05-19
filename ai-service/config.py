from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'),
        env_file_encoding='utf-8',
        case_sensitive=True,
        extra='ignore'
    )
    
    # FastAPI
    FASTAPI_PORT: int = 8001
    FASTAPI_SECRET_KEY: str = "change_this_fastapi_secret_key"
    FASTAPI_DEBUG: bool = True
    
    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_FALLBACK_MODEL: str = "gpt-4o"
    OPENAI_MAX_TOKENS: int = 4096
    OPENAI_TEMPERATURE: float = 0.0
    OPENAI_TIMEOUT: int = 300
    
    # Anthropic (fallback)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-opus-20240229"
    
    # Processing
    MAX_RETRIES: int = 3
    CONFIDENCE_THRESHOLD: float = 0.7
    MAX_PAGES_PDF: int = 10
    
    # File paths
    DOCUMENTS_PATH: str = "/app/documents"
    
    # Database (for storing results)
    DATABASE_URL: str = ""
    REDIS_URL: str = ""
    
    @property
    def is_openai_configured(self) -> bool:
        """Check if OpenAI is properly configured."""
        return bool(self.OPENAI_API_KEY)
    
    @property
    def is_anthropic_configured(self) -> bool:
        """Check if Anthropic is properly configured."""
        return bool(self.ANTHROPIC_API_KEY)


settings = Settings()
