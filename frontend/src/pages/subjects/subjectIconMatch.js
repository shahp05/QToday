import {
  IconBook, IconCalculator, IconFlask, IconAtom, IconDna, IconGlobe, IconLandmark,
  IconMonitor, IconPalette, IconMusic, IconDumbbell, IconLeaf, IconCoins,
  IconBriefcase, IconUsers, IconBrain, IconLanguage,
} from './subjectIcons'

// Keys match the backend's icon_key values (services/subject_icon_service.py) —
// once a subject has a persisted icon_key, look it up here directly instead
// of re-matching by name.
const ICON_REGISTRY = {
  calculator: IconCalculator,
  monitor: IconMonitor,
  atom: IconAtom,
  dna: IconDna,
  flask: IconFlask,
  landmark: IconLandmark,
  coins: IconCoins,
  globe: IconGlobe,
  leaf: IconLeaf,
  palette: IconPalette,
  music: IconMusic,
  dumbbell: IconDumbbell,
  briefcase: IconBriefcase,
  users: IconUsers,
  brain: IconBrain,
  language: IconLanguage,
  book: IconBook,
}

// Ordered keyword -> icon key. First matching keyword wins, so put more
// specific subjects (e.g. "computer") before broader ones. Mirrors
// backend/services/subject_icon_service.py — used as a fallback for
// subjects that don't have a persisted icon_key yet.
const KEYWORD_ICONS = [
  [['math', 'algebra', 'geometry', 'arithmetic', 'trigonometry', 'calculus',
    'mensuration', 'statistics', 'probability', 'matrices', 'vectors',
    'coordinate geometry', 'differentiation', 'integration', 'number theory'], 'calculator'],
  [['computer', 'coding', 'programming', 'informatics', 'ict'], 'monitor'],
  [['physics', 'mechanics', 'fluid dynamics', 'thermodynamics', 'heat and temperature',
    'electromagnetism', 'electrostatics', 'current electricity', 'optics',
    'kinematics', 'gravitation', 'modern physics', 'semiconductor', 'waves and sound'], 'atom'],
  [['biology', 'life science', 'animal life', 'plant life', 'human body',
    'botany', 'zoology', 'genetics', 'ecology', 'physiology', 'anatomy', 'cell biology'], 'dna'],
  [['chemistry', 'science', 'organic chemistry', 'inorganic chemistry',
    'physical chemistry', 'environmental chemistry', 'periodic table',
    'chemical bonding', 'electrochemistry'], 'flask'],
  [['history'], 'landmark'],
  [['psychology'], 'brain'],
  [['sociology'], 'users'],
  [['economics', 'accountancy', 'macroeconomics', 'microeconomics', 'accounting',
    'national income', 'banking', 'demand and supply', 'gdp'], 'coins'],
  [['commerce', 'business', 'trade'], 'briefcase'],
  [['geography', 'social', 'civics', 'political'], 'globe'],
  [['environmental', 'evs'], 'leaf'],
  [['art', 'craft', 'drawing'], 'palette'],
  [['music'], 'music'],
  [['physical education', 'sports', ' pe ', 'yoga'], 'dumbbell'],
  [['english', 'hindi', 'sanskrit', 'language', 'literature', 'grammar'], 'language'],
]

function matchIconKeyByName(subjectName) {
  const name = ` ${(subjectName || '').toLowerCase()} `
  for (const [keywords, iconKey] of KEYWORD_ICONS) {
    if (keywords.some(k => name.includes(k))) return iconKey
  }
  return 'book'
}

// Prefer the persisted icon_key; fall back to name-matching for subjects
// created before icon_key existed (or anything unrecognized).
export function getSubjectIcon(subjectName, iconKey) {
  const key = (iconKey && ICON_REGISTRY[iconKey]) ? iconKey : matchIconKeyByName(subjectName)
  return ICON_REGISTRY[key]
}
