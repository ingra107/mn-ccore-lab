import type { Grant } from './types'

export const grants: Grant[] = [
  // Nick — Active
  { mechanism: 'K23', title: 'Provider Practice Variation in Mechanical Ventilation', agency: 'NHLBI', pi: 'nick-ingraham', bucket: 'active' },
  { mechanism: 'R03', title: 'Decision-Making Styles of Medical Trainees', agency: 'NHLBI', pi: 'nick-ingraham', bucket: 'active' },

  // Nick — Pending
  { mechanism: 'R01', title: 'ADHERE-LPV: Precision Practice Assistance for Lung-Protective Ventilation', agency: 'NHLBI', pi: 'nick-ingraham', bucket: 'proposed' },
  { mechanism: 'R01', title: 'Provider Variation Across CLIF', agency: 'NHLBI', pi: 'nick-ingraham', bucket: 'proposed' },

  // Nate — Pending
  { mechanism: 'K23', title: 'IHCA Survivability Calculator', agency: 'NHLBI', pi: 'nate-mesfin', bucket: 'proposed' },
]
