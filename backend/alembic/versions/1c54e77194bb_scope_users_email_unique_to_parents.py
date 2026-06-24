"""scope users.email_id unique constraint to parent accounts only

Revision ID: 1c54e77194bb
Revises: 53611ad852b6
Create Date: 2026-06-23 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '1c54e77194bb'
down_revision: Union[str, None] = '53611ad852b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# A parent and an admin/teacher account can legitimately share the same
# email address — they are separate login identities (login_key differs:
# org_id@acronym for staff/students, the email itself for parents). The
# global UNIQUE(email_id) blocked that, so it's replaced with a partial
# unique index that only constrains parent-flagged rows: at most one
# parent account per email, reused across that parent's children/schools.


def upgrade() -> None:
    op.drop_constraint('users_email_id_key', 'users', type_='unique')
    op.create_index(
        'uidx_users_email_parent',
        'users',
        ['email_id'],
        unique=True,
        postgresql_where=sa.text('is_parent = true'),
    )


def downgrade() -> None:
    op.drop_index('uidx_users_email_parent', table_name='users', postgresql_where=sa.text('is_parent = true'))
    op.create_unique_constraint('users_email_id_key', 'users', ['email_id'])
