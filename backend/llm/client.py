"""
Thin OpenAI client wrapper.

Structured output is requested via JSON mode (response_format=json_object)
rather than strict JSON schema, since callers validate the parsed dict
against a Pydantic model themselves.
"""
import json

from openai import AsyncOpenAI


class LLMClient:
    def __init__(self, *, api_key: str, model: str):
        self._client = AsyncOpenAI(api_key=api_key)
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

    def _completion_body(self, *, system: str, user: str, temperature: float, max_tokens: int | None) -> dict:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": temperature,
        }
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        return body

    async def submit_batch(self, requests: list[dict]) -> tuple[str, str]:
        """Submits one OpenAI Batch API job covering every request in one
        call. Each request is {"custom_id", "system", "user", "temperature",
        "max_tokens"} — same shape generate_json takes, just not awaited
        individually. Returns (batch_id, input_file_id); results aren't
        available yet, poll get_batch_status/fetch_batch_results later.
        Uses the 24h completion window — the cheapest tier, appropriate
        for background top-ups that don't block a student."""
        lines = [
            json.dumps({
                "custom_id": req["custom_id"],
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": self._completion_body(
                    system=req["system"], user=req["user"],
                    temperature=req.get("temperature", 0.3), max_tokens=req.get("max_tokens"),
                ),
            })
            for req in requests
        ]
        jsonl_bytes = ("\n".join(lines) + "\n").encode("utf-8")

        uploaded = await self._client.files.create(file=("batch_input.jsonl", jsonl_bytes), purpose="batch")
        batch = await self._client.batches.create(
            input_file_id=uploaded.id, endpoint="/v1/chat/completions", completion_window="24h",
        )
        return batch.id, uploaded.id

    async def get_batch_status(self, batch_id: str) -> dict:
        batch = await self._client.batches.retrieve(batch_id)
        return {
            "status": batch.status,
            "output_file_id": batch.output_file_id,
            "error_file_id": batch.error_file_id,
        }

    async def fetch_batch_results(self, output_file_id: str) -> dict[str, dict]:
        """Downloads a completed batch's output file and parses it into
        {custom_id: parsed_json_body}. A line that errored, was truncated
        (finish_reason == 'length'), or failed to parse is simply omitted —
        same "absence means retryable failure" contract generate_json uses
        for a single call, just applied per line instead of failing the
        whole batch."""
        content = await self._client.files.content(output_file_id)
        results: dict[str, dict] = {}
        for line in content.text.strip().splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            custom_id = record.get("custom_id")
            response = record.get("response")
            if not custom_id or not response or response.get("status_code") != 200:
                continue
            try:
                choice = response["body"]["choices"][0]
                if choice.get("finish_reason") == "length":
                    continue
                results[custom_id] = json.loads(choice["message"]["content"])
            except (KeyError, IndexError, TypeError, json.JSONDecodeError):
                continue
        return results
