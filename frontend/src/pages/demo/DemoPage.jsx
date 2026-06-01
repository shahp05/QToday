import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './DemoPage.css'

// Subject images
import imgEnglish          from '../../assets/english.webp'
import imgMaths5           from '../../assets/maths-5.webp'
import imgMaths12          from '../../assets/maths-12.webp'
import imgBiology          from '../../assets/biology.webp'
import imgChemistry        from '../../assets/chemistry.webp'
import imgPhysics          from '../../assets/physics.webp'
import imgHistory          from '../../assets/history.webp'
import imgGeography        from '../../assets/geography.webp'
import imgCivics           from '../../assets/civics.webp'
import imgSocialStudies    from '../../assets/social-studies.webp'
import imgEVS              from '../../assets/EVS.webp'
import imgEconomics        from '../../assets/economics.webp'
import imgCommerce         from '../../assets/commerce.webp'
import imgPoliticalScience from '../../assets/political-science.webp'
import imgPsychology       from '../../assets/psychology.webp'
import imgSociology        from '../../assets/sociology.webp'

const SUBJECTS = [
  { id: 'english',           label: 'English',           img: imgEnglish          },
  { id: 'maths-5',           label: 'Maths (I–V)',       img: imgMaths5           },
  { id: 'maths-12',          label: 'Maths (VI+)',       img: imgMaths12          },
  { id: 'evs',               label: 'EVS',               img: imgEVS              },
  { id: 'biology',           label: 'Biology',           img: imgBiology          },
  { id: 'chemistry',         label: 'Chemistry',         img: imgChemistry        },
  { id: 'physics',           label: 'Physics',           img: imgPhysics          },
  { id: 'history',           label: 'History',           img: imgHistory          },
  { id: 'geography',         label: 'Geography',         img: imgGeography        },
  { id: 'civics',            label: 'Civics',            img: imgCivics           },
  { id: 'social-studies',    label: 'Social Studies',    img: imgSocialStudies    },
  { id: 'economics',         label: 'Economics',         img: imgEconomics        },
  { id: 'commerce',          label: 'Commerce',          img: imgCommerce         },
  { id: 'political-science', label: 'Political Science', img: imgPoliticalScience },
  { id: 'psychology',        label: 'Psychology',        img: imgPsychology       },
  { id: 'sociology',         label: 'Sociology',         img: imgSociology        },
]

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1)

const DIFFICULTY = ['easy', 'medium', 'hard']

// Mock questions — replaced by real API response
const MOCK_QUESTIONS = [
  { id: 1, text: 'What is the process by which plants make their own food using sunlight?', difficulty: 'easy'   },
  { id: 2, text: 'Explain the difference between mitosis and meiosis with examples.',       difficulty: 'medium' },
  { id: 3, text: 'How does the human immune system respond to a viral infection?',          difficulty: 'medium' },
  { id: 4, text: 'Describe the structure of DNA and its role in protein synthesis.',        difficulty: 'hard'   },
  { id: 5, text: 'What are the main differences between prokaryotic and eukaryotic cells?', difficulty: 'easy'   },
]

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
    </svg>
  )
}

function IconFetch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
    </svg>
  )
}

export default function DemoPage() {
  const navigate                    = useNavigate()
  const [selectedSubject, setSubject] = useState(null)
  const [question, setQuestion]     = useState('')
  const [grade, setGrade]           = useState('')
  const [questions, setQuestions]   = useState([])
  const [loading, setLoading]       = useState(false)

  function handleFetch() {
    if (!selectedSubject || !grade) return
    setLoading(true)
    // TODO: replace with real API call
    setTimeout(() => {
      setQuestions(MOCK_QUESTIONS)
      setLoading(false)
    }, 800)
  }

  const subject = SUBJECTS.find(s => s.id === selectedSubject)

  return (
    <div className="demo-page">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="demo-header">
        <button className="demo-back" onClick={() => navigate('/dashboard')} aria-label="Back">
          <IconBack />
          Back
        </button>
        <span className="demo-header-title">Demo</span>
        <span className="demo-header-badge">MOCK</span>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="demo-main">

        {/* ── Left: subject grid ──────────────────────────────────────────── */}
        <aside className="demo-subjects">
          <p className="demo-section-label">Select Subject</p>
          <div className="demo-subjects-grid">
            {SUBJECTS.map(({ id, label, img }) => (
              <button
                key={id}
                className={`demo-subject-card ${selectedSubject === id ? 'demo-subject-card--active' : ''}`}
                onClick={() => setSubject(id)}
                title={label}
              >
                <img src={img} alt={label} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Right: query + results ───────────────────────────────────────── */}
        <section className="demo-right">

          <p className="demo-section-label">Enter a topic name and grade</p>

          {/* Query card */}
          <div className="demo-query-card">
            <div className="demo-query-row">
              <div className="demo-field demo-field--grow">
                <label className="demo-label">Topic name</label>
                <input
                  className="demo-input"
                  type="text"
                  placeholder={subject ? `e.g. ${subject.label} — photosynthesis, fractions…` : 'Select a subject first'}
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  disabled={!selectedSubject}
                />
              </div>
              <div className="demo-field">
                <label className="demo-label">Grade</label>
                <select className="demo-select" value={grade} onChange={e => setGrade(e.target.value)}>
                  <option value="">—</option>
                  {GRADES.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <button
                className="demo-fetch-btn"
                onClick={handleFetch}
                disabled={!selectedSubject || !grade || loading}
              >
                <IconFetch />
                {loading ? 'Fetching…' : 'Fetch Questions'}
              </button>
            </div>
          </div>

          {/* Results */}
          {questions.length > 0 && (
            <div className="demo-results">
              <p className="demo-section-label">
                {questions.length} questions — {subject?.label}, Grade {grade}
              </p>
              <div className="demo-questions-list">
                {questions.map((q, i) => (
                  <div key={q.id} className={`demo-question-card demo-question-card--${q.difficulty}`}>
                    <span className="demo-q-number">{i + 1}</span>
                    <p className="demo-q-text">{q.text}</p>
                    <span className={`demo-q-badge demo-q-badge--${q.difficulty}`}>{q.difficulty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </section>
      </div>
    </div>
  )
}
