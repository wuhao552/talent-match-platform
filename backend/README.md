# Talent Match Platform — 后端

基于 NestJS 11 的人才-岗位智能匹配系统后端服务。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | NestJS 11 (Node.js) |
| 语言 | TypeScript |
| 数据库 | 人大金仓 KingbaseES V9（PostgreSQL 兼容模式，TypeORM） |
| LLM | DeepSeek API (文档解析 / 技能提取 / 语义匹配) |
| 语义匹配 | Embedding 向量相似度 |
| 认证 | JWT + Passport |
| 文件解析 | pdf-parse (PDF) + mammoth (DOCX) |
| 图谱布局 | d3-force (服务端预计算) |
| 运行端口 | 3100（全局前缀 `/api`） |

## 快速启动

```bash
cd talent-match-platform/backend
npm install
```

配置 `.env` 文件：

```env
# LLM 配置
LLM_API_KEY=your_deepseek_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-pro

# 人大金仓 KingbaseES 配置（PostgreSQL 兼容模式，使用 postgres 驱动）
DB_HOST=localhost
DB_PORT=54321
DB_USERNAME=system
DB_PASSWORD=123456
DB_DATABASE=talent_match
```

```bash
npm run start:dev    # 开发模式（热重载）
npm run build        # 生产构建
npm run start:prod   # 生产运行
npm run lint         # ESLint 检查 + 自动修复
npm run format       # Prettier 格式化
npm run test         # 单元测试 (Jest)
npm run test:watch   # Jest 监听模式
npm run test:cov     # 测试覆盖率
npm run test:e2e     # E2E 测试
```

运行单个测试：`npx jest --testPathPattern=<pattern>`

## 项目结构

```
backend/
├── data/
│   └── entity_map/skill.list   # Job-SDF 标准技能库种子数据（2,335 条）
├── scripts/                    # 运维 / 一次性迁移脚本
│   ├── backup-db.ts            # 数据库备份
│   ├── inspect-db.ts           # 数据库结构检查
│   ├── drop-redundant-columns.ts # 清理冗余列
│   └── migrate-skill-matcher.ts  # 技能匹配逻辑迁移
├── src/
│   ├── agents/                 # Agent 编排层
│   │   ├── orchestrator.agent.ts   # 流水线协调器
│   │   ├── document-parser.agent.ts # 文档结构化解析
│   │   ├── skill-extractor.agent.ts # 技能提取
│   │   ├── agent.interface.ts  # Agent 接口定义
│   │   └── agent.module.ts     # Agent 模块装配
│   ├── common/
│   │   ├── decorators/         # 自定义装饰器（@CurrentUser, @Roles）
│   │   └── guards/             # 守卫（JwtAuthGuard, RolesGuard）
│   ├── config/
│   │   ├── database.config.ts  # 数据库配置
│   │   └── llm.config.ts       # LLM 配置
│   ├── migrations/             # TypeORM 数据库迁移脚本（synchronize=false）
│   ├── modules/
│   │   ├── auth/               # 认证模块（登录/注册/JWT）
│   │   ├── document/           # 文档模块（上传/解析管道）
│   │   │   ├── document.entity.ts
│   │   │   ├── document.service.ts
│   │   │   └── document.controller.ts
│   │   ├── skill/              # 技能模块（CRUD/种子数据/标准技能匹配）
│   │   │   ├── skill.entity.ts
│   │   │   ├── document-skill.entity.ts # 文档-技能关联实体
│   │   │   ├── skill-seed.service.ts    # skill.list 种子数据初始化
│   │   │   ├── skill-matcher.service.ts # 三级递进标准技能匹配
│   │   │   └── skill.utils.ts
│   │   ├── graph/              # 图谱布局模块（d3-force 预计算）
│   │   ├── matching/           # 匹配模块（算法评分/LLM 评估/推荐）
│   │   │   ├── matching.service.ts      # 算法评分
│   │   │   ├── llm-matching.service.ts  # LLM 深度评估
│   │   │   └── match-result.entity.ts
│   │   ├── llm/                # LLM 模块（DeepSeek API + Embedding 封装）
│   │   │   ├── llm.service.ts
│   │   │   ├── embedding.service.ts     # 语义相似度计算
│   │   │   └── llm-log.entity.ts        # LLM 调用日志实体
│   │   ├── admin/              # 管理模块（后台 API + 审计日志）
│   │   │   ├── admin-audit-log.entity.ts
│   │   │   └── admin.dto.ts
│   │   ├── ai-assistant/       # AI 智能助手（面试题生成 / 智能问答 / 职业教练）
│   │   │   ├── ai-assistant.controller.ts   # SSE + POST 流式端点
│   │   │   └── ai-assistant.service.ts      # 上下文加载 + LLM 调用封装
│   │   ├── job/                # 岗位模块（发布/上下架/同步 JD 文档）
│   │   │   ├── job.entity.ts
│   │   │   ├── job.dto.ts
│   │   │   ├── job.service.ts  # 含 syncFromDocument 钩子
│   │   │   └── job.controller.ts
│   │   ├── application/        # 投递模块（状态机 + 历史记录）
│   │   │   ├── application.entity.ts
│   │   │   ├── application.dto.ts
│   │   │   └── application.service.ts
│   │   ├── notification/       # 通知模块（点对点 + 全员广播）
│   │   │   ├── notification.entity.ts
│   │   │   └── notification.service.ts
│   │   ├── message/            # 站内消息模块（会话 + 未读计数）
│   │   │   ├── conversation.entity.ts
│   │   │   ├── message.entity.ts
│   │   │   └── message.service.ts
│   │   ├── dashboard/          # 仪表盘模块
│   │   └── user/               # 用户实体
│   ├── app.module.ts           # 根模块
│   ├── data-source.ts          # TypeORM DataSource（迁移 CLI 使用）
│   └── main.ts                 # 入口（CORS/压缩/验证管道）
└── test/                       # E2E 测试（app.e2e-spec.ts）
```

## 模块依赖关系

```
AppModule
├── AuthModule          JWT 认证 / 角色管理
├── DocumentModule      文件上传 / 解析管道
│   └── 依赖 AgentModule
├── SkillModule         技能 CRUD / 种子数据 / 标准技能匹配
│   └── 依赖 GraphModule（forwardRef）, LlmModule
├── GraphModule         图谱布局服务（d3-force 预计算）
├── MatchingModule      匹配算法 / 推荐引擎 / LLM 评估 / 评分
│   └── 依赖 SkillModule, LlmModule, DocumentModule（forwardRef）
├── LlmModule           DeepSeek API + Embedding 封装
├── AgentModule         文档解析 Agent 编排
│   └── 依赖 LlmModule, GraphModule, SkillModule
├── AdminModule         后台管理 API + 审计日志
├── AiAssistantModule   AI 智能助手（面试题 / 智能问答 / 职业教练，SSE 流式）
│   └── 依赖 LlmModule, MatchingModule, DocumentModule, SkillModule, UserModule
├── JobModule           岗位发布/上下架/从 JD 文档同步
├── ApplicationModule   投递状态机 + 历史记录
├── NotificationModule  通知（点对点 + 全员广播）
├── MessageModule       站内消息（会话/未读计数/已读）
└── DashboardModule     仪表盘 API
```

## 核心流程

### Agent 解析流水线

文档上传后由 `OrchestratorAgent` 协调多步流水线处理，通过 SSE 实时推送进度：

1. **文本提取** — 读取 PDF（pdf-parse）、DOCX（mammoth）或纯文本
2. **DocumentParserAgent** — 调用 LLM 解析结构化字段（姓名、邮箱、电话、教育、经历）
3. **SkillExtractorAgent** — 调用 LLM 提取 `{name, proficiency}` 技能列表（使用 flash 模型）
4. **SkillMatcherService** — 将提取的技能名称映射到 KingbaseES 中的规范技能 ID

步骤 2 和 3 并行执行。流水线通过 SSE 暴露：`GET /api/documents/:id/parse-stream?token=<jwt>`

### 匹配算法

匹配流程分为三步：技能匹配识别 → 算法评分 → LLM 深度评估。

#### 第一步：技能匹配识别

1. **ID 精确匹配** — 简历与岗位拥有相同技能 ID 时直接匹配
2. **语义模糊匹配** — 对未匹配的技能，通过 Embedding 向量计算语义相似度（阈值 ≥ 0.5）

#### 第二步：算法评分（满分 100）

```
覆盖率 (60%) = 岗位技能被匹配的比例（精确匹配计 1.0，模糊匹配计相似度）
达标率 (40%) = 候选人熟练度 / 岗位要求熟练度（上限 1.0）
算法分 = 覆盖率 × 60 + 达标率 × 40
```

熟练度等级：beginner(1) → intermediate(2) → advanced(3) → expert(4)

#### 第三步：LLM 深度评估

调用 DeepSeek 对匹配质量进行语义评估，返回 LLM 评分（0-100）及详细分析。

#### 综合评分

```
有 LLM 评估时：综合分 = 算法分 × 50% + LLM 分 × 50%
无 LLM 评估时：综合分 = 算法分
```

## 招聘业务闭环

在原有「文档解析 + 匹配」基础上补齐了完整的招聘业务链路，覆盖 **岗位 → 投递 → 消息 → 通知** 四大模块。

### 数据模型

| 表 | 关键字段 | 说明 |
|----|---------|------|
| `jobs` | `enterpriseId`、`documentId`、`status(draft/published/closed/archived)` | 岗位表，可由企业手动创建或由 JD 文档解析自动同步 |
| `applications` | `jobId`、`applicantId`、`resumeDocId`、`matchResultId`、`status`、`statusHistory(jsonb)` | 投递记录，含状态流转历史 |
| `notifications` | `userId`、`type(system/match/application/message/job)`、`readAt` | 用户通知，支持点对点 + 全员广播 |
| `conversations` | `userAId`、`userBId`、`jobId`、`unreadA/unreadB` | 会话表，两两唯一（可选 jobId 维度） |
| `messages` | `conversationId`、`senderId`、`readAt` | 消息表，按时间正序加载 |

迁移文件：[1751600000000-AddRecruitmentTables.ts](src/migrations/1751600000000-AddRecruitmentTables.ts)

### 投递状态机

```
submitted → viewed → screening → interview → offer → hired
                ↓                                  ↓
              rejected  ←────────────────────── rejected

任意阶段 → withdrawn（候选人主动撤回）
```

每次状态变更都会写入 `statusHistory`（jsonb 数组），记录 `{ status, at, by, note }`，企业端可查看完整流转轨迹。

### JD 文档 → 岗位自动同步

`DocumentService.saveParseResult` 在保存解析结果后，会 fire-and-forget 调用 `JobService.syncFromDocument`：

- 将 `parsedJson.structured` 自动映射为 Job 字段（`jobTitle→title`、`companyName→companyName`、`responsibilities→description`、`salaryRange→salaryMin/salaryMax`、`jobType→employmentType`）
- 已存在 `documentId` 关联：更新字段（保留用户编辑过的 status/note 等）
- 不存在：创建一条草稿状态 Job

这让「工作台上传 JD 文档」和「岗位管理列表」数据保持一致。

### 站内消息

- 两两用户间保证唯一会话（可选按 jobId 区分）
- 发送消息时：更新 `lastMessageAt`、累加对方未读数、自动给对方推送一条 `message` 类型通知
- 拉取消息时：自动标记己方未读清零
- 未读总数接口供前端导航栏徽标轮询

### 关键接口

| 模块 | 路径 | 说明 |
|------|------|------|
| 岗位 | `GET /api/jobs` | 已发布岗位广场（分页/搜索） |
| 岗位 | `GET /api/jobs/mine` | 企业自己的岗位（含草稿） |
| 投递 | `POST /api/applications` | 个人投递岗位 |
| 投递 | `GET /api/applications/mine` | 个人投递记录 |
| 投递 | `GET /api/applications/enterprise/all` | 企业收到的所有投递 |
| 投递 | `PATCH /api/applications/:id/status` | 企业更新投递状态 |
| 消息 | `GET /api/messages/conversations` | 会话列表 |
| 消息 | `GET /api/messages/unread/total` | 未读总数 |
| 消息 | `POST /api/messages/send` | 发送消息 |
| 通知 | `GET /api/notifications` | 我的通知 |
| 通知 | `PATCH /api/notifications/:id/read` | 标记已读 |
| 管理后台 | `POST /api/admin/notifications/broadcast` | 全员广播 |
| AI 助手 | `GET /api/ai-assistant/interview-questions/matches` | 可作为面试题上下文的匹配记录 |
| AI 助手 | `GET /api/ai-assistant/interview-questions/stream?matchId=&token=` | 面试题生成（SSE 流式） |
| AI 助手 | `GET /api/ai-assistant/chat/contexts` | 可作为问答上下文的文档/匹配 |
| AI 助手 | `POST /api/ai-assistant/chat/stream` | 智能问答（POST + 流式响应） |
| AI 助手 | `GET /api/ai-assistant/coach/stream?token=` | 候选人职业教练（SSE 流式） |

## AI 智能助手

`AiAssistantModule` 把前面流程产生的"匹配结果"转化为可执行的下一步动作，所有 LLM 输出均走 SSE/流式响应，token 边生成边推送。

### 三大能力

| 能力 | 接口 | 数据上下文 | 输出 |
|------|------|-----------|------|
| 面试题生成 | `GET /ai-assistant/interview-questions/stream` | 匹配记录 + 双方技能 + LLM 评估 | 6-8 道题（含类别/难度/考察点/参考答案） |
| 智能问答 | `POST /ai-assistant/chat/stream` | 简历 / JD / 匹配记录（任选一） | 多轮对话，回答基于上下文 |
| 候选人 AI 教练 | `GET /ai-assistant/coach/stream` | 用户最新简历技能 + 最近 5 条带评估的匹配 | 职业成长计划（短期目标/技能补齐/学习路径/推荐方向） |

### 面试题生成

- 输入：一条匹配记录（优先选带 `llmAssessment` 的）
- 上下文：候选人技能、岗位要求、匹配明细、LLM 深度评估（优势/差距/可迁移技能）
- 输出维度：**技术深度 / 差距探测 / 迁移能力 / 行为项目** 四类，每类带难度（基础/进阶/压栈）和关联技能标签

### 智能问答

- 支持三种上下文：`resume` / `job_description` / `match`
- `match` 上下文会拼入：综合评分、算法分、LLM 分、优势/差距、可迁移技能、技能匹配明细、语义匹配明细
- 多轮对话历史由前端维护，每次随 body 发送
- 因 EventSource 不支持 body，采用 `POST + ReadableStream` 消费流式响应

### 候选人 AI 教练

- 上下文：用户最新一份解析过的简历技能 + 最近 5 条带 `llmAssessment` 的匹配记录（含上手周期、差距、可迁移技能）
- 输出结构化 `CoachPlan`：整体诊断、短期目标（含周数）、技能补齐清单（含优先级和理由）、学习路径（编号步骤）、推荐岗位方向（含匹配度）
- 数据不足时（无简历且无匹配）返回明确错误提示

### SSE 事件协议

三个流式端点遵循统一事件序列：

```
start → progress(running) → chunk(多个, LLM token) → progress(done) → result → complete
                                                                                   ↘ error
```

`AiAssistantController` 中封装了 `setupSse()` / `sseWrite()` 辅助方法，统一设置 `Content-Type: text/event-stream`、`X-Accel-Buffering: no`（防 Nginx 缓冲），并按 `event: xxx\ndata: {...}\n\n` 格式写入。

GET 端点（面试题 / 教练）通过 query 中的 `token` 验证 JWT（兼容 EventSource 无法设置 Header 的限制）；POST 端点（智能问答）走标准 `JwtAuthGuard`。

## LLM 集成

`LlmService` 封装 DeepSeek API 调用，使用两类模型配置：

- `flashModel`（固定为 `deepseek-v4-flash`）— 技能提取、文档解析等快速/低成本任务
- `proModel`（由 `LLM_MODEL` 环境变量配置，未设置时回退到 `deepseek-v4-flash`）— LLM 深度评估等复杂任务

> 注：代码默认统一使用 `deepseek-v4-flash`；仅当在 `.env` 中显式设置 `LLM_MODEL`（如 `deepseek-v4-pro`）后，复杂任务才会切换到该模型。

特性：
- 内存缓存，30 分钟 TTL（SHA-256 哈希键）
- SSE 流式输出支持
- 120 秒超时
- 自动从 LLM 输出中提取首个 JSON 数组/对象

`EmbeddingService` 提供语义相似度计算：
- 批量获取技能名向量（`getEmbeddingBatch`）
- 计算两个技能名的语义相似度（`semanticSimilarity`）
- 用于技能模糊匹配阶段

## 图谱布局服务

`GraphLayoutService` 使用 d3-force 在服务端预计算技能图谱的节点布局位置，结果存储在 `document.parsedJson.graphLayout` 中，前端直接渲染无需重复计算。

## 数据集

### 数据集介绍 — Job-SDF

本项目的标准技能库基于 **Job-SDF**（Job Skill Demand Forecasting）数据集构建，该数据集由中国科学技术大学发布于 NeurIPS 2024，是面向岗位技能需求预测的多粒度基准数据集。

- **项目地址**：https://github.com/Job-SDF/benchmark
- **数据来源**：公开招聘广告数据，覆盖百万级招聘信息
- **时间跨度**：2021.01 – 2023.12（36 个月时序）
- **粒度层级**：L1 职业 / L2 职业 / 公司 / 技能 四级
- **数据构成**：
  - 技能需求序列（按月统计各技能招聘需求量）
  - 需求占比序列（0-1 归一化）
  - 实体映射表（技能 / 职业 / 公司的 ID 索引）
  - 结构性突变索引（需求趋势发生突变的技能）
  - 技能共现图谱（60,804 条共现关系，5 个粒度）
  - 52 个 L2 职业画像

### 本项目使用情况

本项目仅使用 Job-SDF 数据集中的 **`entity_map/skill.list`** 文件作为标准化技能库的初始数据来源。

| 项目 | 说明 |
|------|------|
| 使用文件 | `entity_map/skill.list` |
| 文件内容 | 标准化技能名称索引表（中英双语） |
| 记录数量 | 2,335 条标准技能 |
| 导入方式 | 作为技能种子数据初始化数据库 `skill` 表 |

**使用流程**：

1. 系统启动时通过种子脚本将 `skill.list` 中的 2,335 条技能名导入数据库，构建标准技能库
2. Agent 解析流水线中，`SkillExtractorAgent` 通过 LLM 从简历 / 岗位文档中提取自由文本形式的技能名（如 "JS"、"K8s"、"深度学习"）
3. `SkillMatcherService` 采用三级递进策略将自由文本技能映射至标准技能 ID：
   - **L1 精确匹配**：输入规范化（小写、去后缀）后与 `skill.list` 精确比对（置信度 1.0）
   - **L2 包含匹配**：双向检测输入与标准技能名的包含关系（置信度 0.85）
   - **L3 编辑距离匹配**：2-gram 倒排索引召回 Top-30 候选 + Levenshtein 距离计算，自适应阈值（置信度 0.6 ~ 1.0）
4. 映射后的标准技能 ID 用于构建能力图谱与执行混合匹配算法

通过该数据集，系统实现了技能名称的**规范化与对齐**，解决了 LLM 输出技能表达多样、同义技能无法关联的问题（如 "JavaScript" / "JS" / "JS语言" 统一映射至同一技能 ID），为后续能力图谱构建与混合匹配奠定基础。

## 关键设计模式

- **全局验证管道**：`ValidationPipe({ transform: true, whitelist: true })`，DTO 使用 `class-validator` 装饰器
- **统一响应格式**：所有 API 返回 `{ code: 200, message: '...', data: ... }`
- **认证守卫**：`@UseGuards(JwtAuthGuard)` + `@CurrentUser()` 装饰器获取 `{ id, username, role }`
- **角色控制**：`RolesGuard` + `@Roles()` 装饰器实现基于角色的访问控制
- **文件上传**：Multer 磁盘存储至 `./uploads/`，限制 PDF/DOC/DOCX，最大 10MB
- **静态文件**：通过 `@nestjs/serve-static` 从 `/uploads` 提供访问
- **CORS**：允许 `localhost:3000` 和 `localhost:5173`
- **压缩**：启用 gzip 压缩（SSE 响应自动跳过）

---

**开发者**：吴昊
