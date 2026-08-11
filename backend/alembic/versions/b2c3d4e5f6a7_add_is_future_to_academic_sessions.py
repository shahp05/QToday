"""add is_future to academic_sessions

Revision ID: b2c3d4e5f6a7
Revises: f7a8b9c0d1e2
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'academic_sessions',
        sa.Column('is_future', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    op.create_index(
        'uq_academic_sessions_future_per_customer', 'academic_sessions', ['customer_id'],
        unique=True, postgresql_where=sa.text('is_future = true'),
    )


def downgrade() -> None:
    op.drop_index('uq_academic_sessions_future_per_customer', table_name='academic_sessions')
    op.drop_column('academic_sessions', 'is_future')
