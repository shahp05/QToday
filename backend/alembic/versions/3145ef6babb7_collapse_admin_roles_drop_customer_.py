"""collapse admin roles: drop customer_admins, fold is_cust_adm/is_superadm into is_adm

Revision ID: 3145ef6babb7
Revises: 1c54e77194bb
Create Date: 2026-06-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3145ef6babb7'
down_revision: Union[str, None] = '1c54e77194bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Multi-customer admins are out of scope (one admin account never manages more
# than one school), so the customer_admins join table added nothing that
# users.customer_id didn't already say — and its own is_superadm column was
# already dead (signup wrote it but nothing ever read it back). Collapsed to
# two flags on users: is_sysadm (this customer's owner/super admin when
# customer_id is set, or a true platform admin when it's NULL) and is_adm (an
# ordinary admin/teacher when customer_id is set; unused at the system level
# for now).


def upgrade() -> None:
    op.add_column('users', sa.Column('is_adm', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE users SET is_sysadm = TRUE WHERE is_cust_adm = TRUE")
    op.drop_column('users', 'is_cust_adm')
    op.drop_column('users', 'is_superadm')
    op.drop_index('idx_cust_admins_customer', table_name='customer_admins')
    op.drop_table('customer_admins')


def downgrade() -> None:
    op.create_table('customer_admins',
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('is_superadm', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('is_adm', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('date_created', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modified', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_deleted', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.customer_id']),
        sa.PrimaryKeyConstraint('admin_id'),
    )
    op.create_index('idx_cust_admins_customer', 'customer_admins', ['customer_id'], unique=False)
    op.add_column('users', sa.Column('is_cust_adm', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('is_superadm', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE users SET is_cust_adm = TRUE WHERE is_sysadm = TRUE AND customer_id IS NOT NULL")
    op.drop_column('users', 'is_adm')
