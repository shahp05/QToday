import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { UIProvider } from './context/UIContext'
import Home       from './pages/Home'
import Dashboard  from './pages/Dashboard'
import DemoPage   from './pages/demo/DemoPage'
import SignupPage from './pages/signup/SignupPage'

export default function App() {
  return (
    <UIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/signup"    element={<SignupPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/demo"      element={<DemoPage />} />
        </Routes>
      </BrowserRouter>
    </UIProvider>
  )
}
