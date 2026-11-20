# PRD: Orca Workflowy 侧边栏插件

- **来源**：会话 `bc69d88b-4b9d-41bf-8ab0-a8bcb1b554a8`，日期：2026-11-20
- **目标**：开发一个基于 `trusted-worker` + 侧边栏面板（`worker-panel`）的 Orca 插件，在 Orca 侧边栏直接展示并操作 Workflowy 大纲内容。
- **为什么**：在 Orca 工作流中无需切换外部应用即可快速查看、检索、勾选完成、新增和编辑 Workflowy 节点。

## 功能需求
1. **配置与认证（Settings）**
   - 在 Orca `Settings → Plugins` 中提供配置项：
     - `apiKey`：Workflowy API Key（Bearer Token）。
     - `rootNodeId`（可选）：指定只加载某个 Root Node ID；留空则默认加载全部顶层节点。
2. **数据拉取与缓存（Worker）**
   - 通过 `https://workflowy.com/api/v1` 请求节点数据。
   - 支持本地缓存（`orca.storage`），避免每次打开侧边栏都重新全量拉取。
   - 支持手动刷新同步最新数据。
3. **大纲浏览与检索（Panel）**
   - 树形展示节点（名称、完成状态、备注指示、子节点展开/折叠）。
   - 顶部搜索框支持按关键词实时过滤。
4. **节点读写操作（Panel + Worker）**
   - **新增节点**：支持在顶层或指定父节点下创建新节点（`POST /api/v1/nodes`）。
   - **标记完成**：支持勾选/取消完成节点（`POST /api/v1/nodes/:id/complete`）。
   - **编辑节点**：支持修改节点标题或备注（`POST /api/v1/nodes/:id`）。

## 边界（明确不要改/不要做的部分）
- **不做**全量实时 WebSocket 双向同步（仅按需拉取 + 手动刷新 + 操作后局部更新）。
- **不做**复杂富文本/镜像节点（Mirror）渲染，仅处理纯文本标题与基础备注。
- **不通过**浏览器自动化或非官方私有接口抓取数据，严格使用官方 REST API v1。
- **不改动** Orca 宿主本身的代码。
