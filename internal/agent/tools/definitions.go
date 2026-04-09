package tools

// maxFunctionNameLength is the maximum length for a tool/function name
// imposed by the OpenAI API.
const maxFunctionNameLength = 64

// Tool names constants
const (
	ToolThinking            = "thinking"
	ToolTodoWrite           = "todo_write"
	ToolGrepChunks          = "grep_chunks"
	ToolKnowledgeSearch     = "knowledge_search"
	ToolListKnowledgeChunks = "list_knowledge_chunks"
	ToolQueryKnowledgeGraph = "query_knowledge_graph"
	ToolGetDocumentInfo     = "get_document_info"
	ToolDatabaseQuery       = "database_query"
	ToolDataAnalysis        = "data_analysis"
	ToolDataSchema          = "data_schema"
	ToolWebSearch           = "web_search"
	ToolWebFetch            = "web_fetch"
	ToolFinalAnswer         = "final_answer"
	// Skills-related tools (only available when skills are enabled)
	ToolExecuteSkillScript = "execute_skill_script"
	ToolReadSkill          = "read_skill"
	// Workspace / metanote-style tools (opt-in via allowed_tools)
	ToolReadFile        = "read_file"
	ToolWriteFile       = "write_file"
	ToolStrReplace      = "str_replace"
	ToolLs              = "ls"
	ToolGlob            = "glob"
	ToolBash            = "bash"
	ToolTask            = "task"
	ToolViewImage       = "view_image"
	ToolToolSearch      = "tool_search"
	ToolInvokeACPAgent  = "invoke_acp_agent"
	ToolSetupAgent      = "setup_agent"
)

// AvailableTool defines a simple tool metadata used by settings APIs.
type AvailableTool struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// AvailableToolDefinitions returns the list of tools exposed to the UI.
// Keep this in sync with registered tools in this package.
func AvailableToolDefinitions() []AvailableTool {
	return []AvailableTool{
		{Name: ToolThinking, Label: "思考", Description: "动态和反思性的问题解决思考工具"},
		{Name: ToolTodoWrite, Label: "制定计划", Description: "创建结构化的研究计划"},
		{Name: ToolGrepChunks, Label: "关键词搜索", Description: "快速定位包含特定关键词的文档和分块"},
		{Name: ToolKnowledgeSearch, Label: "语义搜索", Description: "理解问题并查找语义相关内容"},
		{Name: ToolListKnowledgeChunks, Label: "查看文档分块", Description: "获取文档完整分块内容"},
		{Name: ToolQueryKnowledgeGraph, Label: "查询知识图谱", Description: "从知识图谱中查询关系"},
		{Name: ToolGetDocumentInfo, Label: "获取文档信息", Description: "查看文档元数据"},
		{Name: ToolDatabaseQuery, Label: "查询数据库", Description: "查询数据库中的信息"},
		{Name: ToolDataAnalysis, Label: "数据分析", Description: "理解数据文件并进行数据分析"},
		{Name: ToolDataSchema, Label: "查看数据元信息", Description: "获取表格文件的元信息"},
		{Name: ToolReadSkill, Label: "读取技能", Description: "按需读取技能内容以学习专业能力"},
		{Name: ToolExecuteSkillScript, Label: "执行技能脚本", Description: "在沙箱环境中执行技能脚本"},
		{Name: ToolReadFile, Label: "读取文件", Description: "读取工作区或虚拟路径下的文件"},
		{Name: ToolWriteFile, Label: "写入文件", Description: "写入 /mnt/user-data 或工作区相对路径"},
		{Name: ToolStrReplace, Label: "替换文件内容", Description: "在文件中进行字符串替换"},
		{Name: ToolLs, Label: "列出目录", Description: "列出目录内容"},
		{Name: ToolGlob, Label: "文件匹配", Description: "按 glob 模式列出文件"},
		{Name: ToolBash, Label: "Shell命令", Description: "在会话工作区执行白名单 shell 命令"},
		{Name: ToolTask, Label: "子任务", Description: "委托子代理执行独立任务"},
		{Name: ToolViewImage, Label: "查看图片", Description: "加载图片供多模态模型分析"},
		{Name: ToolToolSearch, Label: "工具搜索", Description: "按关键词搜索可用工具"},
		{Name: ToolInvokeACPAgent, Label: "外部ACP代理", Description: "调用配置的外部代理命令"},
		{Name: ToolSetupAgent, Label: "保存智能体草稿", Description: "将智能体配置写入工作区草稿文件"},
		{Name: ToolFinalAnswer, Label: "提交最终回答", Description: "提交最终回答给用户"},
	}
}

// DefaultAllowedTools returns the default allowed tools list.
func DefaultAllowedTools() []string {
	return []string{
		ToolThinking,
		ToolTodoWrite,
		ToolKnowledgeSearch,
		ToolGrepChunks,
		ToolListKnowledgeChunks,
		ToolQueryKnowledgeGraph,
		ToolGetDocumentInfo,
		ToolDatabaseQuery,
		ToolDataAnalysis,
		ToolDataSchema,
		ToolFinalAnswer,
	}
}
