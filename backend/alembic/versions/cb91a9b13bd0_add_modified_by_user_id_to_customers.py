"""add modified_by_user_id to customers

Revision ID: cb91a9b13bd0
Revises: d7045ea147b3
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'cb91a9b13bd0'
down_revision: Union[str, None] = 'd7045ea147b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('modified_by_user_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_customers_modified_by_user_id', 'customers', 'users',
        ['modified_by_user_id'], ['user_id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_customers_modified_by_user_id', 'customers', type_='foreignkey')
    op.drop_column('customers', 'modified_by_user_id')
