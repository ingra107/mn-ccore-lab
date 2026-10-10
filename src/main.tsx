import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installAllProjectsFetch } from './lib/allProjects'
import { rootErrorOptions } from './lib/clientErrors'

// #145: one wrapper puts the admin's all-projects header on every API request.
installAllProjectsFetch()

// Error ledger (schema-v123): React's caught/uncaught/recoverable errors feed
// clientErrors.capture(), which sends only while a member's sender is
// attached (RequireAuth). Each option still logs to the console.
createRoot(document.getElementById('root')!, rootErrorOptions).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
