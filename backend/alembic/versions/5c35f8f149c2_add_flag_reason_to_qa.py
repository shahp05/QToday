"""add flag_reason to qa

Revision ID: 5c35f8f149c2
Revises: 466615415168
Create Date: 2026-07-06 08:52:57.841119

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5c35f8f149c2'
down_revision: Union[str, None] = '466615415168'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('qa', sa.Column('flag_reason', sa.String(length=20), nullable=True))
    op.create_check_constraint(
        'chk_flag_reason',
        'qa',
        "flag_reason IS NULL OR flag_reason IN ('incorrect', 'unclear', 'irrelevant')",
    )


def downgrade() -> None:
    op.drop_constraint('chk_flag_reason', 'qa', type_='check')
    op.drop_column('qa', 'flag_reason')
