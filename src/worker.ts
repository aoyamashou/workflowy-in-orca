import type { JsonValue, OrcaWorkerApi } from 'orca/worker'
import type { WfLoadResult, WfNode } from './protocol'

const API_BASE = 'https://workflowy.com/api/v1'
const CACHE_KEY = 'wf_nodes_cache'

interface RawWfNode {
  id: string
  name?: string
  note?: string | null
  completed?: boolean
  completedAt?: number | null
  children?: RawWfNode[]
}

function normalizeNode(raw: RawWfNode): WfNode {
  return {
    id: raw.id,
    name: raw.name ?? '',
    note: raw.note ?? null,
    completed: Boolean(raw.completed || raw.completedAt),
    children: Array.isArray(raw.children) ? raw.children.map(normalizeNode) : []
  }
}

async function getConfig(orca: OrcaWorkerApi): Promise<{ apiKey: string; rootNodeId: string }> {
  const apiKey = String((await orca.settings.get('apiKey')) ?? '').trim()
  const rootNodeId = String((await orca.settings.get('rootNodeId')) ?? '').trim()
  return { apiKey, rootNodeId }
}

async function wfFetch(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {})
    }
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Workflowy API ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as Record<string, unknown>
}

async function fetchNodes(orca: OrcaWorkerApi, apiKey: string, rootNodeId: string): Promise<WfNode[]> {
  const path = rootNodeId ? `/nodes/${encodeURIComponent(rootNodeId)}` : '/nodes'
  const data = await wfFetch(apiKey, path)
  let nodes: WfNode[] = []
  if (Array.isArray(data.nodes)) {
    nodes = (data.nodes as RawWfNode[]).map(normalizeNode)
  } else if (data.node && typeof data.node === 'object') {
    nodes = [normalizeNode(data.node as RawWfNode)]
  }
  await orca.storage.set(CACHE_KEY, nodes as unknown as JsonValue)
  return nodes
}

async function loadOutline(orca: OrcaWorkerApi, refresh = false): Promise<WfLoadResult> {
  const { apiKey, rootNodeId } = await getConfig(orca)
  if (!apiKey) {
    return { configured: false, nodes: [] }
  }

  if (!refresh) {
    const cached = await orca.storage.get(CACHE_KEY)
    if (Array.isArray(cached) && cached.length > 0) {
      return { configured: true, nodes: cached as unknown as WfNode[], fromCache: true }
    }
  }

  try {
    const nodes = await fetchNodes(orca, apiKey, rootNodeId)
    return { configured: true, nodes, fromCache: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const cached = await orca.storage.get(CACHE_KEY)
    return {
      configured: true,
      nodes: Array.isArray(cached) ? (cached as unknown as WfNode[]) : [],
      error: message
    }
  }
}

function mergeChildren(nodes: WfNode[], parentId: string, children: WfNode[]): WfNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: mergeChildren(node.children, parentId, children) }
    }
    return node
  })
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('wf.load', async (input) => {
    return loadOutline(orca, Boolean(input?.refresh))
  })

  orca.panels.handle('wf.loadChildren', async ({ parentId }) => {
    const { apiKey } = await getConfig(orca)
    if (!apiKey) return { configured: false, nodes: [] }
    try {
      const data = await wfFetch(apiKey, `/nodes?parent_id=${encodeURIComponent(parentId)}`)
      const children = Array.isArray(data.nodes)
        ? (data.nodes as RawWfNode[]).map(normalizeNode)
        : []
      const cached = await orca.storage.get(CACHE_KEY)
      const current = Array.isArray(cached) ? (cached as unknown as WfNode[]) : []
      const updated = mergeChildren(current, parentId, children)
      await orca.storage.set(CACHE_KEY, updated as unknown as JsonValue)
      return { configured: true, nodes: updated }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const cached = await orca.storage.get(CACHE_KEY)
      return {
        configured: true,
        nodes: Array.isArray(cached) ? (cached as unknown as WfNode[]) : [],
        error: message
      }
    }
  })

  orca.panels.handle('wf.createNode', async ({ parentId, name }) => {
    const { apiKey, rootNodeId } = await getConfig(orca)
    if (!apiKey) return { configured: false, nodes: [] }
    await wfFetch(apiKey, '/nodes', {
      method: 'POST',
      body: JSON.stringify({
        parent_id: parentId ?? (rootNodeId || undefined),
        name
      })
    })
    const result = await loadOutline(orca, true)
    orca.panels.post('wf.updated', result)
    return result
  })

  orca.panels.handle('wf.updateNode', async ({ id, name }) => {
    const { apiKey } = await getConfig(orca)
    if (!apiKey) return { configured: false, nodes: [] }
    await wfFetch(apiKey, `/nodes/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ name })
    })
    const result = await loadOutline(orca, true)
    orca.panels.post('wf.updated', result)
    return result
  })

  orca.panels.handle('wf.toggleComplete', async ({ id, completed }) => {
    const { apiKey } = await getConfig(orca)
    if (!apiKey) return { configured: false, nodes: [] }
    const action = completed ? 'complete' : 'uncomplete'
    await wfFetch(apiKey, `/nodes/${encodeURIComponent(id)}/${action}`, {
      method: 'POST'
    })
    const result = await loadOutline(orca, true)
    orca.panels.post('wf.updated', result)
    return result
  })

  orca.panels.handle('wf.deleteNode', async ({ id }) => {
    const { apiKey } = await getConfig(orca)
    if (!apiKey) return { configured: false, nodes: [] }
    await wfFetch(apiKey, `/nodes/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    const result = await loadOutline(orca, true)
    orca.panels.post('wf.updated', result)
    return result
  })

  orca.panels.handle('wf.moveNode', async ({ id, parentId, position }) => {
    const { apiKey } = await getConfig(orca)
    if (!apiKey) return { configured: false, nodes: [] }
    await wfFetch(apiKey, `/nodes/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({
        parent_id: parentId ?? null,
        position: position ?? 'top'
      })
    })
    const result = await loadOutline(orca, true)
    orca.panels.post('wf.updated', result)
    return result
  })
}
