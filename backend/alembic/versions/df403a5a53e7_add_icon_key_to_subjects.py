"""add icon_key to subjects

Revision ID: df403a5a53e7
Revises: b96c5ad72018
Create Date: 2026-07-08 09:28:54.266697

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'df403a5a53e7'
down_revision: Union[str, None] = 'b96c5ad72018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subjects', sa.Column('icon_key', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('subjects', 'icon_key')
