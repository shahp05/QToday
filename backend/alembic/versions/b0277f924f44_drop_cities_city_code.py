"""drop cities.city_code — no external standard exists for it, not needed

Revision ID: b0277f924f44
Revises: 6db6c8ec5b92
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b0277f924f44'
down_revision: Union[str, None] = '6db6c8ec5b92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('cities', 'city_code')


def downgrade() -> None:
    op.add_column('cities', sa.Column('city_code', sa.String(3), nullable=False, server_default='XXX'))
    op.alter_column('cities', 'city_code', server_default=None)
