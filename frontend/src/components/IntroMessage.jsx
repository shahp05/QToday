import './IntroMessage.css'

function ProgressChart() {
  return (
    <svg className="intromsg-chart" viewBox="0 0 240 158" fill="none" aria-hidden="true">
      <defs>
        {/* Gradient for the trend line: red → yellow → green */}
        <linearGradient id="trendGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#D32F2F"/>
          <stop offset="42%"  stopColor="#F9A825"/>
          <stop offset="100%" stopColor="#0F8911"/>
        </linearGradient>
        {/* Soft fill gradient under the curve */}
        <linearGradient id="areaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#D32F2F" stopOpacity="0.12"/>
          <stop offset="42%"  stopColor="#F9A825" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="#0F8911" stopOpacity="0.12"/>
        </linearGradient>
      </defs>

      {/* ── Zone bands ─────────────────────────────────────────────────────── */}
      <rect x="8" y="82" width="196" height="36" rx="2" fill="#D32F2F" opacity="0.10"/>
      <rect x="8" y="44" width="196" height="38" rx="2" fill="#F9A825" opacity="0.10"/>
      <rect x="8" y="8"  width="196" height="36" rx="2" fill="#0F8911" opacity="0.10"/>

      {/* Subtle horizontal grid lines */}
      <line x1="8" y1="82"  x2="204" y2="82"  stroke="#343434" strokeWidth="0.4" opacity="0.12"/>
      <line x1="8" y1="44"  x2="204" y2="44"  stroke="#343434" strokeWidth="0.4" opacity="0.12"/>
      <line x1="8" y1="118" x2="204" y2="118" stroke="#343434" strokeWidth="0.4" opacity="0.10"/>

      {/* Zone colour pills on right */}
      <rect x="210" y="82"  width="5" height="36" rx="2.5" fill="#D32F2F" opacity="0.65"/>
      <rect x="210" y="44"  width="5" height="38" rx="2.5" fill="#F9A825" opacity="0.75"/>
      <rect x="210" y="8"   width="5" height="36" rx="2.5" fill="#0F8911" opacity="0.80"/>

      {/* ── Filled area under curve ────────────────────────────────────────── */}
      <path
        d="M15 107 C32 102 46 94 62 84 C76 75 90 67 108 57 C124 48 140 37 158 27 C172 19 186 14 201 11 L201 118 L15 118 Z"
        fill="url(#areaGrad)"
      />

      {/* ── Trend line (gradient red → yellow → green) ────────────────────── */}
      <path
        d="M15 107 C32 102 46 94 62 84 C76 75 90 67 108 57 C124 48 140 37 158 27 C172 19 186 14 201 11"
        stroke="url(#trendGrad)"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Data points — coloured by zone ────────────────────────────────── */}
      {/* Red zone */}
      <circle cx="15"  cy="107" r="3.5" fill="#D32F2F" stroke="white" strokeWidth="1"/>
      <circle cx="37"  cy="100" r="3.5" fill="#D32F2F" stroke="white" strokeWidth="1"/>
      <circle cx="58"  cy="88"  r="3.5" fill="#D32F2F" stroke="white" strokeWidth="1"/>
      {/* Yellow zone */}
      <circle cx="80"  cy="75"  r="3.5" fill="#F9A825" stroke="white" strokeWidth="1"/>
      <circle cx="104" cy="62"  r="3.5" fill="#F9A825" stroke="white" strokeWidth="1"/>
      <circle cx="128" cy="49"  r="3.5" fill="#F9A825" stroke="white" strokeWidth="1"/>
      {/* Green zone */}
      <circle cx="152" cy="33"  r="3.5" fill="#0F8911" stroke="white" strokeWidth="1"/>
      <circle cx="176" cy="20"  r="3.5" fill="#0F8911" stroke="white" strokeWidth="1"/>
      <circle cx="201" cy="11"  r="4.5" fill="#0F8911" stroke="white" strokeWidth="1.5"/>

      {/* ── Separator ─────────────────────────────────────────────────────── */}
      <line x1="8" y1="130" x2="218" y2="130" stroke="#343434" strokeWidth="0.5" opacity="0.18"/>

      {/* ── Icon strip: Concepts → Confidence → Competitiveness ───────────── */}

      {/* Lightbulb — Concepts (red) */}
      <g transform="translate(16, 133) scale(0.6)" fill="#D32F2F" opacity="0.9">
        <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
      </g>

      {/* Arrow 1 */}
      <line x1="36" y1="141" x2="54" y2="141" stroke="#343434" strokeWidth="1.2" strokeLinecap="round" opacity="0.22"/>
      <path d="M51 138 L55 141 L51 144" stroke="#343434" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.22"/>

      {/* Star — Confidence (yellow) */}
      <g transform="translate(58, 133) scale(0.6)" fill="#F9A825" opacity="0.95">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </g>

      {/* Arrow 2 */}
      <line x1="78" y1="141" x2="96" y2="141" stroke="#343434" strokeWidth="1.2" strokeLinecap="round" opacity="0.22"/>
      <path d="M93 138 L97 141 L93 144" stroke="#343434" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.22"/>

      {/* Trophy — Competitiveness (green) */}
      <g transform="translate(100, 133) scale(0.6)" fill="#0F8911" opacity="0.9">
        <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
      </g>
    </svg>
  )
}

export default function IntroMessage() {
  return (
    <div className="intromsg">
      <div className="intromsg-inner">
        <ProgressChart />
        <div className="intromsg-text">
          <h2 className="intromsg-heading">
            Practice. Score. Build confidence — and stay competitive.
          </h2>
          <p className="intromsg-body">
            Continuously evolving assessments across every subject and grade.
            For students who want to grow, teachers who want to track,
            and parents who want to stay informed.
          </p>
        </div>
      </div>
    </div>
  )
}
