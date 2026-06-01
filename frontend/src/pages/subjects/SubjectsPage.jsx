import { useState } from 'react'
import './SubjectsPage.css'

// Subject image imports
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
  { id: 'english',           label: 'English',            img: imgEnglish          },
  { id: 'maths-5',           label: 'Mathematics (I–V)',  img: imgMaths5           },
  { id: 'maths-12',          label: 'Mathematics (VI+)',  img: imgMaths12          },
  { id: 'evs',               label: 'EVS',                img: imgEVS              },
  { id: 'biology',           label: 'Biology',            img: imgBiology          },
  { id: 'chemistry',         label: 'Chemistry',          img: imgChemistry        },
  { id: 'physics',           label: 'Physics',            img: imgPhysics          },
  { id: 'history',           label: 'History',            img: imgHistory          },
  { id: 'geography',         label: 'Geography',          img: imgGeography        },
  { id: 'civics',            label: 'Civics',             img: imgCivics           },
  { id: 'social-studies',    label: 'Social Studies',     img: imgSocialStudies    },
  { id: 'economics',         label: 'Economics',          img: imgEconomics        },
  { id: 'commerce',          label: 'Commerce',           img: imgCommerce         },
  { id: 'political-science', label: 'Political Science',  img: imgPoliticalScience },
  { id: 'psychology',        label: 'Psychology',         img: imgPsychology       },
  { id: 'sociology',         label: 'Sociology',          img: imgSociology        },
]

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
    </svg>
  )
}

export default function SubjectsPage() {
  const [selected, setSelected] = useState(null)

  const selectedSubject = SUBJECTS.find(s => s.id === selected)

  return (
    <div className="subjects-page">

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="subjects-grid">
        {SUBJECTS.map(({ id, label, img }) => (
          <button
            key={id}
            className={`subject-card ${selected === id ? 'subject-card--selected' : ''}`}
            onClick={() => setSelected(prev => prev === id ? null : id)}
            aria-pressed={selected === id}
            aria-label={label}
          >
            <div className="subject-card-img">
              <img src={img} alt={label} draggable={false} />
            </div>
            <span className="subject-card-label">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Action bar — appears when a subject is selected ───────────────── */}
      {selected && (
        <div className="subjects-action-bar">
          <span className="subjects-action-name">{selectedSubject?.label}</span>
          <button
            className="subjects-action-btn"
            onClick={() => alert(`Continue with ${selectedSubject?.label} — wired shortly`)}
          >
            Continue <IconArrow />
          </button>
        </div>
      )}

    </div>
  )
}
