import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Team from './pages/Team'
import NickLab from './pages/NickLab'
import NateLab from './pages/NateLab'
import Publications from './pages/Publications'
import Contact from './pages/Contact'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/team" element={<Team />} />
          <Route path="/nick" element={<NickLab />} />
          <Route path="/nate" element={<NateLab />} />
          <Route path="/publications" element={<Publications />} />
          <Route path="/contact" element={<Contact />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
