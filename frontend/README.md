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
│   └── Profile.tsx      # 个人信息
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
| `/profile` | Profile | 个人信息 |

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

## 构建优化

Vite 生产构建采用手动分块策略：

- `d3-vendor`：D3 相关库单独打包
- `react-vendor`：React 生态（react-dom、react-router）单独打包
- 非首屏页面使用 `React.lazy` + `Suspense` 懒加载

## 路径别名

`@` 映射到 `./src`（在 `vite.config.ts` 和 `tsconfig` 中配置）。

---

**开发者**：吴昊
