FROM python:3.10

# System dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Upgrade pip
RUN pip install --upgrade pip

# Base deps
RUN pip install fastapi uvicorn pydantic numpy pandas scikit-learn python-multipart

# ML deps
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install transformers
RUN pip install pdfminer.six pdfplumber

# Install rest
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
