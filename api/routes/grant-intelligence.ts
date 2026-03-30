import type { Env } from '../types';
import { json, error } from '../helpers';

interface ReporterProject {
  project_num: string
  project_title: string
  pi_names: { first_name: string; last_name: string }[]
  organization: { org_name: string }
  fiscal_year: number
  award_amount: number
  project_start_date: string
  project_end_date: string
  abstract_text: string
}

// GET /api/grants/similar?keywords=...&ic=...&limit=...
export async function handleSimilarGrants(url: URL, _env: Env): Promise<Response> {
  const keywords = url.searchParams.get('keywords')
  const ic = url.searchParams.get('ic') // NIH institute code, e.g., HL for NHLBI
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)

  if (!keywords) return error('keywords parameter required', 400)

  try {
    const body: Record<string, unknown> = {
      criteria: {
        advanced_text_search: {
          operator: 'and',
          search_field: 'terms',
          search_text: keywords,
        },
        fiscal_years: [2024, 2025, 2026],
        exclude_subprojects: true,
      },
      offset: 0,
      limit,
      sort_field: 'project_start_date',
      sort_order: 'desc',
    }

    if (ic) {
      (body.criteria as Record<string, unknown>).agencies = ['NIH']
      ;(body.criteria as Record<string, unknown>).activity_codes = ['R01', 'R21', 'R03', 'K23', 'K08']
    }

    const res = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      return error(`NIH RePORTER error: ${res.status}`, 502)
    }

    const data = await res.json() as { results: ReporterProject[]; meta: { total: number } }

    const simplified = (data.results || []).map(p => ({
      project_num: p.project_num,
      title: p.project_title,
      pi: p.pi_names?.map(n => `${n.first_name} ${n.last_name}`).join(', ') || 'Unknown',
      organization: p.organization?.org_name || 'Unknown',
      fiscal_year: p.fiscal_year,
      award_amount: p.award_amount,
      start_date: p.project_start_date,
      end_date: p.project_end_date,
      abstract: p.abstract_text?.substring(0, 300) || '',
    }))

    return json({ data: simplified, total: data.meta?.total || 0 })
  } catch (e) {
    return error(`Failed to query NIH RePORTER: ${e}`, 500)
  }
}
