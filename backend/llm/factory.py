"""
Purpose -> model routing.

Every service (qa_service, quiz_scoring_service, etc.) asks for a client by
*purpose*, not by model name. Which model actually handles a purpose is
configured in app_settings (llm_model_map) — change it there, no code change
or redeploy needed. OpenAI is the only provider; a per-purpose model is still
useful (e.g. a cheaper/faster model for one purpose, a stronger one for
another that needs more reliable reasoning).
"""
import os
from enum import Enum

from config.app_config import get_setting
from llm.client import LLMClient

DEFAULT_MODEL = "gpt-4o"


class LLMPurpose(str, Enum):
    VALIDATE = "validate"   # judgment calls: match disambiguation, subject/topic validity, quiz/challenge scoring
    GENERATE = "generate"   # actual QA content generation


def get_llm_client(purpose: LLMPurpose) -> LLMClient:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            f"OPENAI_API_KEY not set in .env — required for LLM purpose '{purpose.value}'"
        )

    model_map = get_setting("llm_model_map", {})
    model = model_map.get(purpose.value, DEFAULT_MODEL)

    return LLMClient(api_key=api_key, model=model)
