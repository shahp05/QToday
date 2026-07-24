"""add grade_id to quizzes

Revision ID: a1b2c3d4e5f6
Revises: df403a5a53e7
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'df403a5a53e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quizzes', sa.Column('grade_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'quizzes_grade_id_fkey', 'quizzes', 'grades', ['grade_id'], ['grade_id'],
    )
    op.create_index('idx_quizzes_grade', 'quizzes', ['grade_id'], unique=False)

    # Backfill existing rows from quiz_scores -> qa.grade_id: every QuizScore
    # row for a quiz was sampled from the same (topic_id, grade_id) pair (see
    # quiz_service.get_quiz_questions), so any one of its qa rows carries the
    # grade the quiz was actually played at.
    op.execute("""
        UPDATE quizzes
        SET grade_id = backfill.grade_id
        FROM (
            SELECT DISTINCT ON (qs.quiz_id) qs.quiz_id, qa.grade_id
            FROM quiz_scores qs
            JOIN qa ON qa.qa_id = qs.qa_id
            ORDER BY qs.quiz_id, qs.quiz_score_id
        ) AS backfill
        WHERE quizzes.quiz_id = backfill.quiz_id
    """)


def downgrade() -> None:
    op.drop_index('idx_quizzes_grade', table_name='quizzes')
    op.drop_constraint('quizzes_grade_id_fkey', 'quizzes', type_='foreignkey')
    op.drop_column('quizzes', 'grade_id')
