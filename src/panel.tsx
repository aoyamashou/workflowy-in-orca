import {
  atom,
  Badge,
  Button,
  Heading,
  Input,
  plugin,
  read,
  Row,
  set,
  Stack,
  Text,
  update,
  type PanelContext
} from 'orca'
import type { WfLoadResult, WfNode } from './protocol'

const state = atom<WfLoadResult>({ configured: true, nodes: [] })
const loading = atom<boolean>(false)
const searchQuery = atom<string>('')
const expandedIds = atom<Record<string, boolean>>('wf_expanded', {}, { persist: 'plugin' })
const newRootText = atom<string>('')
const editingId = atom<string | null>(null)
const editingText = atom<string>('')
const addingParentId = atom<string | null>(null)
const addingChildText = atom<string>('')

async function refreshOutline(force = false): Promise<void> {
  set(loading, true)
  try {
    const res = await plugin.request('wf.load', { refresh: force })
    set(state, res)
  } finally {
    set(loading, false)
  }
}

async function createRootNode(): Promise<void> {
  const name = read(newRootText).trim()
  if (!name) return
  set(newRootText, '')
  set(loading, true)
  try {
    const res = await plugin.request('wf.createNode', { name })
    set(state, res)
  } finally {
    set(loading, false)
  }
}

async function createChildNode(parentId: string): Promise<void> {
  const name = read(addingChildText).trim()
  if (!name) return
  set(addingChildText, '')
  set(addingParentId, null)
  set(loading, true)
  try {
    const res = await plugin.request('wf.createNode', { parentId, name })
    set(state, res)
    update(expandedIds, (prev) => ({ ...prev, [parentId]: true }))
  } finally {
    set(loading, false)
  }
}

async function saveEdit(id: string): Promise<void> {
  const name = read(editingText).trim()
  set(editingId, null)
  if (!name) return
  set(loading, true)
  try {
    const res = await plugin.request('wf.updateNode', { id, name })
    set(state, res)
  } finally {
    set(loading, false)
  }
}

async function toggleNode(id: string, completed: boolean): Promise<void> {
  set(loading, true)
  try {
    const res = await plugin.request('wf.toggleComplete', { id, completed })
    set(state, res)
  } finally {
    set(loading, false)
  }
}

async function removeNode(id: string): Promise<void> {
  set(loading, true)
  try {
    const res = await plugin.request('wf.deleteNode', { id })
    set(state, res)
  } finally {
    set(loading, false)
  }
}

async function toggleExpand(node: WfNode): Promise<void> {
  const isExpanded = Boolean(read(expandedIds)[node.id])
  if (isExpanded) {
    update(expandedIds, (prev) => ({ ...prev, [node.id]: false }))
    return
  }
  update(expandedIds, (prev) => ({ ...prev, [node.id]: true }))
  if (!node.children || node.children.length === 0) {
    set(loading, true)
    try {
      const res = await plugin.request('wf.loadChildren', { parentId: node.id })
      set(state, res)
    } finally {
      set(loading, false)
    }
  }
}

function filterNodes(nodes: WfNode[], query: string): WfNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const result: WfNode[] = []
  for (const node of nodes) {
    const children = filterNodes(node.children ?? [], q)
    const matches =
      node.name.toLowerCase().includes(q) || (node.note ?? '').toLowerCase().includes(q)
    if (matches || children.length > 0) {
      result.push({ ...node, children })
    }
  }
  return result
}

function renderNode(node: WfNode, depth: number, query: string) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const expanded = Boolean(query.trim()) || Boolean(read(expandedIds)[node.id])
  const isEditing = read(editingId) === node.id
  const isAddingChild = read(addingParentId) === node.id

  return (
    <Stack key={node.id} gap="xs">
      <Row gap="xs" align="center">
        {depth > 0 && <Text muted size="xs">{'  '.repeat(depth)}</Text>}
        <Button variant="ghost" size="xs" onPress={() => void toggleExpand(node)}>
          {expanded ? '▾' : '▸'}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onPress={() => void toggleNode(node.id, !node.completed)}
        >
          {node.completed ? '☑' : '☐'}
        </Button>
        {isEditing ? (
          <Row gap="xs" align="center">
            <Input
              label="Edit node"
              labelHidden
              value={read(editingText)}
              onChange={(v: string) => set(editingText, v)}
              onSubmit={() => void saveEdit(node.id)}
            />
            <Button size="xs" onPress={() => void saveEdit(node.id)}>
              Save
            </Button>
            <Button size="xs" variant="ghost" onPress={() => set(editingId, null)}>
              Cancel
            </Button>
          </Row>
        ) : (
          <Row gap="xs" align="center">
            <Text muted={Boolean(node.completed)}>{node.name || '(untitled)'}</Text>
            <Button
              size="xs"
              variant="ghost"
              onPress={() => {
                set(editingId, node.id)
                set(editingText, node.name)
              }}
            >
              Edit
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onPress={() => {
                set(addingParentId, isAddingChild ? null : node.id)
                set(addingChildText, '')
              }}
            >
              +
            </Button>
            <Button size="xs" variant="ghost" onPress={() => void removeNode(node.id)}>
              ×
            </Button>
          </Row>
        )}
      </Row>
      {isAddingChild && (
        <Row gap="xs" align="center">
          <Text muted size="xs">{'  '.repeat(depth + 1)}</Text>
          <Input
            label="New child node"
            labelHidden
            placeholder="New child node..."
            value={read(addingChildText)}
            onChange={(v: string) => set(addingChildText, v)}
            onSubmit={() => void createChildNode(node.id)}
          />
          <Button size="xs" onPress={() => void createChildNode(node.id)}>
            Add
          </Button>
        </Row>
      )}
      {expanded && hasChildren && node.children!.map((child) => renderNode(child, depth + 1, query))}
    </Stack>
  )
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('wf.updated', (payload) => set(state, payload)))
  void refreshOutline(false)
}

export default function Panel() {
  const data = read(state)
  const isLoading = read(loading)
  const query = read(searchQuery)
  const visibleNodes = filterNodes(data.nodes, query)

  return (
    <Stack gap="sm">
      <Row justify="between" align="center">
        <Row gap="xs" align="center">
          <Heading>Workflowy</Heading>
          {isLoading && <Badge tone="accent">Syncing</Badge>}
        </Row>
        <Button size="xs" variant="ghost" onPress={() => void refreshOutline(true)}>
          Refresh
        </Button>
      </Row>

      {!data.configured ? (
        <Stack gap="xs">
          <Text muted size="sm">
            Workflowy API Key is not configured yet.
          </Text>
          <Text muted size="xs">
            Open Orca Settings → Plugins → Workflowy and paste your API key from workflowy.com/api-key/.
          </Text>
          <Button size="xs" onPress={() => void refreshOutline(true)}>
            Retry
          </Button>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Row gap="xs">
            <Input
              label="Search outline"
              labelHidden
              type="search"
              placeholder="Search outline..."
              value={query}
              onChange={(v: string) => set(searchQuery, v)}
            />
          </Row>

          <Row gap="xs">
            <Input
              label="New top-level node"
              labelHidden
              placeholder="Add top-level node..."
              value={read(newRootText)}
              onChange={(v: string) => set(newRootText, v)}
              onSubmit={() => void createRootNode()}
            />
            <Button size="xs" onPress={() => void createRootNode()}>
              Add
            </Button>
          </Row>

          {data.error && (
            <Text muted size="xs">
              Error: {data.error}
            </Text>
          )}

          {visibleNodes.length === 0 ? (
            <Text muted size="xs">
              {query.trim() ? 'No matching nodes.' : 'No nodes found.'}
            </Text>
          ) : (
            <Stack gap="xs">{visibleNodes.map((node) => renderNode(node, 0, query))}</Stack>
          )}
        </Stack>
      )}
    </Stack>
  )
}
