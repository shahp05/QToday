"""drop account_topics table

Revision ID: 466615415168
Revises: 16fe6f024228
Create Date: 2026-07-02 10:39:26.909252

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '466615415168'
down_revision: Union[str, None] = '16fe6f024228'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('idx_acct_topics_customer', table_name='account_topics')
    op.drop_index('idx_acct_topics_student', table_name='account_topics')
    op.drop_index('uidx_acct_topics_customer', table_name='account_topics', postgresql_where='(customer_id IS NOT NULL)')
    op.drop_index('uidx_acct_topics_student', table_name='account_topics', postgresql_where='(student_id IS NOT NULL)')
    op.drop_table('account_topics')


def downgrade() -> None:
    op.create_table('account_topics',
    sa.Column('account_topic_id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('customer_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('subject_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('topic_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('grade_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('grade_relevant_to_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('section', sa.VARCHAR(length=5), autoincrement=False, nullable=True),
    sa.Column('date_created', postgresql.TIMESTAMP(), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('date_modified', postgresql.TIMESTAMP(), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('date_deleted', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('is_active', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('student_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.CheckConstraint('customer_id IS NOT NULL AND student_id IS NULL OR student_id IS NOT NULL AND customer_id IS NULL', name='chk_account'),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.customer_id'], name='account_topics_customer_id_fkey'),
    sa.ForeignKeyConstraint(['grade_id'], ['grades.grade_id'], name='account_topics_grade_id_fkey'),
    sa.ForeignKeyConstraint(['grade_relevant_to_id'], ['grades.grade_id'], name='account_topics_grade_relevant_to_id_fkey'),
    sa.ForeignKeyConstraint(['student_id'], ['students.student_id'], name='account_topics_student_id_fkey'),
    sa.ForeignKeyConstraint(['subject_id'], ['subjects.subject_id'], name='account_topics_subject_id_fkey'),
    sa.ForeignKeyConstraint(['topic_id'], ['topics.topic_id'], name='account_topics_topic_id_fkey'),
    sa.PrimaryKeyConstraint('account_topic_id', name='account_topics_pkey')
    )
    op.create_index('uidx_acct_topics_student', 'account_topics', ['student_id', 'subject_id', 'topic_id', 'grade_id'], unique=True, postgresql_where='(student_id IS NOT NULL)')
    op.create_index('uidx_acct_topics_customer', 'account_topics', ['customer_id', 'subject_id', 'topic_id', 'grade_id'], unique=True, postgresql_where='(customer_id IS NOT NULL)')
    op.create_index('idx_acct_topics_student', 'account_topics', ['student_id'], unique=False)
    op.create_index('idx_acct_topics_customer', 'account_topics', ['customer_id'], unique=False)
