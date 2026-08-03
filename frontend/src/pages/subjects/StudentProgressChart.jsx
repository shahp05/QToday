import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { scoreColor } from '../../lib/scoreColor'

const GRADIENT_ID = 'student-progress-chart-score-band'

// Same thresholds as scoreColor.js, spelled out for the legend.
const LEGEND_BANDS = [
  { label: '75% or more', color: 'var(--color-green-light)' },
  { label: '40-75%', color: 'var(--color-yellow)' },
  { label: 'Below 40%', color: 'var(--color-red)' },
]

function ChartLegend() {
  return (
    <div className="student-progress-chart-legend">
      {LEGEND_BANDS.map(band => (
        <span key={band.label} className="student-progress-chart-legend-item">
          <span className="student-progress-chart-legend-swatch" style={{ background: band.color }} />
          {band.label}
        </span>
      ))}
    </div>
  )
}

function formatDdMmm(ts) {
  const d = new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return `${day}-${month}`
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { ts, score, anchor } = payload[0].payload
  if (anchor) return null
  return (
    <div className="student-progress-chart-tooltip">
      <p className="student-progress-chart-tooltip-date">{formatDdMmm(ts)}</p>
      <p className="student-progress-chart-tooltip-score">{score}%</p>
    </div>
  )
}

// Only the real attempts get a dot — the synthetic anchor point (see below)
// is purely there to give a lone attempt a line/band to sit on, not a data
// point in its own right.
function ScoreDot({ cx, cy, payload, r = 4 }) {
  if (payload.anchor) return null
  return <circle cx={cx} cy={cy} r={r} stroke="var(--color-white)" strokeWidth={2} fill="var(--color-dark)" />
}

// Colors the fill *by time segment*, not by height: the stretch of the
// chart between two consecutive dates is a single solid color — whatever
// band the score arrived at on the later date falls into — rather than a
// vertical red/amber/green stack under every point above 40%/75%. A
// horizontal (x-only) gradient does this: each stop pair sits at the two
// points bounding a segment, both stopped at that segment's color, so the
// Area's fill (which spans the full 0-100 height at every x) reads as one
// flat color per segment instead of banding vertically.
function buildSegmentGradientStops(points) {
  if (points.length < 2) return null
  const start = points[0].ts
  const end = points[points.length - 1].ts
  if (end === start) return null
  const normalize = ts => (ts - start) / (end - start)

  const stops = []
  for (let i = 1; i < points.length; i++) {
    const color = scoreColor(points[i].score)
    const x1 = normalize(points[i - 1].ts)
    const x2 = normalize(points[i].ts)
    stops.push(<stop key={`${i}-start`} offset={x1} stopColor={color} />)
    stops.push(<stop key={`${i}-end`} offset={x2} stopColor={color} />)
  }
  return stops
}

// topic: the selected topic from useSubjectsTaughtStore (topic_id, grades[]
// each carrying its own teach_logs-derived `logs` array), used only to
// anchor the x-axis at the date this topic was first taught — not just the
// date of the first quiz attempt, which can lag behind by days.
// quizzes: already filtered to this topic, any order/grade mix.
export default function StudentProgressChart({ topic, quizzes }) {
  const taughtDates = (topic?.grades ?? [])
    .flatMap(g => g.logs ?? [])
    .map(l => new Date(l.date).getTime())
  const scoredQuizzes = quizzes
    .filter(q => q.is_scored)
    .map(q => ({
      ts: new Date(q.date_created).getTime(),
      score: Math.round((q.total_score / q.total_marks) * 100),
    }))
    .sort((a, b) => a.ts - b.ts)

  if (scoredQuizzes.length === 0) {
    return <p className="student-quiz-progress-empty">No scored quizzes yet — play one to start tracking progress.</p>
  }

  const domainStart = taughtDates.length > 0
    ? Math.min(...taughtDates, scoredQuizzes[0].ts)
    : scoredQuizzes[0].ts

  // Anchor the line at 0 on the taught date — the student knew nothing
  // about the topic yet — so it rises from 0 up to each attempt's score,
  // rather than starting flat at the first score.
  const chartData = domainStart < scoredQuizzes[0].ts
    ? [{ ts: domainStart, score: 0, anchor: true }, ...scoredQuizzes]
    : scoredQuizzes

  const gradientStops = buildSegmentGradientStops(chartData)

  return (
    <div className="student-progress-chart-wrap">
      <ChartLegend />
      <div className="student-progress-chart">
        <div className="student-progress-chart-plot">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              {gradientStops && (
                <defs>
                  <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
                    {gradientStops}
                  </linearGradient>
                </defs>
              )}
              <CartesianGrid stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                domain={[domainStart, 'dataMax']}
                ticks={scoredQuizzes.map(q => q.ts)}
                tickFormatter={formatDdMmm}
                stroke="rgba(255,255,255,0.5)"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                tickFormatter={v => `${v}%`}
                width={38}
                stroke="rgba(255,255,255,0.5)"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="linear"
                dataKey="score"
                stroke="var(--color-white)"
                strokeWidth={2}
                fill={gradientStops ? `url(#${GRADIENT_ID})` : scoreColor(chartData[0].score)}
                fillOpacity={1}
                dot={<ScoreDot />}
                activeDot={<ScoreDot r={5} />}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
