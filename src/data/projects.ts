import type { Project } from './types'

export const projects: Project[] = [
  // Nick's CLIF projects
  {
    title: 'P1: Gender Disparities & Low Tidal Volume',
    status: 'Active',
    category: 'clif',
    pi: 'nick',
    description: 'Examining whether gender influences the delivery of lung-protective ventilation across CLIF consortium sites.',
  },
  {
    title: 'P4: ICU Quality Metrics',
    status: 'Active',
    category: 'clif',
    pi: 'nick',
    description: 'Developing and validating standardized quality metrics for ICU care using multi-center CLIF data.',
  },
  {
    title: 'IV Fluids Shortage',
    status: 'Active',
    category: 'clif',
    pi: 'nick',
    description: 'Evaluating the impact of the 2024 IV fluid shortage on ICU fluid resuscitation practices and patient outcomes.',
  },
  { title: 'PF-v-SF Oxygenation Severity', status: 'In Review', category: 'clif', pi: 'nick', description: 'Comparing PaO2/FiO2 and SpO2/FiO2 ratios for classifying oxygenation severity in mechanically ventilated patients.' },
  { title: 'VentMode Waterfall Brief — JAMIA', status: 'In Review', category: 'clif', pi: 'nick', description: 'Characterizing ventilation mode transitions and their association with outcomes in mechanically ventilated ICU patients.' },
  { title: 'Volume vs Pressure Control Mortality', status: 'Active', category: 'clif', pi: 'nick', description: 'Multi-center comparison of volume-controlled vs pressure-controlled ventilation on ICU mortality.' },
  { title: 'Hypothermia Rewarming Rates', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'WBC & Temperature Thresholds for Sepsis', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'Clinical Implications of Sepsis Definitions', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'FLAME', status: 'Active', category: 'clif', pi: 'nick' },
  { title: 'Proning Incidence in Severe ARF', status: 'Active', category: 'clif', pi: 'nick', description: 'Quantifying prone positioning utilization rates across CLIF sites in patients with severe acute respiratory failure.' },

  // Nick's lab projects
  {
    title: 'LPV Adherence Paper',
    status: 'In Review',
    category: 'lab',
    pi: 'nick',
    description: 'Quantifying provider-level variation in lung-protective ventilation adherence using multi-center CLIF data.',
  },
  {
    title: 'Decision-Making Survey / GDMS',
    status: 'Active',
    category: 'lab',
    pi: 'nick',
    description: 'Surveying ICU providers on general decision-making styles and correlating with ventilator management choices.',
  },
  { title: 'Provider EBP Research Program', status: 'Active', category: 'lab', pi: 'nick', description: 'Building a research program studying how provider characteristics influence evidence-based practice adoption in the ICU.' },
  { title: 'Critical Care Quality Manuscript', status: 'Active', category: 'lab', pi: 'nick' },
  { title: 'SGLT2 & Metformin in COPD Readmissions', status: 'Active', category: 'lab', pi: 'nick', description: 'Investigating whether SGLT2 inhibitors and metformin reduce 30-day readmission risk in COPD patients.' },

  // Nate's projects
  {
    title: 'DNR Provider Variation',
    status: 'Active',
    category: 'nate',
    pi: 'nate',
    description: 'Analyzing how individual providers vary in DNR order timing, documentation, and goals-of-care communication patterns.',
  },
  {
    title: 'CCI in ARDS',
    status: 'Active',
    category: 'nate',
    pi: 'nate',
    description: 'Characterizing chronic critical illness trajectories in patients with acute respiratory distress syndrome. Shared project with Nick Ingraham.',
  },
]
