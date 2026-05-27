# Talent Match Platform — Frontend

基于 React 19 + Vite 8 的人才-岗位智能匹配系统前端。

## 技术栈

- **框架**: React 19 + TypeScript
- **构建**: Vite 8
- **样式**: Tailwind CSS 4 + shadcn/ui
- **路由**: React Router v7
- **可视化**: D3.js 力导向图
- **端口**: 5173

## 快速启动

```bash
cd talent-match-platform/frontend
npm install
npm run dev
```

## 页面结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 首页 |
| `/login` | Login | 登录 |
| `/register` | Register | 注册 (个人/企业) |
| `/dashboard` | Dashboard | 工作台 / 文档管理 |
| `/upload/resume` | ResumeUpload | 简历上传解析 |
| `/upload/job` | JobUpload | 岗位上传解析 |
| `/recommend` | Recommend | 智能推荐列表 |
| `/matching/:id` | MatchingResult | 匹配详情 + 能力图谱 |
| `/graph` | SkillGraph | 技能知识图谱浏览 |
| `/profile` | Profile | 个人信息 |

## 匹配详情页

匹配详情页展示完整的评分拆解：

- **技能匹配分** (满分 60): 加权技能覆盖 × 熟练度评分
- **知识图谱共现** (上限 15): Neo4j 技能组合共现强度
- **同城/同区域** (上限 10): 地理位置匹配
- **高热度技能** (上限 15): Job-SDF 市场需求热度
- **经验溢出** (上限 5): 工作年限超出预期
- **行业匹配** (上限 5): L2 职业画像 + 类别多样性
- **技能趋势** (上限 5): 需求增长趋势

每项以进度条可视化，综合评分右侧汇总展示。

## 能力图谱

D3.js 力导向图展示技能关联：

- 左侧紫色节点: "我" (候选人技能)
- 右侧绿色节点: "岗位" (职位要求)
- 彩色节点: 技能 (颜色=类别, 大小=熟练度)
- 绿色边: 已匹配技能
- 虚线: Neo4j 知识图谱共现关系

---

**开发者**: 吴昊
