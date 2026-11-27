FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=5003

# System dependencies required by WeasyPrint (pango/cairo) and PDF/OCR utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu-core \
    fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn PyMuPDF weasyprint Flask-Limiter PyJWT tavily-python resend

COPY . .

RUN mkdir -p /app/data/faiss /app/data/uploads

VOLUME ["/app/data"]

EXPOSE 5003

# Single worker with threads preserves in-process BM25/image caches & APScheduler
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5003} --workers 1 --threads 8 --timeout 300 app:app"]
