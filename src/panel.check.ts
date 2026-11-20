import { defineCheck } from 'orca/testing'

export default defineCheck({
  unconfigured: {},
  loaded: {
    storage: {
      wf_nodes_cache: [
        {
          id: 'node-1',
          name: 'Work Projects',
          completed: false,
          children: [
            { id: 'node-1-1', name: 'Orca Workflowy Plugin', completed: false, children: [] },
            { id: 'node-1-2', name: 'Write PRD', completed: true, children: [] }
          ]
        },
        {
          id: 'node-2',
          name: 'Reading List',
          completed: false,
          children: []
        }
      ]
    }
  }
})
