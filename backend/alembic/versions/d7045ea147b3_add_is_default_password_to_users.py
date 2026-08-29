"""add is_default_password to users

Revision ID: d7045ea147b3
Revises: 9f3f99da002a
Create Date: 2026-08-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd7045ea147b3'
down_revision: Union[str, None] = '9f3f99da002a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_default_password', sa.Boolean(), nullable=True))
    # Backfill using the old timestamp-equality signal (still correct for
    # every existing row, since no reset flow has run yet).
    op.execute(
        "UPDATE users SET is_default_password = (password_date_created = date_created) "
        "WHERE is_default_password IS NULL"
    )
    op.alter_column('users', 'is_default_password', nullable=False, server_default=sa.text('true'))


def downgrade() -> None:
    op.drop_column('users', 'is_default_password')
