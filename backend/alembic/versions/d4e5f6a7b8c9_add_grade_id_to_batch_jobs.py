"""add grade_id to batch_jobs

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # qa_generation batch jobs are scoped per grade (QA content is per
    # subject+topic+grade), same as subject_id/topic_id already on this
    # table — without it, batch_job_service.is_due can't tell apart two
    # grades' top-ups for the same topic.
    op.add_column('batch_jobs', sa.Column('grade_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'batch_jobs_grade_id_fkey', 'batch_jobs', 'grades', ['grade_id'], ['grade_id'],
    )
    op.create_index('idx_batch_jobs_grade', 'batch_jobs', ['grade_id'], unique=False)

    # qa_generation top-ups now also run on a 45-day staleness timer, not
    # just the row-count threshold (config/default_settings.py's
    # ensure_default_settings only backfills *missing* keys, so an existing
    # row's interval_days needs an explicit UPDATE here — same reasoning as
    # migration c3d4e5f6a7b8's llm_model_map update).
    op.execute("""
        UPDATE app_settings
        SET setting_value = jsonb_set(setting_value, '{qa_generation}', '{"interval_days": 45}')
        WHERE setting_key = 'batch_request_types'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE app_settings
        SET setting_value = jsonb_set(setting_value, '{qa_generation}', '{}')
        WHERE setting_key = 'batch_request_types'
    """)
    op.drop_index('idx_batch_jobs_grade', table_name='batch_jobs')
    op.drop_constraint('batch_jobs_grade_id_fkey', 'batch_jobs', type_='foreignkey')
    op.drop_column('batch_jobs', 'grade_id')
