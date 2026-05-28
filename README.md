# 🩺 Dr. Onco — AI-Powered Breast Cancer Prediction & Medical Assistant

Dr. Onco is an AI-powered healthcare backend system designed for **breast cancer risk prediction, medical report summarization, and personalized AI assistance**. The system integrates **Machine Learning, Explainable AI (XAI), OCR, LLMs, and conversational AI** to support intelligent healthcare analysis.

---

## 🚀 Features

### 🔐 Secure Authentication
- JWT-based Authentication
- Access & Refresh Tokens
- Password hashing using Argon2
- Token blacklisting
- Brute-force protection

### 🧠 Breast Cancer Risk Prediction
- Deep Learning model using TensorFlow/Keras
- Biomedical + lifestyle feature analysis
- Risk classification:
  - Low Risk
  - Medium Risk
  - High Risk
- Confidence score generation

### 📊 Explainable AI (XAI)
- SHAP-like feature importance
- Human-readable risk explanations
- Top contributing medical factors

### 📄 Medical Report Summarization
- OCR-based report text extraction
- PDF/Image medical report support
- AI-powered medical summarization
- Structured JSON output

### 🤖 AI Medical Chatbot
- LangChain-powered chatbot
- Personalized health conversations
- Session memory support
- Medical-context-aware responses

### 🗂 Session Management
- Create, rename, delete chat sessions
- Persistent memory handling

### 🐳 Dockerized Deployment
- Containerized backend
- Easy deployment
- Dependency isolation

---

# 🏗 System Architecture

```text
User
 ↓
Frontend (React/UI)
 ↓
FastAPI Backend
 ↓
Authentication (JWT)
 ↓
MongoDB Database
 ↓
ML Prediction Service
 ↓
Explainability (XAI)
 ↓
OCR Service
 ↓
LLM Summarization
 ↓
LangChain Chatbot
 ↓
Response to User
