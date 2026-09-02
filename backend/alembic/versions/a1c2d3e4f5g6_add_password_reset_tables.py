"""add_password_reset_tables

Revision ID: a1c2d3e4f5g6
Revises: 2966f35da88e
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1c2d3e4f5g6'
down_revision: Union[str, None] = '2966f35da88e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'password_reset_verifications',
        sa.Column('verification_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=6), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('attempt_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('verification_id'),
    )
    op.create_index('idx_prv_user', 'password_reset_verifications', ['user_id'], unique=False)
    op.create_index('idx_prv_expires', 'password_reset_verifications', ['expires_at'], unique=False)

    op.create_table(
        'password_reset_requests',
        sa.Column('request_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date_created', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_reset', sa.DateTime(), nullable=True),
        sa.Column('reset_flag', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('resolved_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['resolved_by_user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('request_id'),
    )
    op.create_index(
        'uq_prr_open_per_user', 'password_reset_requests', ['user_id'],
        unique=True, postgresql_where=sa.text('reset_flag = false'),
    )


def downgrade() -> None:
    op.drop_index('uq_prr_open_per_user', table_name='password_reset_requests')
    op.drop_table('password_reset_requests')

    op.drop_index('idx_prv_expires', table_name='password_reset_verifications')
    op.drop_index('idx_prv_user', table_name='password_reset_verifications')
    op.drop_table('password_reset_verifications')
