/**
 * TanStack Query hooks for D1 API data.
 *
 * Each hook tries the live API first. If the API is unavailable
 * (local dev without wrangler, network error), it falls back
 * to the static TypeScript data files. This means:
 *   - Production: always live D1 data
 *   - Local dev: static data unless wrangler dev is proxied
 *
 * The `select` option transforms D1 row types (snake_case, JSON strings)
 * into frontend types (camelCase, parsed arrays) so components don't change.
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchPublications,
  fetchTeam,
  fetchProjects,
  fetchGrants,
  fetchCollaborationGraph,
  fetchStats,
} from '../lib/api'
import type {
  PublicationRow,
  TeamMemberRow,
  ProjectRow,
  GrantRow,
  CollaborationGraph,
  Stats,
} from '../lib/api'

// Re-export row types for components that need them
export type { PublicationRow, TeamMemberRow, ProjectRow, GrantRow, CollaborationGraph, Stats }

// Static data imports (fallback for local dev)
import { publications as staticPublications } from '../data/publications'
import { getAllMembers } from '../data/team'
import { projects as staticProjects } from '../data/projects'
import { grants as staticGrants } from '../data/grants'

import type { Publication, TeamMember, Project, Grant } from '../data/types'

// ── Transform D1 rows → frontend types ──────────────────────

function rowToPublication(row: PublicationRow): Publication {
  return {
    id: row.id,
    authors: row.authors,
    title: row.title,
    journal: row.journal || '',
    year: row.year,
    status: row.status as Publication['status'],
    doi: row.doi || undefined,
    pubmed: row.pubmed || undefined,
    abstract: row.abstract || undefined,
    topics: row.topics ? JSON.parse(row.topics) : [],
    featured: row.featured === 1,
    authorSlugs: row.author_slugs ? JSON.parse(row.author_slugs) : undefined,
  }
}

function rowToTeamMember(row: TeamMemberRow): TeamMember {
  return {
    name: row.name,
    initials: row.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase(),
    role: row.role || '',
    credentials: row.credentials || undefined,
    slug: row.slug || undefined,
    photoUrl: row.photo_url || undefined,
    bio: row.bio || undefined,
    scholarId: row.scholar_id || undefined,
    authorName: row.author_name || undefined,
  }
}

function rowToProject(row: ProjectRow): Project {
  return {
    title: row.title,
    status: row.status as Project['status'],
    description: row.description || undefined,
    category: row.category || '',
    pi: row.pi || '',
    slug: row.slug || '',
    stage: row.stage as Project['stage'],
  }
}

function rowToGrant(row: GrantRow): Grant {
  return {
    mechanism: row.mechanism || '',
    title: row.title,
    agency: row.agency || '',
    pi: row.pi || '',
    proposed: row.proposed === 1,
    status: row.proposed ? 'Pending' : 'Active',
  }
}

// ── Query hooks ─────────────────────────────────────────────
//
// initialData: provides static data synchronously on first render (no flash).
// queryFn: fetches from D1 API. In production, succeeds and updates.
//          In dev, fails silently and initialData persists.
// This gives instant rendering in dev AND live D1 data in production.

const STALE_TIME = 5 * 60 * 1000 // 5 minutes

export function usePublications(params?: {
  year?: number
  status?: string
  topic?: string
}) {
  return useQuery({
    queryKey: ['publications', params],
    queryFn: async () => {
      const res = await fetchPublications(params)
      return res.data.map(rowToPublication)
    },
    initialData: params ? undefined : staticPublications,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const res = await fetchTeam()
      return res.data.map(rowToTeamMember)
    },
    initialData: getAllMembers(),
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useProjects(params?: { status?: string; category?: string }) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const res = await fetchProjects(params)
      return res.data.map(rowToProject)
    },
    initialData: params ? undefined : staticProjects,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useGrants() {
  return useQuery({
    queryKey: ['grants'],
    queryFn: async () => {
      const res = await fetchGrants()
      return res.data.map(rowToGrant)
    },
    initialData: staticGrants,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useCollaborationGraph() {
  return useQuery({
    queryKey: ['graph', 'collaboration'],
    queryFn: async () => {
      try {
        const res = await fetchCollaborationGraph()
        return res.data
      } catch {
        return null
      }
    },
    staleTime: STALE_TIME,
  })
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      try {
        const res = await fetchStats()
        return res.data
      } catch {
        return null
      }
    },
    staleTime: STALE_TIME,
  })
}

// ── Comments ────────────────────────────────────────────────

export interface Comment {
  id: string
  content: string
  author_name: string | null
  author_slug: string | null
  created_at: string
}

export function useComments(projectId: string) {
  return useQuery({
    queryKey: ['comments', projectId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/comments`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as Comment[]
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000, // 1 minute for comments
    enabled: !!projectId,
  })
}

// ── Activity Feed ───────────────────────────────────────────

export interface ActivityEntry {
  id: string
  type: string
  description: string
  actor: string | null
  related_id: string | null
  related_type: string | null
  timestamp: string
}

export function useActivity(limit: number = 20) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/activity?limit=${limit}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as ActivityEntry[]
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000,
  })
}
