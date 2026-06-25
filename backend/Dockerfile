# backend/Dockerfile
FROM python:3.11-slim

# System deps for pdfplumber (needs poppler for PDF rendering)
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libpoppler-cpp-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend directory
COPY . .

# Render sets PORT automatically; default to 8123 for local Docker runs
ENV PORT=8123

EXPOSE $PORT

CMD ["python", "main.py"]