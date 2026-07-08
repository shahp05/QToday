"""Assigns a constant icon_key to a Subject at creation time, matched by
keyword against the subject name. Mirrors the frontend's client-side
fallback in frontend/src/pages/subjects/subjectIcons.jsx — once a subject
has an icon_key, the frontend renders by key instead of re-matching by name.
"""

# Ordered keyword -> icon key. First matching keyword wins, so more specific
# subjects (e.g. "computer") are listed before broader ones (e.g. "science").
_KEYWORD_ICONS = [
    (("math", "algebra", "geometry", "arithmetic", "trigonometry", "calculus",
      "mensuration", "statistics", "probability", "matrices", "vectors",
      "coordinate geometry", "differentiation", "integration", "number theory"), "calculator"),
    (("computer", "coding", "programming", "informatics", "ict"), "monitor"),
    (("physics", "mechanics", "fluid dynamics", "thermodynamics", "heat and temperature",
      "electromagnetism", "electrostatics", "current electricity", "optics",
      "kinematics", "gravitation", "modern physics", "semiconductor", "waves and sound"), "atom"),
    (("biology", "life science", "animal life", "plant life", "human body",
      "botany", "zoology", "genetics", "ecology", "physiology", "anatomy", "cell biology"), "dna"),
    (("chemistry", "science", "organic chemistry", "inorganic chemistry",
      "physical chemistry", "environmental chemistry", "periodic table",
      "chemical bonding", "electrochemistry"), "flask"),
    (("history",), "landmark"),
    (("psychology",), "brain"),
    (("sociology",), "users"),
    (("economics", "accountancy", "macroeconomics", "microeconomics", "accounting",
      "national income", "banking", "demand and supply", "gdp"), "coins"),
    (("commerce", "business", "trade"), "briefcase"),
    (("geography", "social", "civics", "political"), "globe"),
    (("environmental", "evs"), "leaf"),
    (("art", "craft", "drawing"), "palette"),
    (("music",), "music"),
    (("physical education", "sports", " pe ", "yoga"), "dumbbell"),
    (("english", "hindi", "sanskrit", "language", "literature", "grammar"), "language"),
]

DEFAULT_ICON_KEY = "book"


def resolve_icon_key(subject_name: str) -> str:
    name = f" {(subject_name or '').lower()} "
    for keywords, icon_key in _KEYWORD_ICONS:
        if any(k in name for k in keywords):
            return icon_key
    return DEFAULT_ICON_KEY
