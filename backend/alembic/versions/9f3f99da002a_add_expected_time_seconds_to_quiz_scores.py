"""add expected_time_seconds to quiz_scores

Revision ID: 9f3f99da002a
Revises: 0dedd88577e6
Create Date: 2026-08-26 09:37:21.299639

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f3f99da002a'
down_revision: Union[str, None] = '0dedd88577e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quiz_scores', sa.Column('expected_time_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('quiz_scores', 'expected_time_seconds')
