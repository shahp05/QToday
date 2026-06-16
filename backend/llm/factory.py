"""
Purpose -> provider routing.

Every service (qa_service today, batch/quiz services later) asks for
a client by *purpose*, not by provider name. Which provider/model
actually handles a purpose is configured in app_settings
(llm_provider_map / llm_model_map) — change it there, no code change
or redeploy needed.
"""
import os
from enum import Enum

from config.app_config import get_setting
from llm.client import LLMClient


class LLMPurpose(str, Enum):
    VALIDATE = "validate"   # cheap judgment calls: match disambiguation, subject/topic validity
    GENERATE = "generate"   # actual QA content generation


_PROVIDER_DEFAULTS = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "env_key": "GROQ_API_KEY",
        "default_model": "llama-3.3-70b-versatile",
    },
    "openai": {
        "base_url": None,
        "env_key": "OPENAI_API_KEY",
        "default_model": "gpt-4o",
    },
}


def get_llm_client(purpose: LLMPurpose) -> LLMClient:
    provider_map = get_setting("llm_provider_map", {"validate": "groq", "generate": "openai"})
    provider = provider_map.get(purpose.value, "openai")

    if provider not in _PROVIDER_DEFAULTS:
        raise ValueError(f"Unknown LLM provider '{provider}' configured for purpose '{purpose.value}'")

    cfg = _PROVIDER_DEFAULTS[provider]
    api_key = os.getenv(cfg["env_key"])
    if not api_key:
        raise RuntimeError(
            f"{cfg['env_key']} not set in .env — required for LLM purpose '{purpose.value}' (provider: {provider})"
        )

    model_map = get_setting("llm_model_map", {})
    model = model_map.get(provider, cfg["default_model"])

    return LLMClient(api_key=api_key, model=model, base_url=cfg["base_url"])
