"""Grade-related helpers shared between qa_service (foreground) and the
future background batch service (generates QA for grade+1..grade_relevant_to)."""
from config.app_config import get_setting


def compute_grade_relevant_to(grade: int) -> int:
    """
    grade <= 5            -> grade + increment   (default +2)
    grade in override_6 band (6-7, configurable floor) -> override_grade_6 (default 10)
    grade >= override_8 floor (default 8)              -> override_grade_8 (default 12)
    """
    increment = get_setting("grade_relevant_to_increment", 2)
    override_6_floor = 6
    override_8_floor = 8
    override_6_value = get_setting("grade_relevant_to_override_grade_6", 10)
    override_8_value = get_setting("grade_relevant_to_override_grade_8", 12)

    if grade >= override_8_floor:
        return override_8_value
    if grade >= override_6_floor:
        return override_6_value
    return min(grade + increment, 12)
