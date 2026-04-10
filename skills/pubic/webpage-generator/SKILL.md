---
name: webpage-generator
description: 生成教育演示网页；当用户需要创建交互式教学页面、生成PPT式HTML演示文稿或制作学术报告网页时使用
---

# 网页生成器

## 任务目标
本 Skill 用于生成符合高校教学规范的交互式HTML演示文稿，提供教学课件、学术报告的可视化呈现。

## 输入参数配置
在生成网页前，需根据用户需求配置以下参数：
- **planType**: 理论深度要求（如"深入讲解核心理论"、"侧重应用场景分析"）
- **hasCode**: 是否包含代码演示（"添加"、"不添加"）
- **codeRequirement**: 代码实现要求（如"提供可运行的代码示例"、"展示关键算法实现"）

## 内容与结构要求
采用学术性中文表述，按"章-节-知识点"三级体系组织内容。

每张幻灯片包含：
- 核心知识点标题（可采用疑问句式）
- 关键理论/公式（突出显示）
- 动画或交互仿真展示（根据planType配置）
- 教学案例/示意图
- 思考题/延伸问题（底部固定区域）
- 作者信息区域（版权信息：MetaNote和2026年）
- 页脚声明：较小字号灰色字体，"本内容为人工智能生成，观点为转述原作者，不代表本公司立场，仅供参考和批判"

## 设计风格
参考Linear App的简约现代设计，使用清晰的视觉层次结构，配色方案专业和谐。

- 布局：充分利用负空间，使用网格、分割线、图标组织内容
- 封面设计：主标题、副标题、演讲者信息、背景图片或设计元素
- 响应式设计：自适应所有设备，使用相对单位（em、rem、vh、vw）

## 技术规范

### 核心框架
```html
<!-- RevealJS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.3.1/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.3.1/dist/theme/white.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@4.3.1/dist/reveal.js"></script>

<!-- Font Awesome -->
<link rel="stylesheet" href="https://cdn.staticfile.org/font-awesome/6.4.0/css/all.min.css">

<!-- 中文字体 -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">

<!-- Mermaid（图表） -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@latest/dist/mermaid.min.js"></script>

<!-- KaTeX（公式） -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.js"></script>
```

### 字体配置
```css
font-family: "Noto Sans SC", "Tahoma", "Arial", "Roboto", "Droid Sans", "Helvetica Neue", "Droid Sans Fallback", "Heiti SC", "Hiragino Sans GB", Simsun, sans-serif;
```

### RevealJS特性运用
- 过渡效果：选择适合内容的幻灯片过渡，避免过于花哨
- 垂直幻灯片：组织相关内容，创建层次结构
- 片段显示：逐步展示复杂内容，控制信息呈现节奏
- 背景设置：为不同部分设置不同背景，增强视觉区分
- 深色/浅色模式：实现完整切换功能，默认跟随系统设置

## 动画与可视化

### 仿真动画要求
- 使用JavaScript生成流畅动画
- 动画与内容紧密相关，有助于解释复杂概念
- 支持参数修改，提供开始/结束按钮
- 符合社会主义核心价值观和中国教育标准

### 数据可视化
- 必要时用JavaScript生成图表（柱状图、折线图、比例图）
- 数据忠实引用自原文，使用标准化图表
- 图表配色符合整体主题，包含清晰标题和数据来源

### 公式渲染
- 使用KaTeX进行公式渲染，确保正确显示
- 公式使用LaTeX语法书写，用Markdown语法标记
- 示例：`$E = mc^2$`（行内公式）或 `$$F = \frac{Gm_1m_2}{r^2}$$`（块级公式）

## 响应式设计强化
- 使用相对单位（em、rem、vh、vw）而非固定像素值
- 设置最大高度限制，确保内容不溢出
- 内容较多的幻灯片拆分为多张或使用垂直幻灯片
- 添加媒体查询，针对不同屏幕尺寸优化布局和字体大小
- 简化复杂组件（时间线、多列布局），必要时提供替代布局

## 特别注意事项

### 避免UI重复
不要创建与RevealJS自带功能重复的UI元素（进度指示器、导航按钮、页码），完全依赖RevealJS自带的导航和进度功能。

### 内容密度控制
每张幻灯片内容量适中，避免信息过载。确保标准屏幕分辨率（1366x768）下所有内容完整显示，无需滚动。内容高度控制在标准视口高度的90%以内。

### 内容层级控制
避免内容相互覆盖，特别注意页眉页脚对主体内容的影响。

## 输出要求
- 提供完整可运行的单一HTML文件，包含所有必要的CSS和JavaScript
- 确保代码符合W3C标准，无错误警告
- 页面在不同浏览器中保持一致的外观和功能
- 所有CDN链接保证中国大陆地区可访问性，不可访问则使用国内镜像源

## 质量检查清单
生成网页前必须检查：
- [ ] 内容按"章-节-知识点"三级体系组织
- [ ] 包含完整的作者信息和页脚声明
- [ ] 使用RevealJS框架并正确配置
- [ ] 包含必要的CDN资源（字体、图标、库）
- [ ] 实现深色/浅色模式切换
- [ ] 使用相对单位实现响应式设计
- [ ] 公式使用KaTeX正确渲染
- [ ] 代码示例使用语法高亮
- [ ] 所有CDN链接可访问
- [ ] 内容密度适中，无信息过载
- [ ] 页面无UI元素重复
- [ ] HTML文件完整可运行
