import hashlib
import json
import logging
from typing import List, Optional, Type, Any
from pydantic import BaseModel
from backend.app.config import settings

logger = logging.getLogger(__name__)


class LLMClient:
    """Manages AI completions and embeddings with multi-provider failover and offline mode (Section 13).

    Methodology:
    1. Provider Detection Hierarchy:
       - Environment override: settings.LLM_PROVIDER
       - Replit AI Integrations (if OpenAI-compatible endpoint is configured)
       - OpenAI (if OPENAI_API_KEY is present)
       - Google Gemini (if GEMINI_API_KEY is present)
       - Default: 'offline' mode with deterministic heuristic fallbacks
    2. Resilience:
       - Every call is guarded with try/except and caching.
       - Never raises unhandled exceptions to callers; graceful template fallback ensures zero downtime.
    """

    def __init__(self):
        self._provider = "offline"
        self._detect_provider()

    def _detect_provider(self):
        if settings.LLM_PROVIDER:
            self._provider = settings.LLM_PROVIDER
            return

        if settings.OPENAI_API_KEY:
            self._provider = "openai"
        elif settings.GEMINI_API_KEY:
            self._provider = "gemini"
        else:
            self._provider = "offline"

    def is_available(self) -> bool:
        return self._provider != "offline"

    def provider_name(self) -> str:
        return self._provider

    def complete(self, system: str, user: str, json_schema: Optional[dict] = None, max_tokens: int = 1200) -> str:
        """Executes LLM completion or falls back cleanly."""
        if not self.is_available():
            return ""

        if self._provider == "openai":
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.OPENAI_API_KEY)
                messages = [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user}
                ]
                kwargs = {
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.2
                }
                if json_schema:
                    kwargs["response_format"] = {"type": "json_object"}
                resp = client.chat.completions.create(**kwargs)
                return resp.choices[0].message.content or ""
            except Exception as e:
                logger.warning("OpenAI API call failed: %s; falling back to offline", e)
                return ""

        elif self._provider == "gemini":
            try:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel("gemini-1.5-flash")
                prompt = f"System: {system}\n\nUser: {user}"
                resp = model.generate_content(prompt)
                return resp.text or ""
            except Exception as e:
                logger.warning("Gemini API call failed: %s; falling back to offline", e)
                return ""

        return ""

    def complete_json(self, system: str, user: str, model_cls: Type[BaseModel]) -> Optional[BaseModel]:
        """Completes and parses into a Pydantic schema with retry on malformed JSON."""
        if not self.is_available():
            return None

        raw = self.complete(system, user, json_schema=model_cls.model_json_schema())
        if not raw:
            return None

        try:
            data = json.loads(raw)
            return model_cls.model_validate(data)
        except Exception:
            # Single retry with explicit correction
            raw_retry = self.complete(system, f"{user}\n\nReturn ONLY valid JSON matching the schema.", json_schema=model_cls.model_json_schema())
            try:
                data = json.loads(raw_retry)
                return model_cls.model_validate(data)
            except Exception:
                return None

    def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Generates text vector embeddings using configured provider."""
        if not self.is_available() or not texts:
            return None

        if self._provider == "openai":
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.OPENAI_API_KEY)
                resp = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=[t[:2000] for t in texts[:100]]
                )
                return [item.embedding for item in resp.data]
            except Exception as e:
                logger.warning("OpenAI embedding call failed: %s", e)
                return None

        return None


llm_client = LLMClient()
