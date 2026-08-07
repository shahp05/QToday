import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home       from './pages/Home'
import Dashboard  from './pages/Dashboard'
import DashboardQuote from './pages/DashboardQuote'
import AccountPage from './pages/AccountPage'
import SignupPage from './pages/signup/SignupPage'
import LoginPage  from './pages/login/LoginPage'
import StudentsPage from './pages/students/StudentsPage'
import StudentDetailRoute from './pages/students/StudentDetailRoute'
import TeachersPage from './pages/teachers/TeachersPage'
import SubjectsRoute from './pages/subjects/SubjectsRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Home />} />
        <Route path="/login"     element={<LoginPage />} />
        <Route path="/signup"    element={<SignupPage />} />
        <Route path="/dashboard" element={<Dashboard />}>
          <Route index                    element={<DashboardQuote />} />
          <Route path="students"          element={<StudentsPage />} />
          <Route path="students/:studentId" element={<StudentDetailRoute />} />
          <Route path="teachers"          element={<TeachersPage />} />
          <Route path="subjects"          element={<SubjectsRoute />} />
          <Route path="account"           element={<AccountPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
