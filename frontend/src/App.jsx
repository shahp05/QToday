import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { UIProvider } from './context/UIContext'
import Home       from './pages/Home'
import Dashboard  from './pages/Dashboard'
import SignupPage from './pages/signup/SignupPage'
import LoginPage  from './pages/login/LoginPage'

export default function App() {
  return (
    <UIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/login"     element={<LoginPage />} />
          <Route path="/signup"    element={<SignupPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </UIProvider>
  )
}
