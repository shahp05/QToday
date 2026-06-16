"""add error_logs table

Revision ID: c1441996b1b6
Revises: 41960297c7a7
Create Date: 2026-06-16 11:53:34.691489

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c1441996b1b6'
down_revision: Union[str, None] = '41960297c7a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# NOTE: autogenerate also detected Procrastinate's own internal tables
# (procrastinate_jobs, procrastinate_events, procrastinate_periodic_defers,
# procrastinate_workers) as "should be dropped", since they aren't part of
# our SQLAlchemy metadata. Those statements have been stripped from this
# migration — Procrastinate owns and manages its own schema via its own
# CLI (`procrastinate schema --apply`), never via our Alembic migrations.


def upgrade() -> None:
    op.create_table('error_logs',
    sa.Column('error_log_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.Column('error_code', sa.String(length=50), nullable=False),
    sa.Column('err_description', sa.Text(), nullable=False),
    sa.Column('stack_trace', sa.Text(), nullable=True),
    sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('correlation_id', sa.String(length=50), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('date_created', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('date_deleted', sa.DateTime(), nullable=True),
    sa.CheckConstraint("type IN ('api', 'batch', 'frontend')", name='chk_error_log_type'),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
    sa.PrimaryKeyConstraint('error_log_id')
    )
    op.create_index('idx_error_logs_code', 'error_logs', ['error_code'], unique=False)
    op.create_index('idx_error_logs_correlation', 'error_logs', ['correlation_id'], unique=False)
    op.create_index('idx_error_logs_created', 'error_logs', ['date_created'], unique=False)
    op.create_index('idx_error_logs_type', 'error_logs', ['type'], unique=False)
    op.create_index('idx_error_logs_user', 'error_logs', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_error_logs_user', table_name='error_logs')
    op.drop_index('idx_error_logs_type', table_name='error_logs')
    op.drop_index('idx_error_logs_created', table_name='error_logs')
    op.drop_index('idx_error_logs_correlation', table_name='error_logs')
    op.drop_index('idx_error_logs_code', table_name='error_logs')
    op.drop_table('error_logs')
