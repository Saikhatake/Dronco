"""
OCR Service for extracting text from medical reports
Supports PDF (text + scanned) and images
"""

import pytesseract
from PIL import Image
import pdfplumber
import os


class OCRService:
    """Service for extracting text from PDF and image files"""

    def __init__(self, tesseract_path=None):
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path

        print("✅ OCR Service initialized")

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text from PDF (text-based + scanned PDFs)"""

        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        extracted_text = ""

        # 1️⃣ Try normal text extraction
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"

        # 2️⃣ If text is empty → scanned PDF → OCR
        if not extracted_text.strip():
            extracted_text = self._ocr_scanned_pdf(pdf_path)

        if not extracted_text.strip():
            raise RuntimeError("❌ OCR failed: No text could be extracted")

        return extracted_text.strip()

    def extract_text_from_image(self, image_path: str) -> str:
        """Extract text from image using Tesseract OCR"""

        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")

        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)

        if not text.strip():
            raise RuntimeError("❌ OCR failed: No text detected in image")

        return text.strip()

    def _ocr_scanned_pdf(self, pdf_path: str) -> str:
        """OCR scanned PDF pages"""

        text = ""

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                image = page.to_image(resolution=300).original
                page_text = pytesseract.image_to_string(image)
                text += page_text + "\n"

        return text
