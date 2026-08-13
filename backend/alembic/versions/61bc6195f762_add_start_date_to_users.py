"""add start_date to users

Revision ID: 61bc6195f762
Revises: b2c3d4e5f6a7
Create Date: 2026-08-13 09:47:10.413229

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '61bc6195f762'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL for everyone (the ordinary case — a normal upload/signup, no
    # future-session staging involved). Only ever set for a teacher/admin
    # row created via a future-session teacher upload (see
    # teachers_upload_service.py) — the CHECK constraint below enforces
    # that at the database level rather than by convention/comment alone,
    # since users is shared by every role (students, parents, teachers,
    # admins) and a start_date on a student/parent row would be silently
    # meaningless — easy for a future change to set by mistake and never
    # notice, since nothing would visibly break until someone went looking
    # for why a student wasn't showing up.
    op.add_column('users', sa.Column('start_date', sa.Date(), nullable=True))
    op.create_check_constraint(
        'ck_users_start_date_admin_only',
        'users',
        'start_date IS NULL OR is_adm = TRUE OR is_sysadm = TRUE',
    )


def downgrade() -> None:
    op.drop_constraint('ck_users_start_date_admin_only', 'users', type_='check')
    op.drop_column('users', 'start_date')
