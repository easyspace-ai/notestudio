# RevealJS配置指南

## 目录
- [基本配置](#基本配置)
- [过渡效果](#过渡效果)
- [垂直幻灯片](#垂直幻灯片)
- [片段显示](#片段显示)
- [背景设置](#背景设置)
- [键盘快捷键](#键盘快捷键)
- [响应式设计](#响应式设计)

## 概览
RevealJS是一个强大的HTML演示框架，本文档说明其核心配置方法和最佳实践。

## 基本配置

### 初始化配置
```javascript
Reveal.initialize({
    // 控制和进度
    controls: true,           // 显示右下角控制按钮
    controlsTutorial: false,  // 关闭教程提示
    progress: true,          // 显示进度条
    slideNumber: false,      // 不显示幻灯片编号
    center: true,            // 内容垂直居中

    // 导航
    hash: true,              // URL哈希（支持书签）
    transition: 'slide',     // 过渡效果
    transitionSpeed: 'default', // 速度
    mouseWheel: false,       // 禁用鼠标滚轮翻页
    keyboard: true,          // 启用键盘导航
    touch: true,             // 启用触控

    // 片段
    fragments: true,         // 启用片段功能

    // 幻灯片行为
    loop: false,             // 不循环播放
    embedded: false,         // 独立模式
    autoplay: false          // 不自动播放
});
```

## 过渡效果

### 可用效果
- `slide`：滑动（默认）
- `fade`：淡入淡出
- `convex`：凸起效果
- `concave`：凹陷效果
- `zoom`：缩放
- `none`：无过渡

### 为特定幻灯片设置过渡
```html
<section data-transition="fade">幻灯片内容</section>
```

### 不同方向的过渡
```html
<section data-transition="slide-in fade-out">内容</section>
```

## 垂直幻灯片

### 基本结构
```html
<section>
    <h1>第一章</h1>
    <!-- 按下进入下方的垂直幻灯片 -->
    <section>
        <h2>1.1 节标题</h2>
    </section>
    <section>
        <h2>1.2 节标题</h2>
    </section>
</section>
```

### 使用场景
- 演示章-节-知识点三级结构
- 逻辑上从属的内容
- 需要快速切换的相关幻灯片

## 片段显示

### 逐步显示列表项
```html
<ul>
    <li class="fragment">第一点</li>
    <li class="fragment">第二点</li>
    <li class="fragment">第三点</li>
</ul>
```

### 片段样式类
```html
<div class="fragment fade-in">淡入</div>
<div class="fragment fade-up">从下淡入</div>
<div class="fragment fade-down">从上淡入</div>
<div class="fragment fade-left">从右淡入</div>
<div class="fragment fade-right">从左淡入</div>
<div class="fragment highlight-red">红色高亮</div>
<div class="fragment highlight-blue">蓝色高亮</div>
<div class="fragment strike-through">删除线</div>
```

### 片段组
```html
<div class="fragment-group">
    <p>同时出现的元素1</p>
    <p>同时出现的元素2</p>
</div>
```

## 背景设置

### 颜色背景
```html
<section data-background-color="#ff0000">红色背景</section>
```

### 图片背景
```html
<section data-background-image="image.jpg">图片背景</section>
```

### 背景渐变
```html
<section data-background-gradient="linear-gradient(to right, #1e3c72, #2a5298)">
    渐变背景
</section>
```

### 背景透明度
```html
<section data-background-opacity="0.3">半透明背景</section>
```

### 背景视频
```html
<section data-background-video="video.mp4" data-background-video-loop>
    视频背景
</section>
```

### 不同章节使用不同背景
```html
<!-- 第一部分：蓝色主题 -->
<section data-background-color="#e0f7fa">
    <h1>第一章</h1>
</section>

<!-- 第二部分：橙色主题 -->
<section data-background-color="#fff3e0">
    <h1>第二章</h1>
</section>
```

## 键盘快捷键

### 导航快捷键
- `空格` / `Enter`：下一张
- `↑` / `↓`：垂直导航
- `←` / `→`：水平导航
- `Shift` + `↑` / `↓`：垂直幻灯片的主视图
- `Home`：第一张
- `End`：最后一张

### 演示控制
- `F`：全屏
- `O`：概览
- `S`：演讲者模式
- `B` / `.`：暂停/黑屏
- `ESC`：退出全屏/概览

### 互动功能
- `Ctrl + Shift + F`：全屏
- `Alt + 点击`：聚焦元素
- `?`：快捷键帮助

## 响应式设计

### 媒体查询示例
```css
/* 平板 */
@media (max-width: 768px) {
    .reveal .slides section {
        font-size: 0.8em;
    }
}

/* 手机 */
@media (max-width: 480px) {
    .reveal h1 {
        font-size: 1.5em;
    }
}
```

### 字体自适应
使用相对单位（em、rem、vh、vw）代替固定像素。

## 高级配置

### 演讲者模式
```javascript
Reveal.configure({
    speakerNotes: true
});
```

### 自定义事件监听
```javascript
Reveal.on('slidechanged', event => {
    console.log('切换到幻灯片:', event.currentSlide);
});

Reveal.on('fragmentshown', event => {
    console.log('片段显示:', event.fragment);
});
```

### 动态控制
```javascript
// 下一张
Reveal.next();

// 上一张
Reveal.prev();

// 跳转到指定幻灯片
Reveal.slide(1, 0);

// 切换概览
Reveal.toggleOverview();
```

## 注意事项

1. **避免过度使用动画**：过花哨的过渡效果会分散注意力
2. **保持一致性**：同级别幻灯片使用相同的过渡效果
3. **测试响应式**：在不同设备上测试显示效果
4. **避免重叠**：确保内容不会相互覆盖
5. **内容控制**：单张幻灯片不要包含过多内容

## 示例代码

完整的HTML模板可以参考 `scripts/html-generator.py` 中的 `HTML_TEMPLATE` 变量。
