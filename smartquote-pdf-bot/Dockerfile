FROM python:3.11-slim

# Install poppler-utils for pdftotext/pdfinfo + tesseract for OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-chi-tra \
    tesseract-ocr-eng \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 10000

ENV LARK_APP_ID=${LARK_APP_ID}
ENV LARK_APP_SECRET=${LARK_APP_SECRET}
ENV CRM_URL=${CRM_URL}

CMD ["uvicorn", "webhook_server:app", "--host", "0.0.0.0", "--port", "10000"]
