"""add unique constraint on quiz_challenges quiz_id qa_id

Revision ID: 0dedd88577e6
Revises: 5942970bf67b
Create Date: 2026-08-25 08:35:10.056132

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0dedd88577e6'
down_revision: Union[str, None] = '5942970bf67b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# NOTE: autogenerate also detected an unrelated pre-existing drift
# ('idx_quizzes_grade' index, 'users.start_date' column present in the db
# but not in models.py) — left out of this migration entirely since it's
# not part of this change and touching it wasn't asked for.
def upgrade() -> None:
    op.create_unique_constraint('quiz_challenges_quiz_id_qa_id_key', 'quiz_challenges', ['quiz_id', 'qa_id'])


def downgrade() -> None:
    op.drop_constraint('quiz_challenges_quiz_id_qa_id_key', 'quiz_challenges', type_='unique')
