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
| 岗位管理 | 全平台岗位列表/筛选/状态变更/删除/详情查看 |
| 投递记录 | 全平台投递记录查询/状态流转历史详情 |
| 通知广播 | 向全体用户推送系统通知，含类型选择与发送记录 |

## 招聘业务闭环（新增）

补齐了完整的招聘业务管理链路：

### 岗位管理
- 平台所有岗位一览（含草稿/已发布/已关闭/已归档四种状态）
- 按企业 / 标题 / 状态 / 工作类型 筛选
- 强制下架（强制改为 `archived`）/ 删除岗位
- 查看岗位详情（含 JD 文档结构化字段、招聘要求、薪资范围）

### 投递记录
- 全平台投递记录查询（按候选人 / 岗位 / 状态筛选）
- 查看投递状态流转历史（submitted → viewed → screening → interview → offer → hired/rejected）
- 仅查看权限，不修改业务状态（业务状态由企业端操作）

### 通知广播
- 向全体用户推送系统通知（支持 `system`/`job`/`match`/`application`/`message` 五种类型）
- 表单填写标题/内容/类型，一键广播
- 最近发送记录列表

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
│   ├── lib/utils.ts                 # 工具函数（cn 等）
│   ├── pages/
│   │   ├── Login.tsx                # 管理员登录
│   │   ├── Dashboard.tsx            # 仪表盘
│   │   ├── UserManagement.tsx       # 用户管理
│   │   ├── DocumentManagement.tsx   # 文档管理
│   │   ├── SkillManagement.tsx      # 技能管理
│   │   ├── MatchingRecords.tsx      # 匹配记录
│   │   ├── LlmLogs.tsx              # LLM 日志
│   │   ├── JobManagement.tsx        # 岗位管理（新增）
│   │   ├── ApplicationRecords.tsx   # 投递记录（新增）
│   │   └── NotificationBroadcast.tsx # 通知广播（新增）
│   ├── services/api.ts              # API 服务
│   ├── types/index.ts               # 类型定义
│   ├── App.tsx                      # 路由入口（basename=/admin）
│   ├── index.css                    # 全局样式 + Tailwind
│   └── main.tsx                     # 应用入口
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 作者

应飞帆

## 日期

2026-05-25
