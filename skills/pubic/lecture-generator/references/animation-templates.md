# 动画代码模板库

## 目录
- [冒泡排序动画](#冒泡排序动画)
- [粒子运动模拟](#粒子运动模拟)
- [数据流可视化](#数据流可视化)
- [递归树生长](#递归树生长)
- [波传播模拟](#波传播模拟)

## 概览
本模板库提供多种教学动画模板，可直接嵌入HTML演示文稿中。

## 冒泡排序动画

### 适用场景
- 算法课程
- 数据结构课程
- 算法性能分析

### 配置参数
```json
{
  "type": "simulation",
  "canvas_id": "bubble-sort-canvas",
  "params": {
    "speed": 50,
    "arraySize": 8
  }
}
```

### 代码模板
```javascript
const bubbleSortCanvas_id = 'bubble-sort-canvas';
const bubbleSortArr = [];
let bubbleSortComparing = -1;
let bubbleSortSwapping = -1;

function bubbleSort_init() {
    const size = {{ slide.animation_config.params.arraySize }};
    for (let i = 0; i < size; i++) {
        bubbleSortArr.push(Math.floor(Math.random() * 90) + 10);
    }
    bubbleSort_draw();
}

function bubbleSort_draw() {
    const canvas = document.getElementById(bubbleSortCanvas_id);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width - 40) / bubbleSortArr.length;
    const maxHeight = canvas.height - 60;

    for (let i = 0; i < bubbleSortArr.length; i++) {
        const height = (bubbleSortArr[i] / 100) * maxHeight;
        const x = 20 + i * barWidth;
        const y = canvas.height - height - 20;

        // 设置颜色
        if (i === bubbleSortComparing || i === bubbleSortSwapping) {
            ctx.fillStyle = '#FF6B6B';
        } else if (bubbleSortSwapping !== -1 && i === bubbleSortSwapping + 1) {
            ctx.fillStyle = '#4ECDC4';
        } else {
            ctx.fillStyle = '#45B7D1';
        }

        ctx.fillRect(x, y, barWidth - 4, height);
        ctx.fillStyle = '#333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(bubbleSortArr[i], x + (barWidth - 4) / 2, canvas.height - 5);
    }
}

let bubbleSortI = 0;
let bubbleSortJ = 0;
let bubbleSortSorted = false;

function bubbleSort_animate() {
    if (bubbleSort_isPaused) return;

    if (!bubbleSortSorted) {
        bubbleSortComparing = bubbleSortJ;
        bubbleSortSwapping = -1;

        // 比较并交换
        if (bubbleSortArr[bubbleSortJ] > bubbleSortArr[bubbleSortJ + 1]) {
            bubbleSortSwapping = bubbleSortJ;
            [bubbleSortArr[bubbleSortJ], bubbleSortArr[bubbleSortJ + 1]] =
                [bubbleSortArr[bubbleSortJ + 1], bubbleSortArr[bubbleSortJ]];
        }

        bubbleSortJ++;
        if (bubbleSortJ >= bubbleSortArr.length - 1 - bubbleSortI) {
            bubbleSortJ = 0;
            bubbleSortI++;
        }
        if (bubbleSortI >= bubbleSortArr.length - 1) {
            bubbleSortSorted = true;
        }

        bubbleSort_draw();
    }

    setTimeout(() => requestAnimationFrame(bubbleSort_animate), {{ slide.animation_config.params.speed }});
}

function bubbleSort_updateParam(key, value) {
    if (key === 'arraySize') {
        bubbleSortArr.length = 0;
        bubbleSortI = 0;
        bubbleSortJ = 0;
        bubbleSortSorted = false;
        for (let i = 0; i < parseInt(value); i++) {
            bubbleSortArr.push(Math.floor(Math.random() * 90) + 10);
        }
        bubbleSort_draw();
    }
}
```

## 粒子运动模拟

### 适用场景
- 物理课程
- 粒子运动
- 碰撞实验

### 配置参数
```json
{
  "type": "simulation",
  "canvas_id": "particle-canvas",
  "params": {
    "particleCount": 50,
    "speed": 2
  }
}
```

### 代码模板
```javascript
const particleCanvas_id = 'particle-canvas';
let particles = [];

function particle_init() {
    particles = [];
    for (let i = 0; i < {{ slide.animation_config.params.particleCount }}; i++) {
        particles.push({
            x: Math.random() * 560 + 20,
            y: Math.random() * 360 + 20,
            vx: (Math.random() - 0.5) * {{ slide.animation_config.params.speed }},
            vy: (Math.random() - 0.5) * {{ slide.animation_config.params.speed }},
            radius: Math.random() * 5 + 3
        });
    }
}

function particle_draw() {
    const canvas = document.getElementById(particleCanvas_id);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制粒子
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(92, 77, 124, 0.8)`;
        ctx.fill();
        ctx.strokeStyle = '#9C7C98';
        ctx.stroke();
    });

    // 绘制连线（距离小于100的粒子）
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 100) {
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.strokeStyle = `rgba(92, 77, 124, ${(100 - dist) / 100})`;
                ctx.stroke();
            }
        }
    }
}

function particle_animate() {
    if (particle_isPaused) return;

    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        // 边界碰撞
        if (p.x < p.radius || p.x > 600 - p.radius) p.vx *= -1;
        if (p.y < p.radius || p.y > 400 - p.radius) p.vy *= -1;
    });

    particle_draw();
    requestAnimationFrame(particle_animate);
}
```

## 数据流可视化

### 适用场景
- 网络数据传输
- 信息流动
- 系统交互

### 代码模板
```javascript
const dataFlowCanvas_id = 'dataflow-canvas';
let dataPackets = [];
let dataFlowNodes = [];

function dataflow_init() {
    // 定义节点
    dataFlowNodes = [
        { x: 50, y: 200, label: '源节点' },
        { x: 550, y: 200, label: '目标节点' }
    ];

    // 初始化数据包
    for (let i = 0; i < 5; i++) {
        dataPackets.push({
            x: 50,
            y: 200,
            progress: 0
        });
    }
}

function dataflow_draw() {
    const canvas = document.getElementById(dataFlowCanvas_id);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制连接线
    ctx.beginPath();
    ctx.moveTo(dataFlowNodes[0].x, dataFlowNodes[0].y);
    ctx.lineTo(dataFlowNodes[1].x, dataFlowNodes[1].y);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 绘制节点
    dataFlowNodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#5C4D7C';
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '14px Noto Sans SC';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y);
    });

    // 绘制数据包
    dataPackets.forEach(packet => {
        const x = 50 + (550 - 50) * packet.progress;
        ctx.beginPath();
        ctx.arc(x, 200, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#F4D6BC';
        ctx.fill();
    });
}

function dataflow_animate() {
    if (dataflow_isPaused) return;

    dataPackets.forEach(packet => {
        packet.progress += 0.01;
        if (packet.progress > 1) packet.progress = 0;
    });

    dataflow_draw();
    requestAnimationFrame(dataflow_animate);
}
```

## 递归树生长

### 适用场景
- 递归算法
- 分形几何
- 算法可视化

### 代码模板
```javascript
const treeCanvas_id = 'tree-canvas';
let treeAngle = 30;
let treeDepth = 10;

function tree_draw(ctx, x, y, length, angle, depth) {
    if (depth === 0) return;

    const endX = x + length * Math.cos(angle * Math.PI / 180);
    const endY = y - length * Math.sin(angle * Math.PI / 180);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `hsl(${120 - depth * 10}, 60%, ${30 + depth * 5}%)`;
    ctx.lineWidth = depth;
    ctx.stroke();

    tree_draw(ctx, endX, endY, length * 0.7, angle + treeAngle, depth - 1);
    tree_draw(ctx, endX, endY, length * 0.7, angle - treeAngle, depth - 1);
}

function tree_draw() {
    const canvas = document.getElementById(treeCanvas_id);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    tree_draw(ctx, 300, 380, 80, 90, treeDepth);
}

function tree_updateParam(key, value) {
    if (key === 'angle') treeAngle = parseFloat(value);
    if (key === 'depth') treeDepth = parseInt(value);
    tree_draw();
}
```

## 波传播模拟

### 适用场景
- 波动方程
- 波的特性
- 波的干涉

### 代码模板
```javascript
const waveCanvas_id = 'wave-canvas';
let waveTime = 0;
let waveFreq = 2;
let waveAmp = 50;
let waveSpeed = 0.05;

function wave_draw() {
    const canvas = document.getElementById(waveCanvas_id);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制波形
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
        const y = 200 + waveAmp * Math.sin(waveFreq * (x * 0.01) - waveTime);
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.strokeStyle = '#5C4D7C';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 绘制传播方向箭头
    ctx.beginPath();
    ctx.moveTo(50, 350);
    ctx.lineTo(100, 350);
    ctx.lineTo(90, 340);
    ctx.moveTo(100, 350);
    ctx.lineTo(90, 360);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.fillText('传播方向', 50, 370);
}

function wave_animate() {
    if (wave_isPaused) return;

    waveTime += waveSpeed;
    wave_draw();
    requestAnimationFrame(wave_animate);
}
```

## 使用说明

### 在幻灯片中添加动画
1. 在 `html-generator.py` 的 content_slides 中设置 `has_animation: true`
2. 在 `animation_config` 中指定 `canvas_id`、`type` 和 `script`
3. 将模板代码复制到 `script` 字段
4. 根据需要修改参数

### 参数修改
- 参数通过 `params` 对象定义
- 支持数值和字符串类型
- 可以在幻灯片中动态调整

### 动画控制
- 生成 `start()`、`pause()`、`reset()` 三个函数
- 参数输入框在动画下方显示
- 支持实时更新

## 注意事项

1. **性能优化**：控制动画频率，避免过快
2. **响应式**：确保画布大小适应屏幕
3. **交互友好**：提供清晰的控制按钮
4. **教育意义**：动画要有明确的教学目的
5. **参数说明**：在幻灯片中说明参数的含义
