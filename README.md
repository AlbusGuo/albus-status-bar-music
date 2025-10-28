# 🎵 Albus Status Bar Music

> 为 Obsidian 打造的优雅音乐播放器，在状态栏享受音乐之美

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/obsidian-v1.0+-purple.svg)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/typescript-4.9+-blue.svg)](https://www.typescriptlang.org/)

## ✨ 特性

### 🎨 **精美黑胶唱片界面**
- **逼真黑胶唱片**：精心设计的旋转动画，模拟真实唱片机体验
- **光泽效果**：多层渐变和高光，呈现专业级视觉效果
- **流畅动画**：CSS3 驱动的不间断旋转，暂停时保持当前位置
- **交互设计**：点击唱片即可播放/暂停，简洁直观

### 🎵 **强大音乐管理**
- **智能扫描**：自动发现指定文件夹中的音频文件
- **元数据缓存**：高效的音乐信息提取和缓存系统
- **封面显示**：自动加载专辑封面，缺失时显示优雅占位符
- **分类浏览**：按文件夹组织音乐，快速定位心仪曲目

### 🎛️ **完整播放控制**
- **状态栏集成**：实时显示当前播放状态和进度
- **播放控制**：播放/暂停、上一曲、下一曲
- **进度控制**：可拖拽的进度条，精确定位播放位置
- **播放模式**：支持单曲循环、列表循环等模式

### ⚡ **性能优化**
- **异步加载**：不阻塞 Obsidian 启动，后台加载音乐库
- **内存管理**：智能缓存策略，平衡性能与内存使用
- **响应式设计**：适配不同屏幕尺寸，移动端友好

## 📸 界面预览

### 🎼 黑胶唱片播放器
精美的黑胶唱片设计，配合逼真的旋转动画和光泽效果：

```
🎵 [正在播放的音乐标题]
       📀 旋转的黑胶唱片
       ⏸ 暂停/播放控制
```

### 📱 状态栏显示
简洁的状态栏集成，实时显示播放信息：

```
🎵 Song Title - Artist 00:00 / 03:45 ▶
```

### 🎛️ 音乐控制面板
优雅的弹出式控制界面，包含完整的播放控制功能：

```
┌─────────────────────────┐
│  🎵 Albus Status Bar Music │
├─────────────────────────┤
│  📀 [黑胶唱片]          │
│  🎵 Song Title          │
│  🎤 Artist - Album      │
│  ⏸━━━━━━━━━━━━━━━━━━━━━▶ │
│  00:00              03:45 │
│  📁 [文件夹选择] [模式]   │
│  📜 [播放列表]           │
└─────────────────────────┘
```

## 🚀 快速开始

### 📦 安装

1. **下载插件文件**
   ```bash
   git clone https://github.com/your-username/albus-status-bar-music.git
   ```

2. **构建插件**
   ```bash
   cd albus-status-bar-music
   npm install
   npm run build
   ```

3. **安装到 Obsidian**
   - 复制 `main.js`、`manifest.json`、`styles.css` 到
   `<vault>/.obsidian/plugins/albus-status-bar-music/`

4. **启用插件**
   - 在 Obsidian 设置中启用 "Albus Status Bar Music"

### ⚙️ 基础配置

1. **设置音乐文件夹**
   - 打开插件设置页面
   - 添加包含音乐文件的文件夹路径
   - 支持多个文件夹

2. **支持的音频格式**
   - MP3, FLAC, WAV, M4A, OGG
   - 自动识别文件扩展名

3. **开始使用**
   - 点击状态栏的音乐图标打开控制面板
   - 点击黑胶唱片开始播放
   - 享受音乐！

## 🎯 使用指南

### 🎼 播放控制

| 操作 | 方式 |
|------|------|
| 播放/暂停 | 点击黑胶唱片或状态栏 |
| 上一曲/下一曲 | 使用控制按钮 |
| 进度控制 | 拖拽进度条 |
| 音量控制 | 系统音量控制 |

### 📁 音乐管理

| 功能 | 说明 |
|------|------|
| 文件夹扫描 | 自动扫描指定文件夹 |
| 元数据缓存 | 提取并缓存音乐信息 |
| 封面显示 | 自动加载专辑封面 |
| 分类浏览 | 按文件夹组织音乐 |

### ⚙️ 高级设置

| 设置项 | 说明 |
|------|------|
| 音乐文件夹 | 设置音乐文件存储位置 |
| 播放模式 | 单曲循环、列表循环等 |
| 缓存管理 | 清理元数据缓存 |
| 界面主题 | 适配 Obsidian 主题 |

## 🔧 技术架构

### 📁 项目结构
```
albus-status-bar-music/
├── src/
│   ├── components/          # UI 组件
│   │   ├── MusicHubComponent.ts
│   │   ├── VinylPlayer.ts
│   │   ├── StatusBarComponent.ts
│   │   └── SettingsTab.ts
│   ├── services/           # 核心服务
│   │   ├── AudioPlayerService.ts
│   │   ├── PlaylistManager.ts
│   │   ├── MetadataManager.ts
│   │   └── MetadataParser.ts
│   ├── styles/             # 样式文件
│   │   ├── hub.css
│   │   ├── vinyl.css
│   │   └── statusbar.css
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   └── main.ts             # 插件入口
├── manifest.json           # 插件清单
├── package.json            # 依赖配置
└── README.md              # 项目文档
```

### 🛠️ 技术栈

- **TypeScript** - 类型安全的 JavaScript
- **Obsidian API** - 插件开发接口
- **CSS3** - 现代样式和动画
- **esbuild** - 快速构建工具
- **music-metadata** - 音频元数据提取

### 🎨 设计理念

- **极简主义**：专注核心功能，避免界面冗余
- **用户友好**：直观的交互设计，降低学习成本
- **性能优先**：异步处理，不影响 Obsidian 性能
- **视觉美感**：精美的黑胶唱片设计，提升使用体验

## 🤝 贡献指南

欢迎为项目贡献代码！

### 🐛 报告问题
- 使用 GitHub Issues 报告 bug
- 提供详细的复现步骤
- 包含系统环境信息

### 💡 功能建议
- 在 Issues 中提出功能建议
- 描述使用场景和预期效果
- 欢迎提供设计思路

### 🔧 代码贡献
1. Fork 项目仓库
2. 创建功能分支
3. 提交代码变更
4. 发起 Pull Request

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙏 致谢

- **Obsidian 团队** - 提供强大的笔记平台
- **开源社区** - 提供丰富的技术资源
- **音乐爱好者** - 提供宝贵的使用反馈

---

<div align="center">

**🎵 让音乐伴随你的每一个创作瞬间**

Made with ❤️ by [Your Name]

</div>
