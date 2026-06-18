"""add_signup_verifications_table

Revision ID: a784d7cf0003
Revises: c1441996b1b6
Create Date: 2026-06-18 09:38:20.125887

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a784d7cf0003'
down_revision: Union[str, None] = 'c1441996b1b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'signup_verifications',
        sa.Column('verification_id', sa.Integer(), nullable=False),
        sa.Column('email_id', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=6), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('attempt_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('verification_id'),
    )
    op.create_index('idx_sv_email', 'signup_verifications', ['email_id'], unique=False)
    op.create_index('idx_sv_expires', 'signup_verifications', ['expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_sv_expires', table_name='signup_verifications')
    op.drop_index('idx_sv_email', table_name='signup_verifications')
    op.drop_table('signup_verifications')
