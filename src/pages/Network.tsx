import { useState, useMemo, useCallback } from 'react'
import { usePageMeta } from '../hooks/usePageMeta'
import { usePublications } from '../hooks/useApiData'
import { PublicHead } from '../components/public/PublicParts'
import CollaborationGraph from '../components/CollaborationGraph'
import NetworkSidebar from '../components/NetworkSidebar'
import NetworkFilters, { type NetworkFilterState } from '../components/NetworkFilters'
import type { NetworkNode, NetworkEdge } from '../components/CollaborationGraph'
import { PANEL_BG, withAlpha } from '../lib/taskGrouping'
import { isPublished } from '../lib/publicationCounts'

export default function Network() {
  usePageMeta(
    'Collaboration Network | MN-CCORE',
    'Interactive visualization of co-authorship connections across MNCCORE, CLIF, and collaborator publications.'
  )

  const { data: publications = [] } = usePublications()

  const publishedPubs = useMemo(
    () => publications.filter(isPublished),
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
    <div className="content-container pub-foot">
      <PublicHead
        kicker="The network"
        title={<>Who we write <em>with</em>.</>}
        lede="Each dot is an author and each line a paper two authors share. The lab sits at the center of the CLIF Consortium's co-authorship."
        small
      />

      {/* The graph stays on a dark canvas in both themes: it draws on <canvas>. */}
      <div className="pub-net">
        <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3" style={{ zIndex: 'var(--z-dropdown)' }}>
          <div className="flex items-center justify-between mb-3" style={{ minHeight: 20 }}>
            {networkStats ? (
              <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <span><strong style={{ color: '#eef1f4' }}>{networkStats.nodes}</strong> authors</span>
                <span>&middot;</span>
                <span><strong style={{ color: '#eef1f4' }}>{networkStats.edges}</strong> connections</span>
                {networkStats.hub && (
                  <>
                    <span className="hidden sm:inline">&middot;</span>
                    <span className="hidden sm:inline">Most connected: <strong style={{ color: '#eef1f4' }}>{networkStats.hub}</strong></span>
                  </>
                )}
              </div>
            ) : <span />}
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{filteredPublications.length} papers</p>
          </div>
          <NetworkFilters publications={publications} filters={filters} onChange={setFilters} />
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
          <NetworkSidebar
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            allNodes={graphNodes}
            allEdges={graphEdges}
            onClose={handleClose}
          />
          <div className="sm:hidden absolute top-2 left-0 right-0 text-center" style={{ zIndex: 'var(--z-sticky)' }}>
            <span className="text-xs px-3 py-1 rounded-full" style={{ color: 'rgba(255, 255, 255, 0.6)', background: withAlpha(PANEL_BG, 60), fontSize: '11px' }}>
              Pinch to zoom &middot; Tap nodes to explore
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
