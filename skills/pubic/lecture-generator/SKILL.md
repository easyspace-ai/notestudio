---
name: lecture-generator
description: 生成符合高校教学规范的HTML演示文稿；当用户需要制作教学课件、学术汇报、知识可视化时使用
dependency:
  python:
    - jinja2==3.1.2
    - markdown==3.4.4
  system:
    - python3 -m pip install jinja2 markdown -q 2>/dev/null
---

# Lecture Generator

## 任务目标
- 本 Skill 用于：将教学内容转换为符合高校教学规范的HTML演示文稿
- 能力包含：内容结构化、学术表述优化、动画仿真生成、公式渲染、数据可视化
- 触发条件：用户提供教学内容并要求制作演示文稿时

## 前置准备
- 依赖说明：
  ```
  jinja2==3.1.2
  markdown==3.4.4
  ```

## 操作步骤
- 标准流程：
  1. **内容分析与结构化**
     - 智能体分析用户提供的教学内容
     - 按"章-节-知识点"三级体系组织内容
     - 识别需要公式、动画、图表的知识点

  2. **内容优化与设计**
     - 将内容转换为学术性中文表述
     - 设计思考题和教学案例
     - 决定动画和图表的教育意义
     - 参考 [references/slide-structure.md](references/slide-structure.md) 确保幻灯片结构符合规范

  2. **调用脚本生成HTML**
     - 调用 `scripts/html-generator.py` 生成完整的HTML文件
     - 传入参数包括：标题、作者、幻灯片内容列表、动画配置、图表配置等

  3. **输出交付**
     - 提供生成的HTML文件
     - 说明如何使用演示文稿（键盘快捷键等）
     - 说明支持的动画和图表类型

- 可选分支：
  - 当仅需要结构指导：提供SKILL.md中的结构说明，不调用脚本
  - 当需要PPT格式：说明当前Skill仅支持HTML格式，可由用户自行转换

## 资源索引
- 必要脚本：见 [scripts/html-generator.py](scripts/html-generator.py)（用途：生成完整的RevealJS HTML文件，支持公式、动画、图表）
- RevealJS配置：见 [references/revealjs-guide.md](references/revealjs-guide.md)（何时读取：需要了解RevealJS高级功能时）
- 动画模板：见 [references/animation-templates.md](references/animation-templates.md)（何时读取：设计动画时参考）
- 图表模板：见 [references/chart-templates.md](references/chart-templates.md)何时读取：设计图表时参考）
- 结构规范：见 [references/slide-structure.md](references/slide-structure.md)（何时读取：设计幻灯片时参考）

## 注意事项
- 智能体负责所有内容设计和教学逻辑，脚本仅负责HTML生成
- 动画和图表必须有明确的教育意义，不应仅为视觉效果
- 避免单张幻灯片内容过载，必要时拆分或使用垂直幻灯片
- 确保生成的HTML在不同设备上均可正常显示
- 动画支持参数修改，提供开始/结束等控制按钮

## 脚本调用规范

调用 html-generator.py 时必须提供以下参数：

### 必需参数
- `--title`: 主标题（如"数据结构与算法"）
- `--author`: 演讲者信息（如"张三教授 | 计算机学院"）
- `output`: 输出文件路径

### 幻灯片内容（JSON格式）
通过 `--content` 参数传递JSON格式的幻灯片内容，格式如下：

```json
{
  "title": "幻灯片标题",
  "subtitle": "副标题（可选）",
  "content": "正文内容（支持HTML或Markdown）",
  "formulas": ["$$公式1$$", "$公式2$"],
  "fragments": ["要点1", "要点2"],
  "has_animation": false,
  "has_chart": false,
  "has_mermaid": false,
  "mermaid_code": "",
  "thought_question": "思考题（可选）"
}
```

### 动画配置（可选）
通过 `--animation` 参数传递JSON格式的动画配置：

```json
{
  "type": "simulation",
  "canvas_id": "animation-canvas-1",
  "params": {"param1": "value1"},
  "script": "JavaScript代码"
}
```

### 图表配置（可选）
通过 `--chart` 参数传递JSON格式的图表配置：

```json
{
  "type": "bar",
  "canvas_id": "chart-canvas-1",
  "title": "图表标题",
  "labels": ["标签1", "标签2"],
  "data": [10, 20],
  "colors": ["#FF6384", "#36A2EB"]
}
```

### 调用示例

```bash
python scripts/html-generator.py \
  --title "数据结构" \
  --author "张教授" \
  --content '[{"title":"第一章", "content":"绪论", "fragments":["要点1","要点2"]}]' \
  --output lecture.html
```

## 使用示例

### 示例1：生成基础演示文稿

用户提供：一篇关于"冒泡排序算法"的文档

智能体执行：
1. 分析文档，提取核心知识点（算法原理、时间复杂度、代码实现）
2. 按"章-节-知识点"组织（第一章：排序算法基础 > 1.1 冒泡排序原理 > 1.1.1 算法步骤）
3. 决定添加动画演示排序过程
4. 调用脚本生成HTML，包含动画配置
5. 输出：完整的HTML演示文稿

### 示例2：添加数学公式演示

用户提供：微积分教材内容

智能体执行：
1. 识别数学公式，转换为LaTeX语法
2. 设计公式逐步展示的片段
3. 调用脚本，在formulas参数中传递公式列表
4. 脚本自动集成KaTeX渲染

### 示例章-节-知识点结构示例

```
第一章 基本数据结构
├── 1.1 数组
│   └── 1.1.1 数组的定义
├── 1.2 链表
│   ├── 1.2.1 单链表
│   └── 1.987654321098765432109876543210987654321098765432109876543210987654321
└── 1.3 栈和队列
```

### 示例：带动画的幻灯片配置

```json
{
  "title": "冒泡排序算法演示",
  "subtitle": "1.1.1 算法步骤",
  "content": "冒泡排序是一种简单的排序算法...",
  "fragments": [
    "第一步：从左到右比较相邻元素",
    "第二步：若顺序错误则交换",
    "第三步：重复直到没有交换"
  ],
  "has_animation": true,
  "thought_question": "冒泡排序的时间复杂度是多少？为什么？"
}
```

### 示例：带图表的幻灯片配置

```json
{
  "title": "数据结构对比",
  "subtitle": "时间复杂度分析",
  "content": "不同数据结构在不同操作下的性能对比",
  "has_chart": true,
  "thought_question": "在什么场景下选择链表更合适？"
}
```
