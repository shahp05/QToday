"""add academic_sessions table

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('academic_sessions',
    sa.Column('session_id', sa.Integer(), nullable=False),
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=100), nullable=False),
    sa.Column('start_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=False),
    sa.Column('is_current', sa.Boolean(), nullable=False),
    sa.Column('date_created', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('date_modified', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('date_deleted', sa.DateTime(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.customer_id'], ),
    sa.PrimaryKeyConstraint('session_id')
    )
    op.create_index('idx_academic_sessions_customer', 'academic_sessions', ['customer_id'], unique=False)
    op.create_index(
        'uq_academic_sessions_current_per_customer', 'academic_sessions', ['customer_id'],
        unique=True, postgresql_where=sa.text('is_current = true'),
    )

    op.add_column('teach_logs', sa.Column('session_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'teach_logs', 'academic_sessions', ['session_id'], ['session_id'])
    op.create_index('idx_teach_logs_session', 'teach_logs', ['customer_id', 'session_id'], unique=False)

    op.add_column('student_grades', sa.Column('session_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'student_grades', 'academic_sessions', ['session_id'], ['session_id'])
    op.create_index('idx_student_grades_session', 'student_grades', ['session_id', 'student_id'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_student_grades_session', table_name='student_grades')
    op.drop_constraint('student_grades_session_id_fkey', 'student_grades', type_='foreignkey')
    op.drop_column('student_grades', 'session_id')

    op.drop_index('idx_teach_logs_session', table_name='teach_logs')
    op.drop_constraint('teach_logs_session_id_fkey', 'teach_logs', type_='foreignkey')
    op.drop_column('teach_logs', 'session_id')

    op.drop_index('uq_academic_sessions_current_per_customer', table_name='academic_sessions')
    op.drop_index('idx_academic_sessions_customer', table_name='academic_sessions')
    op.drop_table('academic_sessions')
