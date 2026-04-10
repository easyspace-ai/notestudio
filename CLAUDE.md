# CLAUDE.md — NoteStudio (WeKnora) 项目开发指南

> 本文件供 Claude Code 及所有 AI 编码助手使用。描述项目架构、核心约定、**当前实现与目标的差距**、重构方向和开发规范。

---

## 项目概览

**NoteStudio（WeKnora）** 是一个企业级 LLM 文档理解与知识库问答框架，类 NotebookLM 产品。

- **后端**：Go 1.22+，核心业务在 `internal/`（含 `internal/application/` 服务层、`internal/agent/` 引擎、`internal/handler/` HTTP）
- **主站前端**：**React 19 + TypeScript + Vite**，目录 `frontend/`（用户侧对话、项目等）
- **管理后台**：**Vue 3 + TypeScript**，目录 `admin/`（配置、租户、Agent 编辑等）
- **文档解析**：独立 Python 服务 `docreader/`（多语言微服务）
- **MCP 服务**：`mcp-server/`（独立进程，stdio/SSE 双模式）
- **部署**：Docker Compose / Kubernetes Helm Chart

---

## 目录结构速查

```
mymind/
├── internal/
│   ├── agent/                 # ReAct 引擎：think / act / observe / finalize、与 tools 协作
│   ├── agent/tools/           # ToolRegistry、内置工具、Web 等注册实现
│   ├── agent/skills/          # Skills 加载与渐进披露
│   ├── application/service/   # 会话、知识库 QA、Agent 服务编排
│   ├── application/repository/# 数据访问（含 retriever 等）
│   ├── event/                 # EventBus、事件类型（检索 / Agent / 流式等）
│   ├── handler/               # HTTP 路由与流式响应
│   ├── models/                # chat、embedding、rerank、vlm 等
│   ├── types/                 # 领域模型（含 AgentState、AgentStep、Pipeline 定义）
│   ├── mcp/                   # MCP 客户端与管理
│   └── ...
├── frontend/                  # React 主站（src/pages、components、api）
├── admin/                     # Vue 管理端（src/views、components、stores）
├── docreader/
├── mcp-server/
├── migrations/
├── config/
└── skills/                    # Agent Skills 定义（若启用）
```

---

## 实现现状 vs 文档目标（必读）

以下避免按「从零开始」的错误优先级开工。

| 领域 | 已有实现（代码锚点） | 与目标的差距 |
|------|----------------------|--------------|
| **工具注册** | `internal/agent/tools/` 中 `ToolRegistry`；`internal/application/service/agent_service.go` 统一注册内置工具、MCP、Skills 相关能力 | 可继续收紧 **统一 Tool 接口形态**、入参/出参 schema，减少特例分支 |
| **事件总线** | `internal/event/event.go`：`EventBus`、检索/Rerank/Agent 流式等多类 `EventType` | **SSE/IM 输出**与 Bus 的边界仍可抽成 **OutputAdapter**，避免 handler 与业务细节纠缠 |
| **Agent 执行结构** | `internal/agent/engine.go` + `think.go` / `act.go` / `observe.go` / `finalize.go`；非单一巨型 `Run` | **会话编排层**上 RAG 管线与 Agent 引擎仍是 **双入口**，尚未收敛为统一 `Executor` 策略选择 |
| **强类型状态** | `internal/types/agent.go`：`AgentState`、`AgentStep`、`ToolCall` | `ToolCall.Args`、`event.Event.Data` / `Metadata` 等仍大量 `map[string]interface{}`，可逐步契约化 |
| **RAG 管线** | `internal/types/chat_manage.go` 中 `Pipeline`（如 `rag` / `rag_stream`）；`internal/application/service/chat_pipeline/`、`session_*_qa.go` 等 | 检索多后端、策略组合仍可走向 **可组合 Retriever**，见下文 Phase 5 |

---

## 当前架构问题（重构背景，已按现状校正）

### 1. 编排与 Agent 层

**历史形态**：曾易出现「单入口包揽 RAG + ReACT + 多渠道输出」的上帝对象。

**当前状态**：执行循环已拆到多文件引擎，工具与事件总线已接入；主要矛盾转为：

- **RAG 事件管线**（`Pipeline["rag"]` / `rag_stream` 等）与 **AgentEngine** 路径在 **application/service + handler** 层并行，缺少统一的 **Executor / 策略选择** 抽象。
- **流式输出**：Web SSE、IM 等与业务事件的耦合点仍可下沉到 **OutputAdapter**，便于测试与复用。

### 2. 检索层

- 多策略、多存储后端并存时，易出现适配重复、Rerank 与检索步骤边界模糊。
- 长期目标仍是 **可组合的 `Retriever` + 可选 Rerank / Parent-Child**，与现有 `application/repository`、`models/rerank` 渐进对齐。

### 3. 前端（双栈）

- **主站 React** 与 **管理端 Vue** 可能各自解析 SSE / 业务字段；应依赖 **同一套事件语义**（类型与字段约定），而不是各写一套 `mode` 分支。
- 工具调用展示与后端 payload 强耦合时，改版成本高；宜以 **稳定事件契约** 为中心演进。

### 4. IM 渠道

- 各 IM 适配器之间易重复；理想情况是 **与 Web 共用 EventBus → OutputAdapter** 的同一套语义（在不影响 Webhook 对外格式的前提下）。

---

## 重构目标架构（North Star）

### Agent：Strategy + 可观测 + 输出解耦

```go
// 目标：编排层可注入的执行策略（与现有 AgentEngine 演进对齐）
type Executor interface {
    Execute(ctx context.Context, state *types.AgentState) (*types.AgentState, error)
}

// 概念模型：RAGExecutor vs ReACTExecutor 由上层根据请求选择
type AgentRuntime struct {
    executor Executor
    eventBus *event.EventBus   // 已有实现，可强化订阅方
    output   OutputAdapter    // 待从 handler 中清晰抽出
}
```

### 工具：统一注册（与现状一致方向）

- 内置、MCP、Web、Skills 相关能力均经 **`ToolRegistry`** 注册（`agent_service` 已实践）；目标减少「另一套调用路径」。

### 检索：可组合管道

```go
type Retriever interface {
    Retrieve(ctx context.Context, query string, opts RetrieveOptions) ([]Document, error)
}
// NewRetrievalPipeline(...).WithReranker(...)
```

### 前端：只依赖事件语义，不依赖「内部模式」

```typescript
// 目标：统一事件联合类型（名称与字段需与后端 SSE 实际契约一致后再固化）
type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call_start'; tool: string; input: object }
  | { type: 'tool_call_end'; tool: string; output: object }
  | { type: 'retrieved_docs'; docs: Document[] }
  | { type: 'answer_chunk'; content: string }
  | { type: 'done'; duration_ms?: number }
```

**React（`frontend/`）**：用 `useAgentStream` / `useAgentChat` 等 **hooks** 聚合事件与派生状态。  
**Vue（`admin/`）**：用 **composables** 承担同等职责。  
**禁止**：在 UI 中写 `if (mode === 'rag' | 'agent')` 分支驱动展示；应依赖事件类型与载荷。

---

## 开发规范

### Go 后端

**当前 Agent 相关布局（以代码为准）：**

```
internal/agent/
├── engine.go       # 引擎入口、循环与生命周期
├── think.go / act.go / observe.go / finalize.go
├── prompts.go
├── tools/          # ToolRegistry、各工具实现
└── skills/

internal/types/agent.go    # AgentState、AgentStep、ToolCall 等
internal/event/event.go    # EventBus、EventType
```

**长期可演进为**（非强制一次性搬迁）：`executor_rag.go`、`executor_react.go`、`output/web.go` 等，与现有文件共存迁移。

**错误处理：**

```go
return fmt.Errorf("agent execute: tool call %s failed: %w", toolName, err)
```

**上下文**：首参 `context.Context`；Agent 内注意 `ctx.Done()` 取消。

**并发工具调用**：`act.go` 中已对多工具 `errgroup` 并行；新代码保持一致。

**测试**：新增执行策略或检索组件时，用 mock 覆盖核心路径。

### React 前端（`frontend/`）

- **页面**（`src/pages/`）：路由与数据装配，复杂逻辑下沉 hooks。
- **组件**（`src/components/`）：可复用展示与交互。
- **API / 流式**：与后端契约一致；Agent 相关建议集中 **hooks**（如 `src/hooks/` 或 `src/api/` 旁）解析 SSE。

### Vue 管理端（`admin/`）

- `views/`：页面级；`components/`：展示；`composables/`：可复用逻辑。
- Pinia：持久配置、列表等；**单次对话状态**优先 composable / 局部状态。

### API 与 SSE

- **REST**：`/api/v1/...`；分页与错误结构保持项目既有约定。
- **SSE**：以 **`handler/session` 等实际实现** 为准；若演进统一 `event:` 名与 JSON 信封，须 **同步更新 React + Vue 客户端**，并遵守下文「关键接口约定」。

示例（目标形态，非强制与当前字节级一致）：

```
event: agent_event
data: {"type":"tool_call_start","tool":"kb_search","input":{"query":"..."}}
```

---

## 重构路线图（校准后）

按 **收益 / 风险** 排序；前几项假设 ToolRegistry、EventBus、AgentState **已存在**（见上文对照表）。

### Phase 1：编排层统一（高优先级）

1. 梳理 **RAG 管线入口**（`Pipeline` / `KnowledgeQAByEvent` 等）与 **AgentEngine** 入口的差异与共享点。
2. 引入或演进 **Executor 抽象**，由上层根据会话类型选择 RAG 流程 vs ReAct 引擎（内部可仍调用现有实现，避免大爆炸重写）。

### Phase 2：输出适配与可观测（高优先级）

1. 将 **SSE / IM** 推送从零散分支收拢到 **OutputAdapter**（可逐步迁移）。
2. 关键节点继续通过 **`internal/event`** 发射；订阅方负责日志、追踪、推流（Handler 保持薄）。

### Phase 3：类型与契约收紧（中优先级）

1. 缩小 `map[string]interface{}`：**工具入参、事件 Data** 可向结构化类型或 JSON schema 过渡。
2. 前后端共享或手写一致的 **TypeScript / Go 注释契约**（视项目策略而定）。

### Phase 4：检索层统一（中长期）

1. 定义可组合的 **Retriever** 接口，与现有 repository、向量存储适配渐进融合。
2. Rerank、合并、Parent-Child 等以管道阶段接入，减少复制粘贴。

### Phase 5：双前端解耦（持续）

1. **React + Vue** 侧删除对内部 `mode` 的展示层分支，改为 **事件驱动 UI**。
2. 抽取共享的 **事件类型定义**（可放在各前端 `types/` 或共享包，按仓库策略执行）。

---

## 常用命令

```bash
make dev-start      # 基础设施（开发）
make dev-app        # 后端（含 Air 等，以 Makefile 为准）
make dev-frontend   # 主站前端（以 Makefile 为准）

go test ./internal/...

cd frontend && pnpm typecheck   # 或 npm run typecheck
cd admin && pnpm type-check     # 或 npm run type-check

make migrate-up
make swagger
make docker-build
make lint
```

---

## 关键接口约定（重构期间保持稳定）

重构 **`internal/`** 时，除非刻意发大版本并同步所有客户端，否则 **不得破坏**：

1. **REST API `/api/v1/`** — 前端与第三方集成
2. **SSE 实际帧格式与字段** — React / Vue 消费端
3. **MCP Server 协议** — 外部 MCP 客户端
4. **IM Webhook 格式** — 各平台回调

---

## 常见陷阱与注意事项

### 避免的反模式

```go
// ❌ Agent / handler 内直接 switch 渠道写死推流
switch channel { case "web": ... case "wechat": ... }
// ✅ 通过 OutputAdapter（或等价薄层）统一语义输出

// ❌ 工具内 panic
// ✅ recover 并返回 error

// ❌ Agent 循环内每步同步写库
// ✅ 批量或异步持久化，与产品延迟目标一致
```

### MCP

- 工具名以 **service name** 等为稳定标识（非随意 UUID）。
- 断线重连期间调用需 **重试/降级**。
- 工具返回图片时 **VLM 转描述** 的路径与现网一致（`agent_service` 已注入 describer）。

### 多租户

- 查询带 **`tenant_id`**；Shared Space 与 Agent 知识库范围按产品规则限制。

### 并发安全

- **ToolRegistry** 构建完成后只读即可。
- **单请求内 AgentState** 无需额外锁。
- **EventBus Handler** 可能在多 goroutine 触发，实现须线程安全。

---

## 参考资料

- [架构图](docs/images/architecture.png)
- [API 文档](docs/api/README.md)
- [开发指南](docs/开发指南.md)
- [MCP 配置指南](mcp-server/MCP_CONFIG.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
