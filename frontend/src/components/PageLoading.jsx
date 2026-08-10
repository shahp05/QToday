import './PageLoading.css'

// Full-panel loading state for a page whose data hasn't arrived yet —
// .dashboard-panel3 has no background of its own (it shows the dashboard's
// dark background through), so this is just a centered spinner, not a
// white content-card — a white card here reads as a flash of the wrong
// page, not "still loading".
export default function PageLoading() {
  return (
    <div className="page-loading">
      <span className="page-loading-spinner" role="status" aria-label="Loading" />
    </div>
  )
}
