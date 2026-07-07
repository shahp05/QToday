"""
Thin, provider-agnostic LLM client.

Groq exposes an OpenAI-compatible API (just a different base_url and
API key), so one client class covers both providers — and any other
OpenAI-compatible provider added later. Structured output is requested
via JSON mode (response_format=json_object) rather than provider-specific
strict JSON schema, since that support varies across providers; callers
validate the parsed dict against a Pydantic model themselves.
"""
import json

from openai import AsyncOpenAI


class LLMClient:
    def __init__(self, *, api_key: str, model: str, base_url: str | None = None):
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    async def generate_json(
        self, *, system: str, user: str, temperature: float = 0.3, max_tokens: int | None = None
    ) -> dict:
        """Call the model and parse its response as JSON.

        Raises json.JSONDecodeError if the model didn't return valid JSON —
        callers should treat that as a retryable failure, not a silent default.
        Raises RuntimeError if the response was cut off by the token limit —
        a truncated JSON payload can otherwise parse as valid-but-incomplete
        data instead of failing loudly.
        """
        response = await self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=max_tokens,
        )
        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise RuntimeError(
                f"LLM response truncated at max_tokens={max_tokens} — treat as a retryable failure."
            )
        return json.loads(choice.message.content)
