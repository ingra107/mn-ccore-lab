import type { Project } from './types'

export const projects: Project[] = [
  // Nick's CLIF projects
  { title: 'P1: Gender Disparities & Low Tidal Volume', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'P4: ICU Quality Metrics', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'IV Fluids Shortage', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'PF-v-SF Oxygenation Severity', status: 'In Review', category: 'clif', pi: 'nick' },
  { title: 'VentMode Waterfall Brief — JAMIA', status: 'In Review', category: 'clif', pi: 'nick' },
  { title: 'Volume vs Pressure Control Mortality', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'Hypothermia Rewarming Rates', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'WBC & Temperature Thresholds for Sepsis', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'Clinical Implications of Sepsis Definitions', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'FLAME', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'Proning Incidence in Severe ARF', status: 'Active', category: 'clif', pi: 'nick' },

  // Nick's lab projects
  { title: 'LPV Adherence Paper', status: 'In Review', category: 'lab', pi: 'nick' },
  { title: 'Decision-Making Survey / GDMS', status: 'Active', category: 'lab', pi: 'nick' },
  { title: 'Provider EBP Research Program', status: 'Active', category: 'lab', pi: 'nick' },
  { title: 'Critical Care Quality Manuscript', status: 'Active', category: 'lab', pi: 'nick' },
  { title: 'SGLT2 & Metformin in COPD Readmissions', status: 'Active', category: 'lab', pi: 'nick' },

  // Nate's projects
  { title: 'DNR Provider Variation', status: 'Active', category: 'nate', pi: 'nate' },
  {
    title: 'CCI in ARDS',
    status: 'Active',
    category: 'nate',
    pi: 'nate',
    description: 'Characterizing chronic critical illness trajectories in patients with acute respiratory distress syndrome. Shared project with Nick Ingraham.',
  },
]
