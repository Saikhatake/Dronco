"""
LLM Service for medical report summarization using Groq API
"""

import os
import json
from groq import Groq


class LLMSummarizerService:
    """Service for summarizing medical reports using Groq LLM"""

    def __init__(self):
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not found in environment variables")

        self.client = Groq(api_key=api_key)
        self.model = "openai/gpt-oss-120b"  # Best for medical accuracy
        print("✅ Groq API configured successfully")

    def summarize_medical_report(self, report_text: str) -> dict:
        """
        Summarize a medical report using Groq LLM ONLY
        """
        if not report_text or len(report_text.strip()) < 50:
            raise ValueError("Medical report text is too short or empty")

        prompt = f"""
You are a senior clinical medical AI assistant writing for a hospital-grade patient portal.

Analyze the medical report below and return a structured clinical summary.

STRICT RULES:
1. EXECUTIVE SUMMARY — Use professional clinical language. Never write casual phrases like
   "nothing to worry about" or "you're fine". Instead write formally, e.g.:
   "No clinically significant abnormalities detected. Findings are within acceptable
   physiological parameters. Routine follow-up recommended if clinically indicated."
   Keep it 3–5 sentences.

2. KEY FINDINGS — For every lab value or test result, include:
   - The test name
   - The patient's actual value with units
   - Whether it is normal, borderline, or abnormal
   - The standard reference range in parentheses
   Format EXACTLY like this:
   "Hemoglobin 13.6 g/dL — within normal range (12.0–15.5 g/dL)"
   "Fasting Blood Sugar 112 mg/dL — borderline high (normal: 70–100 mg/dL)"
   "LDL Cholesterol 168 mg/dL — elevated (optimal: <100 mg/dL)"
   If a value or unit is not present in the report, do NOT invent it — write only what is stated.

3. MEDICAL TERMS — Explain each technical term in 1–2 simple sentences a patient can understand.

4. RISK INDICATORS — List any borderline, elevated, or abnormal findings that need attention.
   Use clinical phrasing: "Mildly elevated fasting glucose may indicate early insulin resistance."

5. RECOMMENDED ACTIONS — List clear, actionable next steps using clinical language.
   e.g. "Schedule follow-up lipid panel in 3 months."
   e.g. "Repeat fasting glucose test after dietary modification."

6. DO NOT hallucinate any values, ranges, or findings not present in the report.
7. DO NOT add legal or liability disclaimers.
8. Return ONLY valid JSON — no markdown, no explanation outside JSON.

JSON FORMAT (EXACT — do not rename any keys):

{{
  "summary": "3–5 sentence clinical overview",
  "key_findings": [
    "Test Name VALUE units — status (reference range)",
    "Test Name VALUE units — status (reference range)"
  ],
  "medical_terms_explained": [
    {{
      "term": "Medical term from the report",
      "explanation": "Plain language explanation in 1–2 sentences"
    }}
  ],
  "risk_indicators": [
    "Clinical description of any borderline or abnormal finding"
  ],
  "recommended_actions": [
    "Specific clinical next step"
  ]
}}

MEDICAL REPORT:
\"\"\"
{report_text[:9000]}
\"\"\"
"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise clinical medical summarization AI for a hospital portal. "
                        "You write with professional medical accuracy. "
                        "You always include reference ranges for lab values. "
                        "You never use casual language in clinical summaries. "
                        "You return only valid JSON with no extra text."
                    )
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,  # Lower = more consistent, less hallucination
            max_tokens=1500,  # Increased to fit full ranges and clinical detail
        )

        raw_text = response.choices[0].message.content.strip()

        # Clean up markdown code fences if model adds them
        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()

        try:
            result = json.loads(raw_text)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"❌ Groq returned invalid JSON.\nRaw Output:\n{raw_text}"
            ) from e

        # ── Normalise key name: support both old and new LLM output ──
        # Frontend expects "recommended_actions"
        if "recommended_next_steps" in result and "recommended_actions" not in result:
            result["recommended_actions"] = result.pop("recommended_next_steps")

        return result

    def explain_medical_term(self, term: str) -> str:
        """
        Explain a medical term using Groq LLM
        """
        prompt = f"""
Explain the medical term "{term}" in very simple language that a patient with no medical
background can understand. Limit to 2–3 short sentences. Avoid all medical jargon.
"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You explain medical terms clearly to patients."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=150,
        )
        return response.choices[0].message.content.strip()
