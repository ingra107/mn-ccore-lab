import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { usePublications } from '../hooks/useApiData'
import CollaborationGraph from '../components/CollaborationGraph'
import NetworkSidebar from '../components/NetworkSidebar'
import NetworkFilters, { type NetworkFilterState } from '../components/NetworkFilters'
import type { NetworkNode, NetworkEdge } from '../components/CollaborationGraph'

export default function Network() {
  usePageMeta(
    'Collaboration Network | MN-CCORE',
    'Interactive visualization of co-authorship connections across MNCCORE, CLIF, and collaborator publications.'
  )

  const { data: publications = [] } = usePublications()

  const publishedPubs = useMemo(
    () => publications.filter((p) => p.status === 'Published'),
    [publications]
  )

  const years = useMemo(() => {
    if (publishedPubs.length === 0) {
      const now = new Date().getFullYear()
      return { min: now - 5, max: now }
    }
    const yrs = publishedPubs.map((p) => p.year)
    return { min: Math.min(...yrs), max: Math.max(...yrs) }
  }, [publishedPubs])

  const [filters, setFilters] = useState<NetworkFilterState>({
    yearRange: [years.min, years.max],
    activeTopics: [],
    mnccoreOnly: false,
  })

  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<NetworkEdge | null>(null)

  // Track all nodes/edges for the sidebar (received from CollaborationGraph)
  const [graphNodes, setGraphNodes] = useState<NetworkNode[]>([])
  const [graphEdges, setGraphEdges] = useState<NetworkEdge[]>([])

  // Network stats
  const networkStats = useMemo(() => {
    if (graphNodes.length === 0) return null
    const avgConnections = graphNodes.length > 0
      ? (graphEdges.length * 2 / graphNodes.length).toFixed(1)
      : '0'
    const maxNode = graphNodes.reduce((best, n) => {
      const count = graphEdges.filter(e => e.source === n.id || e.target === n.id).length
      return count > (best.count || 0) ? { name: n.name, count } : best
    }, { name: '', count: 0 })
    return { nodes: graphNodes.length, edges: graphEdges.length, avgConnections, hub: maxNode.name }
  }, [graphNodes, graphEdges])

  // Filter publications based on current filter state
  const filteredPublications = useMemo(() => {
    return publishedPubs.filter((pub) => {
      if (pub.year < filters.yearRange[0] || pub.year > filters.yearRange[1]) {
        return false
      }
      if (
        filters.activeTopics.length > 0 &&
        !pub.topics.some((t) => filters.activeTopics.includes(t))
      ) {
        return false
      }
      return true
    })
  }, [publishedPubs, filters])

  const handleNodeClick = useCallback((node: NetworkNode | null) => {
    setSelectedNode(node)
    if (node) setSelectedEdge(null)
  }, [])

  const handleEdgeClick = useCallback((edge: NetworkEdge | null) => {
    setSelectedEdge(edge)
    if (edge) setSelectedNode(null)
  }, [])

  const handleClose = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [])

  const handleGraphData = useCallback((nodes: NetworkNode[], edges: NetworkEdge[]) => {
    setGraphNodes(nodes)
    setGraphEdges(edges)
  }, [])

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f1923 0%, #1a2a3a 40%, #2c3e50 100%)',
      }}
    >
      {/* Header bar */}
      <div
        className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3"
        style={{ zIndex: 30 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-sm transition-colors duration-200 hover:!text-[var(--gold)]"
              style={{
                color: 'rgba(255, 255, 255, 0.5)',
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={14} />
              Home
            </Link>
            <span style={{ color: 'rgba(201, 168, 76, 0.2)' }}>/</span>
            <h1
              className="text-lg sm:text-xl"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: '#ffffff',
              }}
            >
              Collaboration Network
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            {networkStats && (
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span><strong style={{ color: 'rgba(45,138,138,0.8)' }}>{networkStats.nodes}</strong> authors</span>
                <span>&middot;</span>
                <span><strong style={{ color: 'rgba(201,168,76,0.8)' }}>{networkStats.edges}</strong> connections</span>
                <span>&middot;</span>
                <span>{networkStats.avgConnections} avg</span>
                {networkStats.hub && (
                  <>
                    <span>&middot;</span>
                    <span>Hub: <strong style={{ color: 'rgba(255,255,255,0.5)' }}>{networkStats.hub}</strong></span>
                  </>
                )}
              </div>
            )}
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
              {filteredPublications.length} papers
            </p>
          </div>
        </div>

        {/* Filters */}
        <NetworkFilters
          publications={publications}
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {/* Graph area (fills remaining space) */}
      <div className="flex-1 relative min-h-0">
        <CollaborationGraph
          publications={filteredPublications}
          fullPage
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onGraphData={handleGraphData}
          selectedNodeId={selectedNode?.id ?? null}
          selectedEdge={selectedEdge}
          showExternal={!filters.mnccoreOnly}
        />

        {/* Sidebar */}
        <NetworkSidebar
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          allNodes={graphNodes}
          allEdges={graphEdges}
          onClose={handleClose}
        />

        {/* Mobile hint */}
        <div
          className="sm:hidden absolute top-2 left-0 right-0 text-center"
          style={{ zIndex: 5 }}
        >
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              background: 'rgba(15, 25, 35, 0.6)',
              fontSize: '10px',
            }}
          >
            Pinch to zoom &middot; Tap nodes to explore
          </span>
        </div>
      </div>
    </div>
  )
}
