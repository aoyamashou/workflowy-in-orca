export type WfNode = {
  id: string
  name: string
  note?: string | null
  completed?: boolean
  children?: WfNode[]
}

export type WfLoadResult = {
  configured: boolean
  nodes: WfNode[]
  error?: string
  fromCache?: boolean
}

declare module 'orca' {
  interface PluginRequests {
    'wf.load': { input: { refresh?: boolean }; output: WfLoadResult }
    'wf.loadChildren': { input: { parentId: string }; output: WfLoadResult }
    'wf.createNode': {
      input: { parentId?: string | null; name: string }
      output: WfLoadResult
    }
    'wf.updateNode': {
      input: { id: string; name: string }
      output: WfLoadResult
    }
    'wf.toggleComplete': {
      input: { id: string; completed: boolean }
      output: WfLoadResult
    }
    'wf.deleteNode': {
      input: { id: string }
      output: WfLoadResult
    }
  }
  interface PluginPanelEvents {
    'wf.updated': WfLoadResult
  }
}
