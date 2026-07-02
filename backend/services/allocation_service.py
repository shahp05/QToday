"""
Deterministic allocation of qa_count across (question_type x difficulty_level).

LLMs are unreliable at exact proportional allocation, especially across two
crossed dimensions, so this is computed in code and handed to the LLM as
exact integer counts per cell — not percentages.
"""
from config.app_config import get_setting


def _largest_remainder_round(weights: dict[str, float], total: int) -> dict[str, int]:
    """Round weighted shares of `total` to integers that sum exactly to `total`."""
    raw = {k: w * total for k, w in weights.items()}
    floors = {k: int(v) for k, v in raw.items()}
    remainder = total - sum(floors.values())

    # distribute the remainder to the keys with the largest fractional part
    fractional_order = sorted(raw.keys(), key=lambda k: raw[k] - floors[k], reverse=True)
    for i in range(remainder):
        floors[fractional_order[i % len(fractional_order)]] += 1
    return floors


def compute_allocation(qa_count: int, grade: int) -> dict[str, dict[int, int]]:
    """
    Returns e.g. {"descriptive": {1: 1, 2: 1, 3: 1, 4: 2, 5: 1}, "mcq": {...}, "true_false": {...}}
    Row sums (per type) match the type distribution; column sums (per difficulty,
    summed across types) match the difficulty distribution — both computed
    independently then crossed per type.
    """
    descriptive_pct = get_setting("descriptive_pct", 0.25)
    mcq_pct = get_setting("mcq_pct", 0.50)
    boolean_pct = 1.0 - descriptive_pct - mcq_pct

    type_counts = _largest_remainder_round(
        {"descriptive": descriptive_pct, "mcq": mcq_pct, "true_false": boolean_pct},
        qa_count,
    )

    # 50% of questions at the highest difficulty level, the rest spread evenly
    # across the remaining levels — applies to every grade.
    difficulty_pcts = get_setting("difficulty_default", [0.125, 0.125, 0.125, 0.125, 0.5])

    grid: dict[str, dict[int, int]] = {}
    for q_type, count in type_counts.items():
        weights = {str(level + 1): pct for level, pct in enumerate(difficulty_pcts)}
        rounded = _largest_remainder_round(weights, count)
        grid[q_type] = {int(level): n for level, n in rounded.items()}

    return grid
