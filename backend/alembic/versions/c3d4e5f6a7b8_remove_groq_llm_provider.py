"""remove groq, openai-only llm_model_map

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-07-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # llm_provider_map no longer applies — OpenAI is the only provider now.
    op.execute("DELETE FROM app_settings WHERE setting_key = 'llm_provider_map'")
    # llm_model_map is now keyed by purpose directly (validate/generate),
    # not by provider — and both purposes use gpt-4o now that scoring/
    # validation no longer runs on Groq's llama-3.3-70b-versatile.
    op.execute("""
        UPDATE app_settings
        SET setting_value = '{"validate":"gpt-4o","generate":"gpt-4o"}',
            description = 'Which OpenAI model handles each LLM purpose'
        WHERE setting_key = 'llm_model_map'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE app_settings
        SET setting_value = '{"groq":"llama-3.3-70b-versatile","openai":"gpt-4o"}',
            description = 'Which model each provider uses'
        WHERE setting_key = 'llm_model_map'
    """)
    op.execute("""
        INSERT INTO app_settings (setting_key, setting_value, description)
        VALUES ('llm_provider_map', '{"validate":"groq","generate":"openai"}', 'Which provider handles each LLM purpose')
        ON CONFLICT (setting_key) DO NOTHING
    """)
