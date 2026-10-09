import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installAllProjectsFetch } from './lib/allProjects'

// #145: one wrapper puts the admin's all-projects header on every API request.
installAllProjectsFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
