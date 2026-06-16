"""Shared text formatting helpers — usable by any service that names
subjects/topics or displays user-facing strings."""
from config.app_config import get_setting

_DEFAULT_STOPWORDS = ["a", "an", "the", "of", "in", "on", "and", "or", "for", "to", "with", "at", "by", "is", "are"]


def title_case(text: str) -> str:
    """Title-case with small words (articles/prepositions/conjunctions) kept
    lowercase, unless they're the first or last word.

    e.g. "newton's first law of motion" -> "Newton's First Law of Motion"
    """
    stopwords = {w.lower() for w in get_setting("title_case_stopwords", _DEFAULT_STOPWORDS)}
    words = text.strip().split()
    if not words:
        return text

    result = []
    last_index = len(words) - 1
    for i, word in enumerate(words):
        if 0 < i < last_index and word.lower() in stopwords:
            result.append(word.lower())
        else:
            result.append(word.capitalize())
    return " ".join(result)
