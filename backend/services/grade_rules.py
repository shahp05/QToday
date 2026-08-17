"""
Rules for how far a taught topic's QA should extend across future grades,
so a student who has since advanced past the grade it was taught in can
still quiz on it for retention. Central here — not duplicated between
qa_service._finalize (sets teach_logs.grade_to_id on insert) and
qa_service.generate_missing_qa (walks the resulting range).

Expressed entirely in terms of Grade.grade_name (the real 1-12 grade
number) — never grade_id, which is not sequential with grade_name (it was
assigned in migration/seed order, not grade order; e.g. grade_name 4 has
a higher grade_id than grade_name 10). Callers convert grade_name to/from
grade_id via a Grade lookup; nothing here ever compares grade_id values.
"""


def target_grade_name(grade: int) -> int:
    """Highest grade_name a topic taught at `grade` should also have QA
    prepared for. Grades 6-8 and 9-12 are capped at the two board-exam
    years (10, 12) rather than a flat +2, matching how the curriculum
    itself groups those bands; everything below 6 just gets +2."""
    if grade >= 9:
        return 12
    if grade >= 6:
        return 10
    return grade + 2


def grade_name_range(grade: int) -> list[int]:
    """Every grade_name from `grade` through target_grade_name(grade),
    inclusive — the full set a taught topic's QA should span."""
    return list(range(grade, target_grade_name(grade) + 1))
