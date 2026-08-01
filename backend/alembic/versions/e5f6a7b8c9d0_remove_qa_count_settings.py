"""remove dead qa_count/qa_refresh_count app_settings rows

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-01 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # qa_count: the real-time generation count is now derived from
    # default_questions_per_quiz (+50%), never a standalone setting.
    # qa_refresh_count: top-ups no longer generate a target count at all
    # (see conversation history — an exact/minimum-count instruction is
    # reserved for the first-ever, real-time batch only). Both are dead
    # now that qa_service.py no longer reads them.
    op.execute("DELETE FROM app_settings WHERE setting_key IN ('qa_count', 'qa_refresh_count')")


def downgrade() -> None:
    op.execute("""
        INSERT INTO app_settings (setting_key, setting_value, description)
        VALUES ('qa_count', '30', 'Total QA items generated per subject+topic+grade')
        ON CONFLICT (setting_key) DO NOTHING
    """)
    op.execute("""
        INSERT INTO app_settings (setting_key, setting_value, description)
        VALUES (
            'qa_refresh_count', '30',
            'Items generated on a purely time-triggered top-up with no shortfall to size the batch by'
        )
        ON CONFLICT (setting_key) DO NOTHING
    """)
