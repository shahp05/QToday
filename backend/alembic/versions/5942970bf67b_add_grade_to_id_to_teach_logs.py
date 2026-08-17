"""add grade_to_id to teach_logs

Revision ID: 5942970bf67b
Revises: 33b073b16ef8
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5942970bf67b'
down_revision: Union[str, None] = '33b073b16ef8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Highest grade (by grade_name, via services.grade_rules) a taught
    # topic's QA should also be prepared for — see qa_service._finalize
    # and generate_missing_qa. Rule must be computed on grade_name (the
    # real 1-12 grade number), never grade_id, which isn't sequential with
    # grade_name (seeded in migration order, not grade order) — the CASE
    # below joins through grades twice for exactly that reason: once to
    # read each row's actual grade_name, once to resolve the rule's target
    # grade_name back to its own grade_id.
    op.add_column('teach_logs', sa.Column('grade_to_id', sa.Integer(), nullable=True))
    op.execute("""
        UPDATE teach_logs tl
        SET grade_to_id = g2.grade_id
        FROM grades g1
        JOIN grades g2 ON g2.grade_name = (
            CASE
                WHEN g1.grade_name >= 9 THEN 12
                WHEN g1.grade_name >= 6 THEN 10
                ELSE g1.grade_name + 2
            END
        )
        WHERE tl.grade_id = g1.grade_id
    """)
    op.alter_column('teach_logs', 'grade_to_id', nullable=False)
    op.create_foreign_key(
        'teach_logs_grade_to_id_fkey', 'teach_logs', 'grades', ['grade_to_id'], ['grade_id'],
    )


def downgrade() -> None:
    op.drop_constraint('teach_logs_grade_to_id_fkey', 'teach_logs', type_='foreignkey')
    op.drop_column('teach_logs', 'grade_to_id')
