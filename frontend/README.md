# Talent Match Platform — 前端

基于 React 19 + Vite 8 的人才-岗位智能匹配系统前端应用。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 路由 | React Router v7 |
| 表单 | React Hook Form + Zod |
| 可视化 | D3.js 力导向图 |
| HTTP | 原生 fetch + localStorage Token |
| 开发端口 | 3000（代理 `/api` → `http://localhost:3100`） |

## 快速启动

```bash
cd talent-match-platform/frontend
npm install
npm run dev        # 启动开发服务器 → http://localhost:3000
npm run build      # TypeScript 类型检查 + 生产构建
npm run lint       # ESLint 检查
npm run preview    # 预览生产构建
```

## 项目结构

```
frontend/src/
├── assets/              # 静态资源（图片等）
├── components/
│   ├── graph/           # D3.js 技能力导向图组件
│   ├── layout/          # 布局组件（Layout）
│   ├── ui/              # shadcn/ui 基础组件
│   └── FileUpload.tsx   # 文件上传组件
├── hooks/
│   ├── useAuth.tsx      # 认证上下文 + Provider
│   └── useDocuments.tsx # 文档相关 Hook
├── lib/
│   └── utils.ts         # 工具函数（cn 等）
├── pages/
│   ├── Login.tsx        # 登录
│   ├── Register.tsx     # 注册（个人/企业）
│   ├── Dashboard.tsx    # 工作台 / 文档管理
│   ├── ResumeUpload.tsx # 简历上传解析
│   ├── JobUpload.tsx    # 岗位上传解析
│   ├── ResumeDetail.tsx # 简历详情
│   ├── JobDetail.tsx    # 岗位详情
│   ├── MatchingResult.tsx # 匹配详情 + 能力图谱
│   ├── PipelineView.tsx # 解析流水线可视化
│   ├── Profile.tsx      # 个人信息
│   ├── Jobs.tsx         # 岗位广场(个人) / 岗位管理(企业)
│   ├── JobInfo.tsx      # 岗位详情 + 立即投递
│   ├── Applications.tsx # 投递记录(个人投递 / 企业收到的投递)
│   ├── Messages.tsx     # 消息中心(会话列表 + 聊天)
│   ├── Notifications.tsx # 通知中心
│   └── AIAssistant.tsx  # AI 智能助手(面试题/智能问答/职业教练)
├── services/
│   └── api.ts           # API 请求封装（统一 /api 前缀 + JWT）
├── types/
│   └── index.ts         # 全局 TypeScript 类型定义
├── App.tsx              # 路由配置 + 懒加载
├── main.tsx             # 入口
└── index.css            # 全局样式 + Tailwind
```

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Login | 登录页（无 Layout） |
| `/register` | Register | 注册页（无 Layout） |
| `/dashboard` | Dashboard | 工作台 / 文档管理 |
| `/upload/resume` | ResumeUpload | 简历上传与解析 |
| `/upload/job` | JobUpload | 岗位上传与解析 |
| `/resume/:resumeDocId` | ResumeDetail | 简历详情 |
| `/job/:jobDocId` | JobDetail | 岗位详情 |
| `/matching/:id` | MatchingResult | 匹配详情 + 能力图谱 |
| `/pipeline/:docId` | PipelineView | 解析流水线可视化 |
| `/graph/:docId` | — | 重定向至 `/pipeline/:docId`（兼容旧路径） |
| `/profile` | Profile | 个人信息 |
| `/jobs` | Jobs | 岗位广场(个人) / 岗位管理(企业) |
| `/jobs/:id` | JobInfo | 岗位详情 + 立即投递 |
| `/applications` | Applications | 投递记录(个人/企业) |
| `/messages` | Messages | 消息中心(会话 + 聊天) |
| `/notifications` | Notifications | 通知中心 |
| `/ai-assistant` | AIAssistant | AI 智能助手(面试题/智能问答/职业教练) |

## 核心功能

### 认证与权限

- JWT Token 存储在 localStorage，通过 `useAuth` Hook 管理认证状态
- 所有 API 请求自动携带 `Authorization: Bearer <token>` 头
- 支持个人用户和企业用户两种角色注册

### 文档上传与解析

- 支持 PDF、DOC、DOCX 格式文件上传（最大 10MB）
- 上传后通过 SSE 实时接收解析进度（`/api/documents/:id/parse-stream`）
- 解析流水线：文本提取 → 结构化解析 → 技能提取 → 技能匹配

### 匹配详情页

展示算法评分与 LLM 评估的综合结果：

- **算法评分**（满分 100）：技能覆盖率 (60%) + 熟练度达标率 (40%)
- **LLM 评估**（满分 100）：DeepSeek 对匹配质量的深度语义评估
- **综合评分**：算法分 × 50% + LLM 分 × 50%（无 LLM 评估时取算法分）

### 能力图谱

D3.js 力导向图展示技能关联（布局由后端 `GraphLayoutService` 预计算）：

- 左侧紫色节点：候选人技能
- 右侧绿色节点：岗位要求技能
- 彩色节点：技能（颜色 = 类别，大小 = 熟练度）
- 绿色边：已匹配技能

## 招聘业务闭环

在原有的「上传 → 解析 → 匹配」基础上，补齐了完整的招聘业务前端链路：

### 岗位（Jobs / JobInfo）

- **个人用户**：浏览已发布岗位、按关键词/地点/工作类型搜索、查看岗位详情、一键投递（自动选择当前最新的简历）
- **企业用户**：管理自己发布的岗位、新建岗位、编辑/上下架/删除、查看投递数

工作台上传 JD 文档解析后，会自动在「岗位管理」生成一条草稿岗位，避免工作台与岗位管理数据割裂。

### 投递（Applications）

- **个人用户**：查看自己的投递记录、按状态筛选、查看岗位详情、撤回投递
- **企业用户**：查看收到的所有投递、按状态/岗位筛选、更新投递状态（已查看 → 筛选 → 面试 → offer → 录用/拒绝）、查看状态流转历史、直接发起与候选人的会话

投递状态以彩色 Badge 展示，支持完整的招聘流程状态机。

### 消息中心（Messages）

- 左侧会话列表（带未读数徽标 + 最新消息预览）
- 右侧聊天界面（消息气泡 + 自动滚动到底）
- 5 秒轮询自动刷新会话列表与未读数
- 可从「投递管理」直接发起会话，会话关联岗位与投递记录

### 通知中心（Notifications）

- 通知列表（系统/匹配/投递/消息/岗位五类，彩色类型标签）
- 标记单条已读 / 一键全部已读
- 导航栏未读徽标（30 秒轮询）

### AI 智能助手（AIAssistant）

把匹配结果转化为可执行的下一步动作，三个 Tab 全部走流式输出：

- **面试题生成**：选择匹配记录后调用 `GET /api/ai-assistant/interview-questions/stream`（EventSource + token query 鉴权），按"技术深度/差距探测/迁移能力/行为项目"四类生成 6-8 道题，每题带类别色标、难度（基础/进阶/压栈）、关联技能、考察点、可折叠参考答案
- **智能问答**：选择"简历/JD/匹配记录"任一作为上下文，调用 `POST /api/ai-assistant/chat/stream`（fetch + ReadableStream 消费，因 EventSource 不支持 body），支持多轮对话；切换上下文时清空历史
- **候选人 AI 教练**：调用 `GET /api/ai-assistant/coach/stream`，基于用户技能图谱 + 最近 5 条带 LLM 评估的匹配，生成结构化职业计划：整体诊断、短期目标（含周数）、技能补齐清单（含优先级）、学习路径、推荐岗位方向

三个 Tab 共用 `StreamingPanel` 组件展示 LLM 实时 token 流（含加载态、错误态、完成态）。

## 构建优化

Vite 生产构建采用手动分块策略：

- `d3-vendor`：D3 相关库单独打包
- `react-vendor`：React 生态（react-dom、react-router）单独打包
- 非首屏页面使用 `React.lazy` + `Suspense` 懒加载

## 路径别名

`@` 映射到 `./src`（在 `vite.config.ts` 和 `tsconfig` 中配置）。

---

**开发者**：吴昊
