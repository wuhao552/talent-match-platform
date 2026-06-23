# Talent Match Platform — 后端

基于 NestJS 11 的人才-岗位智能匹配系统后端服务。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | NestJS 11 (Node.js) |
| 语言 | TypeScript |
| 数据库 | PostgreSQL (TypeORM) |
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

# PostgreSQL 配置
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
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
backend/src/
├── agents/                    # Agent 编排层
│   ├── orchestrator.agent.ts  # 流水线协调器
│   ├── document-parser.agent.ts # 文档结构化解析
│   ├── skill-extractor.agent.ts # 技能提取
│   └── agent.interface.ts     # Agent 接口定义
├── common/
│   ├── decorators/            # 自定义装饰器（@CurrentUser, @Roles）
│   └── guards/                # 守卫（JwtAuthGuard, RolesGuard）
├── config/
│   ├── database.config.ts     # 数据库配置
│   └── llm.config.ts          # LLM 配置
├── modules/
│   ├── auth/                  # 认证模块（登录/注册/JWT）
│   ├── document/              # 文档模块（上传/解析管道）
│   ├── skill/                 # 技能模块（CRUD/种子数据/规则匹配）
│   ├── graph/                 # 图谱布局模块（d3-force 预计算）
│   ├── matching/              # 匹配模块（算法/推荐/评分）
│   ├── llm/                   # LLM 模块（DeepSeek API + Embedding 封装）
│   ├── admin/                 # 管理模块（后台 API）
│   ├── dashboard/             # 仪表盘模块
│   └── user/                  # 用户实体
├── app.module.ts              # 根模块
└── main.ts                    # 入口（CORS/压缩/验证管道）
```

## 模块依赖关系

```
AppModule
├── AuthModule          JWT 认证 / 角色管理
├── DocumentModule      文件上传 / 解析管道
│   └── 依赖 AgentModule
├── SkillModule         技能 CRUD / 种子数据 / 规则匹配
│   └── 依赖 GraphModule
├── GraphModule         图谱布局服务（d3-force 预计算）
├── MatchingModule      匹配算法 / 推荐引擎 / 评分
│   └── 依赖 LlmModule + DocumentModule
├── LlmModule           DeepSeek API + Embedding 封装
├── AgentModule         文档解析 Agent 编排
│   └── 依赖 LlmModule, GraphModule, SkillModule
├── AdminModule         后台管理 API
└── DashboardModule     仪表盘 API
```

## 核心流程

### Agent 解析流水线

文档上传后由 `OrchestratorAgent` 协调多步流水线处理，通过 SSE 实时推送进度：

1. **文本提取** — 读取 PDF（pdf-parse）、DOCX（mammoth）或纯文本
2. **DocumentParserAgent** — 调用 LLM 解析结构化字段（姓名、邮箱、电话、教育、经历）
3. **SkillExtractorAgent** — 调用 LLM 提取 `{name, proficiency}` 技能列表（使用 flash 模型）
4. **SkillMatcherService** — 将提取的技能名称映射到 PostgreSQL 中的规范技能 ID

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

## LLM 集成

`LlmService` 封装 DeepSeek API 调用，支持两种模型：

- `deepseek-v4-flash` — 技能提取和文档解析（快速/低成本）
- `deepseek-v4-pro` — 复杂任务（通过 `LLM_MODEL` 环境变量配置）

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

技能数据基于 [Job-SDF](https://github.com/Job-SDF/benchmark)（NeurIPS 2024）构建：

- 2,335 个规范技能（中英双语）
- 60,804 条共现关系（5 个粒度：L1 职业 / L2 职业 / 技能 / 企业 / 地区）
- 36 个月需求时序（2021.01–2023.12）
- 52 个 L2 职业画像

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
