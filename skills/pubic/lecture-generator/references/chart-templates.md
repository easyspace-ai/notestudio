# 图表代码模板库

## 目录
- [柱状图](#柱状图)
- [折线图](#折线图)
- [饼图](#饼图)
- [散点图](#散点图)
- [雷达图](#雷达图)

## 概览
本模板库提供多种教学图表模板，基于Chart.js实现。

## 柱状图

### 适用场景
- 数据对比
- 分类数据展示
- 数量比较

### 配置参数
```json
{
  "type": "bar",
  "canvas_id": "bar-chart-1",
  "title": "不同数据结构的时间复杂度对比",
  "labels": ["数组", "链表", "哈希表", "二叉树", "红黑树"],
  "data": [1, 1, 1, 1, 2],
  "colors": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"],
  "source": "数据结构与算法课程"
}
```

### 代码示例
```json
{
  "type": "bar",
  "canvas_id": "chart-1",
  "title": "各类排序算法时间复杂度对比",
  "labels": ["冒泡排序", "选择排序", "插入排序", "快速排序", "归并排序"],
  "data": [400, 400, 400, 75, 80],
  "colors": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"],
  "source": "算法分析实验数据"
}
```

## 折线图

### 适用场景
- 趋势分析
- 时间序列数据
- 函数图像

### 配置参数
```json
{
  "type": "line",
  "canvas_id": "line-chart-1",
  "title": "不同输入规模下的算法性能",
  "labels": ["100", "500", "1000", "2000", "5000", "10000"],
  "data": [0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
  "colors": ["#5C4D7C"],
  "source": "性能测试实验"
}
```

### 多条折线配置
```json
{
  "type": "line",
  "canvas_id": "line-chart-2",
  "title": "排序算法性能对比",
  "labels": ["100", "500", "1000", "2000", "5000", "10000"],
  "data": [
    [0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
    [0.05, 0.2, 0.5, 1.0, 2.5, 5.0],
    [0.02, 0.1, 0.3, 0.6, 1.5, 3.0]
  ],
  "colors": ["#FF6384", "#36A2EB", "#4BC0C0"],
  "source": "算法性能测试",
  "legend": ["冒泡排序", "快速排序", "归并排序"]
}
```

## 饼图

### 适用场景
- 比例展示
- 占比分析
- 分布情况

### 配置参数
```json
{
  "type": "pie",
  "canvas_id": "pie-chart-1",
  "title": "数据结构在课程中的应用比例",
  "labels": ["数组", "链表", "树", "图", "其他"],
  "data": [25, 20, 30, 15, 10],
  "colors": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"],
  "source": "课程统计"
}
```

## 散点图

### 适用场景
- 相关性分析
- 分布特征
- 回归分析

### 配置参数
```json
{
  "type": "scatter",
  "canvas_id": "scatter-chart-1",
  "title": "变量相关性分析",
  "labels": ["数据点1", "数据点2", "数据点3"],
  "data": [
    [10, 15],
    [20, 25],
    [30, 28],
    [40, 45],
    [50, 50]
  ],
  "colors": ["#5C4D7C"],
  "source": "实验数据"
}
```

## 雷达图

### 适用场景
- 多维度对比
- 综合评估
- 能力评估

### 配置参数
```json
{
  "type": "radar",
  "canvas_id": "radar-chart-1",
  "title": "不同数据结构性能评估",
  "labels": ["查找效率", "插入效率", "删除效率", "空间效率", "排序效率"],
  "data": [
    [90, 70, 70, 80, 60],
    [85, 90, 85, 70, 75],
    [95, 75, 75, 90, 80]
  ],
  "colors": ["#FF6384", "#36AEB", "#4BC0C0"],
  "source": "算法评估",
  "legend": ["数组", "链表", "哈希表"]
}
```

## Chart.js配置详解

### 基本配置结构
```json
{
  "type": "图表类型",
  "data": {
    "labels": ["标签1", "标签2", "标签3"],
    "datasets": [{
      "label": "数据集名称",
      "data": [10, 20, 30],
      "backgroundColor": ["#颜色1", "#颜色2", "#颜色3"],
      "borderColor": ["#边框颜色1", "#边框颜色2", "#边框颜色3"],
      "borderWidth": 2
    }]
  },
  "options": {
    "responsive": true,
    "maintainAspectRatio": true,
    "plugins": {
      "legend": {
        "display": true,
        "position": "bottom"
      }
    },
    "scales": {
      "y": {
        "beginAtZero": true
      }
    }
  }
}
```

### 响应式配置
```json
{
  "options": {
    "responsive": true,
    "maintainAspectRatio": false,
    "aspectRatio": 1.5
  }
}
```

### 图例配置
```json
{
  "options": {
    "plugins": {
      "legend": {
        "display": true,
        "position": "bottom",
        "labels": {
          "font": {
            "size": 14,
            "family": "Noto Sans SC"
          },
          "usePointStyle": true
        }
      }
    }
  }
}
```

### 轴配置
```json
{
  "options": {
    "scales": {
      "x": {
        "title": {
          "display": true,
          "text": "X轴标题",
          "font": {
            "size": 14,
            "family": "Noto Sans SC"
          }
        },
        "ticks": {
          "font": {
            "family": "Noto Sans SC"
          }
        }
      },
      "y": {
        "beginAtZero": true,
        "title": {
          "display": true,
          "text": "Y轴标题",
          "font": {
            "size": 14,
            "family": "Noto Sans SC"
          }
        },
        "ticks": {
          "font": {
            "family": "Noto Sans SC"
          }
        }
      }
    }
  }
}
```

### 交互配置
```json
{
  "options": {
    "interaction": {
      "mode": "index",
      "intersect": false
    },
    "plugins": {
      "tooltip": {
        "enabled": true,
        "backgroundColor": "rgba(0, 0, 0, 0.8)",
        "titleFont": {
          "size": 14,
         family: "Noto Sans SC"
        },
        "bodyFont": {
          size: 12,
          family: "Noto Sans SC"
        }
      }
    }
  }
}
```

## 颜色配置

### 推荐配色方案
```javascript
// 学术风格配色
const academicColors = [
  '#5C4D7C', // 主色
  '#9C7C98', // 辅助色
  '#F4D6BC', // 强调色
  '#FF6B6B', // 红色
  '#4ECDC4', // 青色
  '#45B7D1', // 蓝色
  '#96E6A1', // 绿色
  '#DDA0DD'  // 紫色
];

// 数据对比配色
const contrastColors = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#36AEB'
];
```

## 使用说明

### 在幻灯片中添加图表
1. 在 `html-generator.py` 的 content_slides 中设置 `has_chart: true`
2. 在 `chart_config` 中配置图表参数
3. 指定 `type`、`canvas_id`、`title`、`labels`、`data`、`colors`、`source`
4. Chart.js 自动渲染图表

### 多数据集配置
对于折线图、散点图、雷达图等支持多数据集的图表，`data` 和 `colors` 可以使用数组：

```json
{
  "type": "line",
  "canvas_id": "line-1",
  "title": "性能对比",
  "labels": ["100", "200", "300", "400", "500"],
  "data": [
    [10, 15, 20, 25, 30],
    [8, 12, 18, 22, 28],
    [5, 10, 15, 20, 25]
  ],
  "colors": ["#FF6384", "#36A2EB", "#4BC0C0"],
  "legend": ["算法A", "算法B", "算法C"],
  "source": "实验数据"
}
```

## 注意事项

1. **数据来源**：必须明确标注数据来源
2. **图表标题**：每个图表必须有清晰的标题
3. **数据准确性**：确保数据准确，不要使用原文不包含的数据
4. **颜色选择**：选择符合主题的配色方案
5. **响应式设计**：图表会自动适应屏幕大小
6. **性能考虑**：数据量过大时考虑使用其他可视化方式
