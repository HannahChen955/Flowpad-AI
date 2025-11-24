# Flowpad - AI记事本

基于Electron + React的智能记事本，支持全局快捷键快速记录和AI智能总结。

## ✨ 特性

- 🚀 **全局快捷键**: Option+N 快速记录，Option+M 显示主窗口
- 🤖 **AI智能总结**: 自动分析每日记录，生成项目概览、待办清单和复盘反思
- 📍 **上下文感知**: 自动捕获当前应用、窗口标题等信息
- 🔄 **智能分类**: 自动识别记录类型（待办、问题、想法、感受等）
- 🏗️ **项目识别**: 根据上下文自动归类到不同项目
- 🔒 **隐私优先**: 所有数据本地存储，API密钥安全保存

## 🏗️ 项目结构

```
packages/
├── core/          # 共享逻辑层（数据库、AI、上下文捕获）
├── app/           # Electron主进程
└── renderer/      # React前端界面
```

## 🚀 快速开始

### 安装依赖

```bash
# 安装core包依赖
cd packages/core && npm install

# 安装app包依赖
cd ../app && npm install

# 安装renderer包依赖
cd ../renderer && npm install
```

### 构建和运行

```bash
# 构建core包
cd packages/core && npm run build

# 启动开发环境（需要两个终端）
# 终端1：启动React开发服务器
cd packages/renderer && npm run dev

# 终端2：启动Electron应用
cd packages/app && npm run dev
```

## ⚙️ 配置

首次使用需要配置AI功能：

1. 启动应用后，点击"设置"选项卡
2. 选择AI供应商（OpenAI或阿里千问）
3. 输入相应的API密钥
4. 点击"保存设置"

## 📖 使用方法

### 快速记录
- 按 `Option+N` 呼出浮窗记录器
- 输入内容后按 `Cmd+Enter` 保存
- 按 `Esc` 取消记录

### 查看记录
- 按 `Option+M` 显示主窗口
- 在"我的记录"中查看所有记录
- 点击记录查看详情和上下文信息

### AI总结
- 在"今日总结"页面点击"生成今日总结"
- AI会自动分析今天的记录并生成总结报告

## 🛠️ 开发

### 技术栈
- **前端**: React + TypeScript + TailwindCSS + Vite
- **后端**: Electron + Node.js + SQLite
- **AI**: OpenAI GPT-4 / 阿里千问

### 目录说明
- `packages/core/src/`: 核心业务逻辑
  - `types.ts`: 类型定义
  - `db.ts`: 数据库操作
  - `ai.ts`: AI服务集成
  - `context.ts`: 上下文捕获
- `packages/app/src/`: Electron主进程
  - `main.ts`: 主进程入口
  - `preload.ts`: 预加载脚本
- `packages/renderer/src/`: React前端
  - `components/`: 组件库
  - `pages/`: 页面组件

## 🔧 构建分发

```bash
# 构建所有包
npm run build

# 打包应用
cd packages/app && npm run dist
```

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License