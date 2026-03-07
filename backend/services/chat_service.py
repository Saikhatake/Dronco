
from langchain_groq import ChatGroq
from typing import Optional
import os

from langchain.memory import ConversationSummaryBufferMemory
from langchain.schema import HumanMessage, AIMessage
from langchain.chains import ConversationChain
from langchain.prompts import (
    ChatPromptTemplate,
    MessagesPlaceholder,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
)

SYSTEM_TEMPLATE = """You are Dr. Onco AI, an empathetic and knowledgeable AI health assistant 
built into the Dr. Onco platform — a breast cancer risk assessment tool.

## Your Expertise:
- Breast cancer risk factors, biomarkers, and early detection
- Explaining: BMI, Glucose, Insulin, HOMA-IR, Leptin, Adiponectin, Resistin, MCP-1
- Interpreting and simplifying medical report summaries
- Evidence-based lifestyle and prevention advice
- Emotional support and health motivation

## Current User Context:
{user_context}

## Conversation Rules:
1. Personalize every response using the user's prediction results and biomarkers above
2. Be concise — 2-4 paragraphs unless more is requested
3. Always explain medical terms in plain language when you use them
4. Be warm and encouraging — this topic causes anxiety for many people
5. Never diagnose or prescribe — always recommend consulting a real doctor
6. Reference this session's previous messages naturally when relevant
7. Gently redirect off-topic questions back to health
"""

def build_user_context(user_profile: dict, latest_prediction: Optional[dict], latest_report: Optional[dict]) -> str:
    parts = []
    if user_profile:
        parts.append(f"- Name: {user_profile.get('full_name', 'User')}")

    if latest_prediction:
        prob = latest_prediction.get("probability", 0) * 100
        parts.append(f"\n### Latest Risk Assessment:")
        parts.append(f"- Risk Level: {latest_prediction.get('risk_level', 'Unknown')}")
        parts.append(f"- Probability: {prob:.1f}%")
        biomarkers = latest_prediction.get("biomarkers", {})
        if biomarkers:
            parts.append("- Biomarkers: " + ", ".join(
                f"{k}={v}" for k, v in biomarkers.items() if v is not None
            ))

    if latest_report:
        s = latest_report.get("summary", "")
        if s:
            parts.append(f"\n### Latest Report Summary: {s[:250]}...")

    if not parts:
        parts.append("No health data available yet for this user.")
    return "\n".join(parts)


class LangChainChatService:
    def __init__(self):
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise RuntimeError("GROQ_API_KEY not set in .env")

        # ── Groq LLM ──────────────────────────────────────────────────────────
        # Available Groq models (pick one):
        #   "llama-3.3-70b-versatile"   ← best quality, recommended
        #   "llama-3.1-8b-instant"      ← fastest, lower quality
        #   "mixtral-8x7b-32768"        ← good balance, 32k context
        #   "gemma2-9b-it"              ← Google Gemma
        self.llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            groq_api_key=groq_api_key,
            max_tokens=1024,
            temperature=0.7,
        )

        # Separate smaller/faster model just for memory summarization
        # This saves Groq quota — compression uses llama-3.1-8b-instant
        self.summary_llm = ChatGroq(
            model="llama-3.1-8b-instant",
            groq_api_key=groq_api_key,
            max_tokens=512,
            temperature=0.3,
        )

        self.max_token_limit = 2000  # tokens kept verbatim per session

    def _rebuild_memory(self, session: dict) -> ConversationSummaryBufferMemory:
        """Reconstruct LangChain memory from session's stored data."""
        memory = ConversationSummaryBufferMemory(
            llm=self.summary_llm,   # use fast model for summarization
            max_token_limit=self.max_token_limit,
            return_messages=True,
            memory_key="chat_history",
            human_prefix="User",
            ai_prefix="Dr. Onco AI",
        )
        if session.get("summary"):
            memory.moving_summary_buffer = session["summary"]
        for msg in session.get("messages", []):
            if msg["role"] == "user":
                memory.chat_memory.add_user_message(msg["content"])
            elif msg["role"] == "assistant":
                memory.chat_memory.add_ai_message(msg["content"])
        return memory

    def _serialize_memory(self, memory: ConversationSummaryBufferMemory) -> dict:
        """Extract memory state into plain dict for MongoDB storage."""
        messages = []
        for msg in memory.chat_memory.messages:
            if isinstance(msg, HumanMessage):
                messages.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                messages.append({"role": "assistant", "content": msg.content})
        return {
            "messages": messages,
            "summary": memory.moving_summary_buffer or "",
        }

    def chat(
        self,
        user_message: str,
        session: dict,
        user_profile: dict,
        latest_prediction: Optional[dict] = None,
        latest_report: Optional[dict] = None,
    ) -> dict:
        is_first_message = len(session.get("messages", [])) == 0

        user_context = build_user_context(user_profile, latest_prediction, latest_report)
        system_prompt = SYSTEM_TEMPLATE.format(user_context=user_context)

        memory = self._rebuild_memory(session)

        prompt = ChatPromptTemplate.from_messages([
            SystemMessagePromptTemplate.from_template(system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            HumanMessagePromptTemplate.from_template("{input}"),
        ])

        chain = ConversationChain(
            llm=self.llm,       # main model for responses
            prompt=prompt,
            memory=memory,
            verbose=False,
        )
        response = chain.predict(input=user_message)
        serialized = self._serialize_memory(memory)

        return {
            "reply": response,
            "messages_to_save": serialized["messages"],
            "summary_to_save": serialized["summary"],
            "is_first_message": is_first_message,
            "has_summary": bool(serialized["summary"]),
            "message_count": len(serialized["messages"]),
        }

    def generate_session_title(self, first_message: str) -> str:
        title = first_message.strip()
        if len(title) > 50:
            title = title[:47] + "..."
        return title

    def get_session_stats(self, session: dict) -> dict:
        messages = session.get("messages", [])
        summary = session.get("summary", "")
        return {
            "message_count": len(messages),
            "user_messages": sum(1 for m in messages if m["role"] == "user"),
            "has_compressed_summary": bool(summary),
            "summary_preview": summary[:150] + "..." if len(summary) > 150 else summary,
        }
