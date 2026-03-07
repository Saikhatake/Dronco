from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
from typing import Optional

load_dotenv()

# ─── ENV VALIDATION ──────────────────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
REFRESH_SECRET_KEY = os.getenv("JWT_REFRESH_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY not set in environment")
if not REFRESH_SECRET_KEY:
    raise RuntimeError("JWT_REFRESH_SECRET_KEY not set in environment")
if SECRET_KEY == REFRESH_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY and JWT_REFRESH_SECRET_KEY must be different")

ALGORITHM = "HS256"
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ─── DATABASE + SERVICES ─────────────────────────────────────────────────────
from database import SessionDB
from services.dl_service import DLPredictionService
from services.ocr_service import OCRService
from services.llm_service import LLMSummarizerService
from services.xai_service import ExplainabilityService
from services.chat_service import LangChainChatService
from auth_utils import (
    create_access_token, create_refresh_token,
    decode_access_token, decode_refresh_token,
    validate_email, validate_password,
)

# ─── RATE LIMITER ─────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ─── LIFESPAN ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await SessionDB.connect()
    yield
    await SessionDB.disconnect()

# ─── APP ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Dr. Onco API",
    version="3.1.0",
    description="Breast cancer prediction with session-based LangChain chatbot",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 10_000_000:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
    return await call_next(request)

# ─── SECURITY ─────────────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ml_service = DLPredictionService(
    model_path="./models/breast_cancer_dl_model.keras",
    scaler_path="./models/scaler.pkl"
)
ocr_service = OCRService()
llm_service = LLMSummarizerService()
xai_service = ExplainabilityService()
chat_service = LangChainChatService()

# ─── AUTH DEPENDENCY ──────────────────────────────────────────────────────────
async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Session expired. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Check if token is blacklisted
    if await SessionDB.is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Token has been revoked. Please log in again.")

    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception

    email = payload.get("sub")
    if not email:
        raise credentials_exception

    user = await SessionDB.get_user(email)
    if not user:
        raise credentials_exception

    return email

# ─── SCHEMAS ──────────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = ""
    date_of_birth: Optional[str] = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class PredictionRequest(BaseModel):
    age: float; bmi: float; glucose: float; insulin: float; homa: float
    leptin: float; adiponectin: float; resistin: float; mcp1: float
    smoking_status: int = 0; alcohol_units: float = 0
    exercise_hours: float = 0; diet_quality: float = 5; family_history: int = 0

class TextSummaryRequest(BaseModel):
    text: str

class ChatMessageRequest(BaseModel):
    message: str
    session_id: str

class RenameSessionRequest(BaseModel):
    title: str

# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

@app.post("/api/auth/signup", status_code=201)
@limiter.limit("5/minute")
async def signup(request: Request, data: SignupRequest):
    # Validate email
    email_ok, email_err = validate_email(data.email)
    if not email_ok:
        raise HTTPException(status_code=422, detail=email_err)

    # Validate password strength
    pass_ok, pass_err = validate_password(data.password)
    if not pass_ok:
        raise HTTPException(status_code=422, detail=pass_err)

    email = data.email.strip().lower()

    if await SessionDB.user_exists(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    hashed = pwd_context.hash(data.password)
    user = await SessionDB.create_user(email, hashed, data.full_name or "", data.date_of_birth or "")

    access_token = create_access_token(email)
    refresh_token = create_refresh_token(email)

    return {
        "message": "Account created successfully",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "email": email,
            "full_name": user.get("full_name", ""),
        }
    }


@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest):
    email = data.email.strip().lower()

    # Check brute-force lockout
    is_locked, remaining = await SessionDB.is_account_locked(email)
    if is_locked:
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {remaining} minutes."
        )

    user = await SessionDB.get_user(email)

    # Always hash-compare to prevent timing attacks
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$placeholder"
    stored_hash = user["password"] if user else dummy_hash
    password_ok = pwd_context.verify(data.password, stored_hash)

    if not user or not password_ok:
        await SessionDB.record_failed_login(email)
        attempts_left = await SessionDB.get_attempts_remaining(email)
        detail = "Invalid email or password"
        if attempts_left <= 2:
            detail += f". {attempts_left} attempt(s) remaining before lockout."
        raise HTTPException(status_code=401, detail=detail)

    # Clear failed attempts on success
    await SessionDB.clear_failed_logins(email)

    access_token = create_access_token(email)
    refresh_token = create_refresh_token(email)

    return {
        "message": "Login successful",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "email": email,
            "full_name": user.get("full_name", ""),
        }
    }


@app.post("/api/auth/refresh")
@limiter.limit("20/minute")
async def refresh_token(request: Request, data: RefreshRequest):
    """Issue a new access token using a valid refresh token."""
    payload = decode_refresh_token(data.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token. Please log in again.")

    # Check if refresh token is blacklisted
    if await SessionDB.is_token_blacklisted(data.refresh_token):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked. Please log in again.")

    email = payload.get("sub")
    user = await SessionDB.get_user(email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_access_token = create_access_token(email)
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
    }


@app.post("/api/auth/logout")
async def logout(request: Request, token: str = Depends(oauth2_scheme)):
    """
    Blacklist both access and refresh tokens.
    Frontend should send refresh_token in body for full invalidation.
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    # Blacklist access token
    payload = decode_access_token(token)
    if payload:
        expires_at = datetime.utcfromtimestamp(payload["exp"])
        await SessionDB.blacklist_token(token, expires_at)

    # Blacklist refresh token if provided
    refresh = body.get("refresh_token")
    if refresh:
        r_payload = decode_refresh_token(refresh)
        if r_payload:
            expires_at = datetime.utcfromtimestamp(r_payload["exp"])
            await SessionDB.blacklist_token(refresh, expires_at)

    return {"message": "Logged out successfully"}


@app.get("/api/auth/me")
async def get_me(user_email: str = Depends(get_current_user)):
    """Return current user profile. Used by frontend on page refresh."""
    user = await SessionDB.get_user(user_email)
    return {
        "email": user["email"],
        "full_name": user.get("full_name", ""),
        "date_of_birth": user.get("date_of_birth", ""),
        "created_at": user.get("created_at", ""),
    }


@app.post("/api/auth/change-password")
async def change_password(data: ChangePasswordRequest, user_email: str = Depends(get_current_user)):
    user = await SessionDB.get_user(user_email)
    if not pwd_context.verify(data.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    pass_ok, pass_err = validate_password(data.new_password)
    if not pass_ok:
        raise HTTPException(status_code=422, detail=pass_err)

    new_hash = pwd_context.hash(data.new_password)
    await SessionDB.update_password(user_email, new_hash)
    return {"message": "Password updated successfully"}


# ─── PREDICTION ───────────────────────────────────────────────────────────────
@app.post("/api/predict")
async def predict(data: PredictionRequest, user: str = Depends(get_current_user)):
    input_data = {
        "Age": data.age, "BMI": data.bmi, "Glucose": data.glucose,
        "Insulin": data.insulin, "HOMA": data.homa, "Leptin": data.leptin,
        "Adiponectin": data.adiponectin, "Resistin": data.resistin, "MCP.1": data.mcp1,
        "smoking_status": data.smoking_status, "alcohol_units": data.alcohol_units,
        "exercise_hours": data.exercise_hours, "diet_quality": data.diet_quality,
        "family_history": data.family_history,
    }
    prediction = ml_service.predict(input_data)
    explanation = xai_service.explain_prediction(input_data)
    await SessionDB.save_prediction(user, input_data, prediction)
    return {"success": True, "prediction": prediction, "explanation": explanation}

@app.get("/api/predictions/history")
async def prediction_history(user: str = Depends(get_current_user)):
    return await SessionDB.get_predictions(user)

# ─── REPORTS ──────────────────────────────────────────────────────────────────
@app.post("/api/summarize/upload")
async def upload_report(file: UploadFile = File(...), user: str = Depends(get_current_user)):
    filename = file.filename.lower()
    path = os.path.join(UPLOAD_FOLDER, file.filename)
    try:
        with open(path, "wb") as f:
            f.write(await file.read())
        if filename.endswith(".pdf"):
            text = ocr_service.extract_text_from_pdf(path)
        elif filename.endswith((".png", ".jpg", ".jpeg")):
            text = ocr_service.extract_text_from_image(path)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload PDF, PNG, or JPG.")
        summary = llm_service.summarize_medical_report(text)
        await SessionDB.save_report(user, summary)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        if os.path.exists(path):
            os.remove(path)

@app.post("/api/summarize/text")
async def summarize_text(data: TextSummaryRequest, user: str = Depends(get_current_user)):
    summary = llm_service.summarize_medical_report(data.text)
    await SessionDB.save_report(user, summary)
    return summary

@app.get("/api/reports/history")
async def report_history(user: str = Depends(get_current_user)):
    reports = await SessionDB.get_reports(user)
    return {"success": True, "reports": [
        {"id": r.get("id", ""), "summary": r["summary"], "created_at": r["created_at"]}
        for r in reports
    ]}

# ─── CHAT SESSIONS ────────────────────────────────────────────────────────────
@app.post("/api/chat/sessions")
async def create_session(user: str = Depends(get_current_user)):
    session = await SessionDB.create_session(user)
    return {"success": True, "session": session}

@app.get("/api/chat/sessions")
async def list_sessions(user: str = Depends(get_current_user)):
    sessions = await SessionDB.list_sessions(user)
    stats = await SessionDB.get_stats(user)
    return {"success": True, "sessions": sessions, "stats": stats}

@app.get("/api/chat/sessions/{session_id}")
async def get_session(session_id: str, user: str = Depends(get_current_user)):
    session = await SessionDB.get_session(session_id, user)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "session": session}

@app.delete("/api/chat/sessions/{session_id}")
async def delete_session(session_id: str, user: str = Depends(get_current_user)):
    session = await SessionDB.get_session(session_id, user)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await SessionDB.delete_session(session_id, user)
    return {"success": True, "message": "Session deleted"}

@app.patch("/api/chat/sessions/{session_id}/rename")
async def rename_session(session_id: str, data: RenameSessionRequest, user: str = Depends(get_current_user)):
    await SessionDB.rename_session(session_id, user, data.title)
    return {"success": True, "title": data.title}

@app.post("/api/chat/message")
async def send_message(data: ChatMessageRequest, user: str = Depends(get_current_user)):
    session = await SessionDB.get_session(data.session_id, user)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_profile = await SessionDB.get_user(user)
    predictions = await SessionDB.get_predictions(user)
    latest_prediction = None
    if predictions:
        latest = predictions[-1]
        pred = latest.get("prediction", {})
        input_data = latest.get("input_data", {})
        latest_prediction = {
            "risk_level": pred.get("risk_level"),
            "probability": pred.get("probability"),
            "biomarkers": {
                "Glucose": input_data.get("Glucose"), "BMI": input_data.get("BMI"),
                "Insulin": input_data.get("Insulin"), "HOMA-IR": input_data.get("HOMA"),
                "Leptin": input_data.get("Leptin"), "Adiponectin": input_data.get("Adiponectin"),
                "Resistin": input_data.get("Resistin"),
            },
            "recommendations": pred.get("recommendations", []),
        }

    reports = await SessionDB.get_reports(user)
    latest_report = reports[0].get("summary") if reports else None

    try:
        result = chat_service.chat(
            user_message=data.message, session=session,
            user_profile=user_profile, latest_prediction=latest_prediction,
            latest_report=latest_report,
        )
        new_title = None
        if result["is_first_message"]:
            new_title = chat_service.generate_session_title(data.message)

        await SessionDB.save_session_memory(
            session_id=data.session_id, user_email=user,
            messages=result["messages_to_save"], summary=result["summary_to_save"],
            title=new_title,
        )
        return {
            "success": True, "reply": result["reply"],
            "session_id": data.session_id,
            "session_title": new_title or session["title"],
            "message_count": result["message_count"],
            "has_memory_summary": result["has_summary"],
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat error: {str(e)}")

# ─── HEALTH ───────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    try:
        await SessionDB.client.admin.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    return {"status": "healthy", "database": db_status, "time": datetime.utcnow().isoformat()}
