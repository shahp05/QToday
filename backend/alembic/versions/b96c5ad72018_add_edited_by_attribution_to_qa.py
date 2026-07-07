"""add edited_by attribution to qa

Revision ID: b96c5ad72018
Revises: 5c35f8f149c2
Create Date: 2026-07-06 09:06:56.707175

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b96c5ad72018'
down_revision: Union[str, None] = '5c35f8f149c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('qa', sa.Column('edited_by_name', sa.String(length=200), nullable=True))
    op.add_column('qa', sa.Column('edited_by_school', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('qa', 'edited_by_school')
    op.drop_column('qa', 'edited_by_name')
