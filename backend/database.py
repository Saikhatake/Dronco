"""
Session-Based Chat Manager for Dr. Onco
- Each conversation = a separate Session with unique ID
- Memory (LangChain) is scoped per session, not global per user
- Users can: create session, resume session, list sessions, delete session
- ConversationSummaryBufferMemory per session → efficient, never bloats
- Token blacklist for secure logout
- Brute-force login protection (failed attempt tracking)

MongoDB Collections:
  users, predictions, reports, chat_sessions, token_blacklist, login_attempts
"""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument, DESCENDING


MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


class SessionDB:
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    async def connect(cls):
        mongo_url = os.getenv("MONGODB_URL")
        db_name = os.getenv("MONGODB_DB_NAME", "dronco")
        if not mongo_url:
            raise RuntimeError("MONGODB_URL not set in .env")

        cls.client = AsyncIOMotorClient(
            mongo_url,
            serverSelectionTimeoutMS=5000,
            tls=True,
            tlsCAFile=certifi.where()
        )
        cls.db = cls.client[db_name]

        # ── Existing indexes ──
        await cls.db.chat_sessions.create_index("session_id", unique=True)
        await cls.db.chat_sessions.create_index("user_email")
        await cls.db.chat_sessions.create_index([("user_email", 1), ("last_active", DESCENDING)])
        await cls.db.users.create_index("email", unique=True)
        await cls.db.predictions.create_index("user_email")
        await cls.db.reports.create_index("user_email")

        # ── New: security indexes ──
        # TTL index: auto-expire blacklisted tokens after their expiry time
        await cls.db.token_blacklist.create_index("token", unique=True)
        await cls.db.token_blacklist.create_index("expires_at", expireAfterSeconds=0)

        # TTL index: auto-expire login attempt records after lockout window
        await cls.db.login_attempts.create_index("email", unique=True)
        await cls.db.login_attempts.create_index(
            "locked_until", expireAfterSeconds=0
        )

        print(f"MongoDB connected — database: '{db_name}'")

    @classmethod
    async def disconnect(cls):
        if cls.client:
            cls.client.close()

    # ─── USERS ───────────────────────────────────────────────────────────────

    @classmethod
    async def create_user(cls, email: str, hashed_password: str, full_name: str = "", dob: str = ""):
        user = {
            "email": email,
            "password": hashed_password,
            "full_name": full_name,
            "date_of_birth": dob,
            "created_at": datetime.utcnow().isoformat(),
        }
        await cls.db.users.insert_one(user)
        return user

    @classmethod
    async def get_user(cls, email: str) -> Optional[dict]:
        return await cls.db.users.find_one({"email": email}, {"_id": 0})

    @classmethod
    async def user_exists(cls, email: str) -> bool:
        return await cls.db.users.count_documents({"email": email}) > 0

    @classmethod
    async def update_password(cls, email: str, new_hashed_password: str):
        await cls.db.users.update_one(
            {"email": email},
            {"$set": {"password": new_hashed_password, "password_updated_at": datetime.utcnow().isoformat()}}
        )

    # ─── BRUTE-FORCE PROTECTION ──────────────────────────────────────────────

    @classmethod
    async def record_failed_login(cls, email: str):
        """Increment failed login counter. Lock account after MAX_LOGIN_ATTEMPTS."""
        now = datetime.utcnow()
        result = await cls.db.login_attempts.find_one_and_update(
            {"email": email},
            {
                "$inc": {"attempts": 1},
                "$set": {"last_attempt": now},
                "$setOnInsert": {"email": email},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if result and result.get("attempts", 0) >= MAX_LOGIN_ATTEMPTS:
            locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            await cls.db.login_attempts.update_one(
                {"email": email},
                {"$set": {"locked_until": locked_until}}
            )

    @classmethod
    async def is_account_locked(cls, email: str) -> tuple[bool, int]:
        """Returns (is_locked, minutes_remaining)."""
        doc = await cls.db.login_attempts.find_one({"email": email})
        if not doc:
            return False, 0
        locked_until = doc.get("locked_until")
        if locked_until and datetime.utcnow() < locked_until:
            remaining = int((locked_until - datetime.utcnow()).total_seconds() / 60) + 1
            return True, remaining
        return False, 0

    @classmethod
    async def get_attempts_remaining(cls, email: str) -> int:
        doc = await cls.db.login_attempts.find_one({"email": email})
        if not doc:
            return MAX_LOGIN_ATTEMPTS
        attempts = doc.get("attempts", 0)
        return max(0, MAX_LOGIN_ATTEMPTS - attempts)

    @classmethod
    async def clear_failed_logins(cls, email: str):
        await cls.db.login_attempts.delete_one({"email": email})

    # ─── TOKEN BLACKLIST ─────────────────────────────────────────────────────

    @classmethod
    async def blacklist_token(cls, token: str, expires_at: datetime):
        """Add a token to the blacklist. MongoDB TTL removes it automatically."""
        try:
            await cls.db.token_blacklist.insert_one({
                "token": token,
                "blacklisted_at": datetime.utcnow(),
                "expires_at": expires_at,
            })
        except Exception:
            pass  # Duplicate token — already blacklisted, ignore

    @classmethod
    async def is_token_blacklisted(cls, token: str) -> bool:
        doc = await cls.db.token_blacklist.find_one({"token": token})
        return doc is not None

    # ─── PREDICTIONS ─────────────────────────────────────────────────────────

    @classmethod
    async def save_prediction(cls, user_email: str, input_data: dict, prediction: dict):
        doc = {
            "user_email": user_email, "input_data": input_data,
            "prediction": prediction, "created_at": datetime.utcnow().isoformat(),
        }
        result = await cls.db.predictions.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        return doc

    @classmethod
    async def get_predictions(cls, user_email: str) -> list:
        cursor = cls.db.predictions.find(
            {"user_email": user_email}, {"_id": 0}
        ).sort("created_at", 1)
        return await cursor.to_list(length=500)

    # ─── REPORTS ─────────────────────────────────────────────────────────────

    @classmethod
    async def save_report(cls, user_email: str, summary: dict):
        doc = {
            "user_email": user_email, "summary": summary,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = await cls.db.reports.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        return doc

    @classmethod
    async def get_reports(cls, user_email: str) -> list:
        cursor = cls.db.reports.find(
            {"user_email": user_email}, {"_id": 0}
        ).sort("created_at", -1)
        return await cursor.to_list(length=200)

    # ─── CHAT SESSIONS ────────────────────────────────────────────────────────

    @classmethod
    async def create_session(cls, user_email: str, title: str = "New Conversation") -> dict:
        now = datetime.utcnow().isoformat()
        session = {
            "session_id": str(uuid.uuid4()),
            "user_email": user_email,
            "title": title,
            "messages": [],
            "summary": "",
            "message_count": 0,
            "created_at": now,
            "last_active": now,
            "is_archived": False,
        }
        await cls.db.chat_sessions.insert_one(session)
        session.pop("_id", None)
        return session

    @classmethod
    async def get_session(cls, session_id: str, user_email: str) -> Optional[dict]:
        return await cls.db.chat_sessions.find_one(
            {"session_id": session_id, "user_email": user_email}, {"_id": 0}
        )

    @classmethod
    async def list_sessions(cls, user_email: str, limit: int = 20) -> list:
        cursor = cls.db.chat_sessions.find(
            {"user_email": user_email, "is_archived": False},
            {
                "_id": 0, "session_id": 1, "title": 1,
                "message_count": 1, "created_at": 1, "last_active": 1,
                "messages": {"$slice": -1},
            }
        ).sort("last_active", DESCENDING).limit(limit)
        return await cursor.to_list(length=limit)

    @classmethod
    async def save_session_memory(
        cls, session_id: str, user_email: str,
        messages: list, summary: str, title: str = None,
    ):
        update = {
            "$set": {
                "messages": messages, "summary": summary,
                "message_count": len(messages),
                "last_active": datetime.utcnow().isoformat(),
            }
        }
        if title:
            update["$set"]["title"] = title

        await cls.db.chat_sessions.find_one_and_update(
            {"session_id": session_id, "user_email": user_email},
            update, return_document=ReturnDocument.AFTER,
        )

    @classmethod
    async def delete_session(cls, session_id: str, user_email: str):
        await cls.db.chat_sessions.delete_one(
            {"session_id": session_id, "user_email": user_email}
        )

    @classmethod
    async def rename_session(cls, session_id: str, user_email: str, new_title: str):
        await cls.db.chat_sessions.find_one_and_update(
            {"session_id": session_id, "user_email": user_email},
            {"$set": {"title": new_title}}
        )

    @classmethod
    async def get_stats(cls, user_email: str) -> dict:
        total = await cls.db.chat_sessions.count_documents(
            {"user_email": user_email, "is_archived": False}
        )
        pipeline = [
            {"$match": {"user_email": user_email, "is_archived": False}},
            {"$group": {"_id": None, "total_messages": {"$sum": "$message_count"}}}
        ]
        result = await cls.db.chat_sessions.aggregate(pipeline).to_list(1)
        total_messages = result[0]["total_messages"] if result else 0
        return {"total_sessions": total, "total_messages": total_messages}
