FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for static and media files
RUN mkdir -p staticfiles mediafiles

# Expose port
EXPOSE 8000 8002

# Default command (will be overridden in docker-compose)
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
