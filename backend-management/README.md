# 人才匹配系统 - 管理后台

## 项目简介

基于 React 19 + Vite 8 + Tailwind CSS 4 + shadcn/ui 构建的管理后台前端，用于管理人才匹配系统的用户、文档、技能、匹配记录和 LLM 调用日志。

## 技术栈

- **框架**: React 19 + TypeScript 6
- **构建**: Vite 8
- **样式**: Tailwind CSS 4 + shadcn/ui (base-nova)
- **路由**: react-router-dom v7
- **图标**: lucide-react
- **通知**: sonner
- **UI 原语**: @base-ui/react

## 功能页面

| 页面 | 功能 |
|------|------|
| 仪表盘 | 统计卡片（用户/文档/匹配/LLM）+ 趋势柱状图 |
| 用户管理 | 搜索/筛选/分页、详情弹窗、启用/禁用、删除（管理员保护） |
| 文档管理 | 搜索/筛选/分页、详情（含解析文本）、重解析、删除 |
| 技能管理 | 搜索/筛选/分页、分类统计、结构断裂/低频标记 |
| 匹配记录 | 分数筛选/分页、分数颜色标记、匹配详情对比视图 |
| LLM 日志 | 调用统计卡片、筛选/分页、可折叠 Prompt/Response 详情 |

## 启动方式

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 3001）
npm run dev

# 构建生产版本
npm run build
```

> 确保后端 API 已在 `http://localhost:3100` 启动，前端会自动代理 `/api` 请求。

## 项目结构

```
backend-management/
├── src/
│   ├── components/
│   │   ├── layout/AdminLayout.tsx   # 侧边栏布局
│   │   └── ui/                      # shadcn UI 组件
│   ├── hooks/useAuth.tsx            # 认证 Hook
│   ├── pages/
│   │   ├── Login.tsx                # 管理员登录
│   │   ├── Dashboard.tsx            # 仪表盘
│   │   ├── UserManagement.tsx       # 用户管理
│   │   ├── DocumentManagement.tsx   # 文档管理
│   │   ├── SkillManagement.tsx      # 技能管理
│   │   ├── MatchingRecords.tsx      # 匹配记录
│   │   └── LlmLogs.tsx              # LLM 日志
│   ├── services/api.ts              # API 服务
│   ├── types/index.ts               # 类型定义
│   ├── App.tsx                      # 路由入口
│   └── main.tsx                     # 应用入口
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 作者

应飞帆

## 日期

2026-05-25
