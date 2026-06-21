"""add password_date_created to users

Revision ID: 53611ad852b6
Revises: a784d7cf0003
Create Date: 2026-06-21 17:44:03.974096

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '53611ad852b6'
down_revision: Union[str, None] = 'a784d7cf0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# NOTE: autogenerate also detected signup_verifications as a drop, since that
# table is managed via raw SQL in schema.sql rather than a SQLAlchemy model —
# intentionally omitted here, same pattern as the error_logs migration note.


def upgrade() -> None:
    op.add_column('users', sa.Column('password_date_created', sa.DateTime(), nullable=True))
    # Backfill: existing rows have never had their password changed via the
    # app, so treat their password as set at account-creation time.
    op.execute("UPDATE users SET password_date_created = date_created WHERE password_date_created IS NULL")
    op.alter_column('users', 'password_date_created', nullable=False, server_default=sa.text('now()'))


def downgrade() -> None:
    op.drop_column('users', 'password_date_created')
