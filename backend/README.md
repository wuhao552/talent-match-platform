# Talent Match Platform — Backend

基于 NestJS 11 的人才-岗位智能匹配系统后端服务。

## 技术栈

- **框架**: NestJS 11 (Node.js)
- **数据库**: PostgreSQL (TypeORM) + Neo4j (知识图谱)
- **LLM**: DeepSeek API (文档解析 / 技能提取 / 语义匹配)
- **认证**: JWT + Passport
- **端口**: 3100 (`/api` 前缀)

## 快速启动

```bash
cd talent-match-platform/backend
npm install
```

配置 `.env`：

```env
LLM_API_KEY=your_deepseek_api_key
LLM_BASE_URL=https://api.deepseek.com
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=123456
DB_DATABASE=talent_match
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=12345678
```

```bash
npm run start:dev    # 开发模式 (热重载)
npm run build        # 生产构建
npm run start:prod   # 生产运行
```

## 核心模块

```
AppModule
├── AuthModule        JWT 认证 / 角色管理
├── DocumentModule    文件上传 / 解析管道
├── SkillModule       技能 CRUD / 种子数据 / 规则匹配
├── GraphModule       Neo4j 知识图谱服务
├── MatchingModule    匹配算法 / 推荐引擎 / 评分
├── LlmModule         DeepSeek API 封装
└── AgentModule       文档解析 Agent 编排
```

## 匹配算法

### 技能匹配分 (满分 60)

```
Phase 0: 批量加载技能元数据 (hotness / trend / category)
Phase 1: ID 精确匹配 → 100% 权重 × 熟练度评分
Phase 2: 名称模糊匹配 → 100% 权重 × 相似度 × 熟练度
Phase 2.5: 同类别跨技能匹配 → 55% 权重 × 熟练度
Phase 2.6: LLM 语义匹配 → 置信度 × 权重 × 熟练度
Phase 3: 覆盖因子 = 0.55 + 0.45 × 匹配覆盖率 → 最终技能分
```

### 加成项 (满分 40)

| 维度 | 上限 | 数据来源 |
|------|------|----------|
| 知识图谱共现 | 15 | Neo4j CO_OCCURS_WITH (5 粒度) |
| 同城/同区域 | 10 | 用户注册城市 + 岗位地点 |
| 高热度技能 | 15 | Job-SDF 市场需求热度归一化 |
| 经验溢出 | 5 | 简历工作年限 vs 岗位要求 |
| 行业匹配 | 5 | L2 职业画像重叠 + 类别多样性 |
| 技能趋势 | 5 | Job-SDF 需求趋势 (36 月时序) |

## 数据集

技能知识图谱基于 [Job-SDF](https://github.com/Job-SDF/benchmark) (NeurIPS 2024) 构建：

- 2,335 个规范技能 (中英双语)
- 60,804 条共现关系 (5 个粒度: L1 职业 / L2 职业 / 技能 / 企业 / 地区)
- 36 个月需求时序 (2021.01–2023.12)
- 52 个 L2 职业画像

导入图谱数据：

```bash
python benchmark-main/import_neo4j.py
```

---

**开发者**: 吴昊
