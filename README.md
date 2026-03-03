# Albus Status Bar Music

一个为 [Obsidian](https://obsidian.md) 打造的状态栏音乐播放器插件。在不离开笔记的情况下，直接在 Obsidian 内播放和管理你的本地音乐库。

> 本项目基于 [obsidian-vault-radio](https://github.com/Laevin/obsidian-vault-radio)（MIT 许可证），由 [Laevin](https://github.com/Laevin) 开发。

![ObsidianPlugin](https://img.shields.io/badge/Obsidian-Plugin-red?logo=obsidian)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![release](https://img.shields.io/github/downloads/AlbusGuo/albus-status-bar-music/total?style=flat&label=Total%20Downloads)

---

## 功能概览

### 状态栏控制
- 实时显示当前播放的歌曲名称与艺术家
- 播放/暂停、上一首/下一首控制按钮
- 可视化播放进度条
- 三段式歌词切换：关闭 → 状态栏歌词 → 悬浮歌词 → 关闭

### 音乐中心
- 黑胶唱片播放器，带真实旋转动画
- 左右两侧唱片快速切歌，支持切歌缩放动画
- 智能歌单管理——子文件夹自动生成歌单
- 实时搜索歌曲、艺术家、专辑
- 专辑封面自动提取与显示
- 音量滑块控制，音量持久化保存
- 可拖拽窗口，自由定位

### 歌词
- 三行悬浮歌词窗口（上一行、当前行、下一行），支持平滑滚动动画
- 双语歌词支持（自动识别相同时间戳或 `//` 分隔）
- 自定义歌词高亮色和普通色
- 锁定模式：透明背景、鼠标穿透，完全不影响操作
- 双击歌词窗口解锁；右键可关闭
- 歌词与播放进度同步

### 播放
- 支持格式：MP3、FLAC、WAV、M4A、OGG
- 三种播放模式：列表循环、单曲循环、随机播放
- 红心收藏歌单
- 进度条拖拽、点击跳转
- 元数据缓存（封面以 Base64 存储），加载迅速

---

## 安装

1. 前往 [GitHub Releases](https://github.com/AlbusGuo/albus-status-bar-music/releases) 下载最新版本
2. 将 `main.js`、`manifest.json`、`styles.css` 放入 Obsidian 插件目录：  
   `<vault>/.obsidian/plugins/albus-status-bar-music/`
3. 在 Obsidian 设置 → 第三方插件中启用 **Albus Status Bar Music**

---

## 使用

### 配置音乐库

1. 打开 Obsidian 设置 → Albus Status Bar Music
2. 在"音乐库"设置组中填写包含音乐文件的文件夹路径（如 `Music`）
3. 点击"扫描"按钮，插件会自动扫描并缓存所有音乐文件的元数据

### 播放控制

- **状态栏**：点击歌曲名称打开音乐中心；使用按钮控制播放
- **音乐中心**：点击黑胶唱片播放/暂停；点击两侧唱片切歌；拖拽顶部手柄移动窗口
- **歌词**：点击状态栏歌词按钮在三种模式间切换（关闭/状态栏/悬浮）

### 歌词格式

歌词需嵌入在音频文件的元数据中，支持标准 LRC 格式：

```
[00:12.34]第一句歌词
[00:12.34]First line translation
[00:18.56]第二句歌词 // 翻译文本
```

同一时间戳的两行会自动识别为双语歌词，也可以使用 `//` 分隔符。

---

## 设置项

| 设置组 | 设置项 | 说明 |
|--------|--------|------|
| 音乐库 | 音乐文件夹 | 音乐文件所在的 Vault 内文件夹路径 |
| 音乐库 | 已缓存元数据 | 查看/清空元数据缓存 |
| 界面 | 显示状态栏控制按钮 | 是否在状态栏显示播放控制按钮 |
| 界面 | 点击外部关闭播放器 | 点击音乐中心外部区域是否自动关闭 |
| 歌词 | 高亮颜色 | 当前播放歌词的颜色 |
| 歌词 | 普通颜色 | 非当前歌词的颜色 |

---

## 技术栈

- TypeScript + Obsidian Plugin API
- 构建工具：esbuild
- 音频元数据解析：music-metadata
- 最低 Obsidian 版本：1.11.4

---

## 常见问题

**音乐无法播放**  
检查文件夹路径是否正确，确认文件格式为受支持的类型。可尝试清空缓存后重新扫描。

**封面不显示**  
确认音频文件的元数据中包含封面图片。插件会自动提取并缓存为 Base64 格式。

**歌词不同步**  
确认 LRC 时间标签格式正确（`[mm:ss.xx]`）。可使用 Mp3tag 等工具检查音频文件的歌词标签。

**悬浮歌词无法解锁**  
锁定状态下双击歌词窗口任意位置即可解锁。

---

## 贡献

- 提交 Bug 或功能建议：[GitHub Issues](https://github.com/AlbusGuo/albus-status-bar-music/issues)
- 代码贡献：Fork → 修改 → Pull Request

---

## 许可证

[MIT License](LICENSE)
