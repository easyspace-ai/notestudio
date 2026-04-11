#!/usr/bin/env python3
"""
HTML Lecture Generator
生成符合高校教学规范的RevealJS演示文稿
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime

try:
    from jinja2 import Template
    import markdown
except ImportError:
    print("正在安装依赖...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "jinja2", "markdown", "-q"])
    from jinja2 import Template
    import markdown

# HTML模板
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }}</title>

    <!-- RevealJS CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.3.1/dist/reveal.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.3.1/dist/theme/white.css">

    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdn.staticfile.org/font-awesome/6.4.0/css/all.min.css">

    <!-- KaTeX CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">

    <!-- Mermaid -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@latest/dist/mermaid.min.js"></script>

    <!-- 字体 -->
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">

    <style>
        :root {
            --primary-color: #5C4D7C;
            --secondary-color: #9C7C98;
            --accent-color: #F4D6BC;
            --text-color: #2D2D2D;
            --light-bg: #FAFAFA;
            --dark-bg: #1A1A2E;
        }

        html, body {
            margin: 0;
            padding: 0;
            font-family: "Noto Sans SC", "Tahoma", "Arial", "Roboto", sans-serif;
        }

        .reveal {
            font-family: "Noto Sans SC", "Tahoma", "Arial", "Roboto", sans-serif;
        }

        .reveal .slides section {
            text-align: left;
            height: 100%;
            max-height: 85vh;
            overflow: hidden;
        }

        .reveal h1, .reveal h2, .reveal h3, .reveal h4 {
            font-family: "Noto Serif SC", "Noto Sans SC", sans-serif;
            font-weight: 600;
            color: var(--primary-color);
            text-align: center;
        }

        .reveal h1 {
            font-size: 2.5em;
            margin-bottom: 0.5em;
        }

        .reveal h2 {
            font-size: 2em;
            margin-bottom: 0.4em;
        }

        .reveal h3 {
            font-size: 1.5em;
            margin-bottom: 0.3em;
        }

        .reveal h1.subtitle {
            font-size: 1.5em;
            color: var(--secondary-color);
            font-weight: 400;
        }

        .reveal .author {
            font-size: 1.1em;
            color: #666;
            margin-top: 1em;
            text-align: center;
        }

        .reveal p {
            line-height: 1.6;
            margin: 10px 0;
            font-size: 0.9em;
        }

        .reveal .slide-content {
            padding: 20px;
            max-height: calc(85vh - 150px);
            overflow-y: auto;
            margin: 0 10%;
        }

        /* 片段样式 */
        .reveal .fragment {
            margin: 10px 0;
            padding: 5px 0;
            border-left: 3px solid var(--secondary-color);
            padding-left: 15px;
        }

        /* 思考题样式 */
        .reveal .thought-question {
            position: absolute;
            bottom: 60px;
            left: 0;
            right: 0;
            background: rgba(92, 77, 124, 0.1);
            padding: 10px 20px;
            border-left: 4px solid var(--primary-color);
            font-size: 0.85em;
            margin: 0 10%;
            border-radius: 5px;
        }

        /* 页脚 */
        .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            text-align: center;
            padding: 8px 0;
            font-size: 0.7em;
            color: #999;
            background: rgba(255, 255, 255, 0.95);
            border-top: 1px solid #eee;
            z-index: 100;
        }

        .footer .copyright {
            margin-right: 20px;
        }

        /* 动画容器 */
        .animation-container {
            position: relative;
            margin: 20px auto;
            border: 2px solid #ddd;
            border-radius: 8px;
            background: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px;
        }

        .animation-canvas {
            border: 1px solid #ccc;
            border-radius: 4px;
        }

        .animation-controls {
            margin-top: 15px;
            display: flex;
            gap: 10px;
        }

        .animation-controls button {
            padding: 8px 20px;
            font-size: 0.9em;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.3s;
        }

        .animation-controls button:hover {
            background: var(--secondary-color);
        }

        .animation-controls button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .animation-params {
            margin-top: 10px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            justify-content: center;
        }

        .animation-param {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .animation-param input {
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 3px;
            width: 60px;
        }

        /* 图表容器 */
        .chart-container {
            position: relative;
            margin: 20px auto;
            padding: 20px;
            border: 2px solid #ddd;
            border-radius: 8px;
            background: white;
        }

        .chart-canvas {
            max-width: 100%;
        }

        .chart-title {
            text-align: center;
            font-size: 1em;
            color: #666;
            margin-bottom: 10px;
        }

        .chart-source {
            text-align: right;
            font-size: 0.8em;
            color: #999;
            margin-top: 5px;
        }

        /* Mermaid图表 */
        .mermaid {
            margin: 20px auto;
            text-align: center;
        }

        /* KaTeX公式 */
        .katex-display {
            margin: 15px 0;
            overflow-x: auto;
            overflow-y: hidden;
        }

        /* 深色模式 */
        html[data-theme="dark"] .reveal {
            background: var(--dark-bg);
        }

        html[data-theme="dark"] .reveal h1,
        html[data-theme="dark"] .reveal h2,
        html[data-theme="dark"] .reveal h3 {
            color: var(--accent-color);
        }

        html[data="dark"] .reveal h1.subtitle {
            color: #C4A882;
        }

        html[data-theme="dark"] .reveal .author {
            color: #ccc;
        }

        html[data-theme="dark"] .reveal p,
        html[data-theme="dark"] .reveal .fragment {
            color: #ddd;
        }

        html[data-theme="dark"] .reveal .slide-content {
            color: #ddd;
        }

        html[data-theme="dark"] .footer {
            background: rgba(26, 26, 46, 0.95);
            color: #666;
            border-top: 1px solid #333;
        }

        html[data-theme="dark"] .reveal .thought-question {
            background: rgba(244, 214, 188, 0.15);
            border-left-color: var(--accent-color);
            color: #ddd;
        }

        html[data="dark"] .animation-container,
        html[data="dark"] .chart-container {
            background: #2D2D2D;
            border-color: #444;
        }

        html[data="dark"] .animation-canvas {
            background: white;
        }

        html[data="dark"] .chart-canvas {
            background: #3D3D3D;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .reveal .slides section {
                padding: 5px;
            }

            .reveal h1 {
                font-size: 2em;
            }

            .reveal h2 {
                font-size: 1.5em;
            }

            .reveal h3 {
                font-size: 1.2em;
            }

            .reveal .slide-content {
                padding: 10px;
                margin: 0;
            }

            .reveal .thought-question {
                padding: 5px 10px;
                font-size: 0.75em;
                margin: 0 5%;
            }

            .animation-container,
            .chart-container {
                padding: 10px;
            }

            .animation-controls {
                flex-wrap: wrap;
                gap: 5px;
            }

            .footer {
                font-size: 0.6em;
                padding: 5px 0;
            }
        }

        @media (max-width: 480px) {
            .reveal h1 {
                font-size: 1.5em;
            }

            .reveal h2 {
                font-size: 1.2em;
            }

            .reveal .slide-content {
                font-size: 0.8em;
            }

            .animation-controls button {
                padding: 5px 10px;
                font-size: 0.8em;
            }

            .reveal .thought-question {
                position: static;
                margin: 10px 0;
            }
        }
    </style>
</head>
<body>
    <div class="reveal">
        <div class="slides">

            <!-- 封面幻灯片 -->
            <section>
                <h1>{{ title }}</h1>
                {% if subtitle %}
                <h1 class="subtitle">{{ subtitle }}</h1>
                {% endif %}
                <p class="author">{{ author }}</p>
                <p style="text-align: center; margin-top: 2em; color: #666; font-size: 0.8em;">
                    <i class="fas fa-graduation-cap"></i> IECUBE Tutorial
                </p>
            </section>

            <!-- 内容幻灯片 -->
            {% for slide in content_slides %}
            <section>
                <h2>{{ slide.title }}</h2>
                {% if slide.subtitle %}
                <h3>{{ slide.subtitle }}</h3>
                {% endif %}
                <div class="slide-content">
                    <!-- 正文内容 -->
                    {% if slide.content %}
                    <p>{{ slide.content }}</p>
                    {% endif %}

                    <!-- 分步显示的片段 -->
                    {% if slide.fragments %}
                    {% for fragment in slide.fragments %}
                    <p class="fragment">
                        {{ fragment }}
                    </p>
                    {% endfor %}
                    {% endif %}

                    <!-- 公式 -->
                    {% if slide.formulas %}
                    {% for formula in slide.formulas %}
                    <div class="formula-block">
                        {{ formula }}
                    </div>
                    {% endfor %}
                    {% endif %}

                    <!-- 动画 -->
                    {% if slide.has_animation and slide.animation_config %}
                    <div class="animation-container">
                        <canvas id="{{ slide.animation_config.canvas_id }}" class="animation-canvas" width="600" height="400"></canvas>
                        <div class="animation-controls">
                            <button onclick="{{ slide.animation_config.canvas_id }}_start()">开始</button>
                            <button onclick="{{ slide.animation_config.canvas_id }}_pause()">暂停</button>
                            <button onclick="{{ slide.animation_config.canvas_id }}_reset()">重置</button>
                        </div>
                        <div class="animation-params" id="{{ slide.animation_config.canvas_id }}_params">
                        </div>
                    </div>
                    {% endif %}

                    <!-- 图表 -->
                    {% if slide.has_chart and slide.chart_config %}
                    <div class="chart-container">
                        <canvas id="{{ slide.chart_config.canvas_id }}" class="chart-canvas" width="600" height="400"></canvas>
                        <p class="chart-title">{{ slide.chart_config.title }}</p>
                        <p class="chart-source">数据来源：{{ slide.chart_config.source }}</p>
                    </div>
                    {% endif %}

                    <!-- Mermaid图表 -->
                    {% if slide.has_mermaid and slide.mermaid_code %}
                    <div class="mermaid">
                        {{ slide.mermaid_code }}
                    </div>
                    {% endif %}
                </div>

                <!-- 思考题 -->
                {% if slide.thought_question %}
                <div class="thought-question">
                    <i class="fas fa-question-circle" style="margin-right: 5px;"></i>
                    思考：{{ slide.thought_question }}
                </div>
                {% endif %}
            </section>
            {% endfor %}

        </div>
    </div>

    <!-- 页脚 -->
    <div class="footer">
        <span class="copyright">IECUBE Tutorial © 2025</span>
        <span>本内容为人工智能生成，观点为转述原作者，不代表本公司立场，仅供参考和批判</span>
    </div>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.3.1/dist/reveal.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

    <script>
        // 主题检测和设置
        function setTheme() {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        }

        // 监听系统主题变化
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setTheme);
        }

        // 初始化主题
        setTheme();

        // KaTeX公式渲染
        document.addEventListener("DOMContentLoaded", function() {
            renderMathInElement(document.body, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError: false
            });
        });

        // Mermaid初始化
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            themeVariables: {
                fontFamily: 'Noto Sans SC',
                fontSize: '16px'
            }
        });

        // 图表配置
        const charts = {
            {% for slide in content_slides %}
            {% if slide.has_chart and slide.chart_config %}
            "{{ slide.chart_config.canvas_id }}": {
                type: "{{ slide.chart_config.type }}",
                data: {
                    labels: {{ slide.chart_config.labels | tojson }},
                    datasets: [{
                        label: "{{ slide.chart_config.title }}",
                        data: {{ slide.chart_config.data | tojson }},
                        backgroundColor: {{ slide.chart_config.colors | tojson }},
                        borderColor: {{ slide.chart_config.colors | tojson }},
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: {{ slide.chart_config.type == 'pie' }},
                            position: 'bottom'
                        }
                    },
                    scales: {
                        {% if slide.chart_config.type != 'pie' and slide.chart_config.type != 'scatter' %}
                        y: {
                            beginAtZero: true
                        }
                        {% endif %}
                    }
                }
            }{% if not loop.last %},{% endif %}
            {% endif %}
            {% endfor %}
        };

        // 初始化图表
        document.addEventListener("DOMContentLoaded", function() {
            for (const [canvasId, config] of Object.entries(charts)) {
                const ctx = document.getElementById(canvasId);
                if (ctx) {
                    new Chart(ctx, config);
                }
            }
        });

        // 动画代码
        {% for slide in content_slides %}
        {% if slide.has_animation and slide.animation_config %}
        let {{ slide.animation_config.canvas_id }}_animationId = null;
        let {{ slide.animation_config.canvas_id }}_isPaused = false;
        let {{ slide.animation_config.canvas_id }}_animationFrame = 0;

        {{ slide.animation_config.script | safe }}

        // 动画控制函数
        function {{ slide.animation_config.canvas_id }}_start() {
            {{ slide.animation_config.canvas_id }}_isPaused = false;
            {{ slide.animation_config.canvas_id }}_animate();
        }

        function {{ slide.animation_config.canvas_id }}_pause() {
            {{ slide.animation_config.canvas_id }}_isPaused = true;
        }

        function {{ slide.animation_config.canvas_id }}_reset() {
            {{ slide.animation_config.canvas }}_isPaused = true;
            {{ slide.animation_config.canvas_id }}_animationFrame = 0;
            // 重置画面
            const canvas = document.getElementById('{{ slide.animation_config.canvas_id }}');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 初始化动画
            {{ slide.animation_config.canvas_id }}_init();
            // 绘制初始状态
            {{ slide.animation_config.canvas_id }}_draw(0);
        }

        {% endif %}
        {% endfor %}

        // 初始化动画
        document.addEventListener("DOMContentLoaded", function() {
            {% for slide in content_slides %}
            {% if slide.has_animation and slide.animation_config %}
            const {{ slide.animation_config.canvas_id }}_canvas = document.getElementById('{{ slide.animation_config.canvas_id }}');
            const {{ slide.animation_config.canvas }}_ctx = {{ slide.animation_config.canvas }}_canvas.getContext('2d');
            {{ slide.animation_config.canvas }}_init();
            {{ slide.animation_config.canvas }}_draw(0);

            // 添加参数输入框
            const paramsDiv = document.getElementById('{{ slide.animation_config.canvas_id }}_params');
            const params = {{ slide.animation_config.params | tojson }};
            for (const [key, value] of Object.entries(params)) {
                const paramDiv = document.createElement('div');
                paramDiv.className = 'animation-param';
                paramDiv.innerHTML = `
                    <label>${key}:</label>
                    <input type="${typeof value === 'number' ? 'number' : 'text'}"
                           value="${value}"
                           onchange="{{ slide.animation_config.canvas }}_updateParam('${key}', this.value)">
                `;
                paramsDiv.appendChild(paramDiv);
            }

            {% endif %}
            {% endfor %}
        });

        // RevealJS初始化
        Reveal.initialize({
            controls: true,
            controlsTutorial: false,
            progress: true,
            slideNumber: false,
            center: true,
            hash: true,
            transition: 'slide',
            transitionSpeed: 'default',
            backgroundTransition: 'fade',
            mouseWheel: false,
            keyboard: true,
            overview: true,
            touch: true,
            loop: false,
            rtl: false,
            shuffle: false,
            fragments: true,
            fragmentInURL: false,
            embedded: false,
            help: false,
            pause: false,
            previewLinks: false,
            autoSlide: 0,
            autoSlideMethod: 'default',
            autoSlideStoppable: true,
            defaultTiming: 120,
            hideInactiveCursor: true,
            hideCursorTime: 5000,
            animations: {
                // 自定义动画配置
                {% for slide in content_slides %}
                "{{ slide.animation_config.canvas_id }}": {
                    enable: {% if slide.has_animation %}true{% else %}false{% endif %}
                }{% if not loop.last %},{% endif %}
                {% endfor %}
            },
            chart: {
                // 图表配置
            }
        });
    </script>
</body>
</html>
"""


def parse_args():
    parser = argparse.ArgumentParser(description='生成符合高校教学规范的HTML演示文稿')
    parser.add_argument('--title', required=True, help='主标题')
    parser.add_argument('--subtitle', help='副标题')
    parser.add_argument('--author', required=True, help='演讲者信息')
    parser.add_argument('--content', required=True, help='幻灯片内容（JSON格式）')
    parser.add_argument('--output', required=True, help='输出文件路径')
    return parser.parse_args()


def main():
    args = parse_args()

    # 解析幻灯片内容
    content_slides = json.loads(args.content)

    # 处理内容（Markdown转HTML）
    for slide in content_slides:
        if 'content' in slide and slide['content']:
            slide['content'] = markdown.markdown(slide['content'])

    # 生成HTML
    template = Template(HTML_TEMPLATE)
    html_output = template.render(
        title=args.title,
        subtitle=args.subtitle or '',
        author=args.author,
        content_slides=content_slides
    )

    # 写入文件
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_output, encoding='utf-8')

    print(f"演示文稿已生成：{output_path}")
    print(f"包含 {len(content_slides)} 张幻灯片")


if __name__ == '__main__':
    main()
