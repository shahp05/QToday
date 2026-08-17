"""add logged_at to teach_logs

Revision ID: 33b073b16ef8
Revises: 61bc6195f762
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '33b073b16ef8'
down_revision: Union[str, None] = '61bc6195f762'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # date_created is overloaded as "the date this lesson was taught" (see
    # qa_service._finalize's log_date handling) — logging a lesson via the
    # calendar backdates date_created's DATE portion to that past date, so
    # it can't be used to tell how long ago the row was actually inserted.
    # generate_missing_qa needs exactly that (real insertion time, never
    # backdated) to skip teach_logs still within the real-time QA fetch's
    # race window rather than double-generating.
    op.add_column('teach_logs', sa.Column('logged_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE teach_logs SET logged_at = date_created WHERE logged_at IS NULL")
    op.alter_column('teach_logs', 'logged_at', nullable=False, server_default=sa.text('now()'))


def downgrade() -> None:
    op.drop_column('teach_logs', 'logged_at')
