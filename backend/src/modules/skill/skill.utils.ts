/**
 * Shared skill utility functions used by SkillSeedService and SkillMatcherService
 */

// Common Chinese tech suffixes that don't change skill identity
export const SKILL_SUFFIXES = [
  '系统开发', '开发', '设计', '框架', '技术', '平台', '工具', '应用',
  '编程', '语言', '算法', '模型', '架构', '服务', '组件', '引擎',
  '系统', '方案', '流程', '管理', '分析', '测试', '部署', '优化',
  '配置', '实现', '封装',
];

export function normalize(name: string): string {
  return name.toLowerCase().replace(/[-\s\.\/]/g, '');
}

export function stripSuffixes(s: string): string {
  let result = s;
  const sorted = [...SKILL_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suffix of sorted) {
    if (result.endsWith(suffix) && result.length > suffix.length + 1) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  return result;
}

export const CATEGORY_PATTERNS: Array<{ regex: RegExp; category: string }> = [
  {
    regex:
      /\b(Python|Java(?:Script)?|TypeScript|Go|Rust|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Scala|R\b(?!ag)|Perl|MATLAB|Dart|Lua|Shell|Bash|PowerShell|SQL|HTML|CSS|Sass|Less)\b/i,
    category: '编程语言',
  },
  {
    regex:
      /\b(React|Vue|Angular|Svelte|Next\.js|Nuxt|Django|Flask|FastAPI|Spring|Express|NestJS|Laravel|Rails|PyTorch|TensorFlow|Keras|PaddlePaddle|飞桨|Scikit-learn|Pandas|NumPy|OpenCV|LangChain|LlamaIndex|Hugging\s*Face|Transformers|Docker|Kubernetes|k8s|Jenkins|GitLab|GitHub|Nginx|Apache|Tomcat|Node\.js|Deno|Bun|jQuery|Bootstrap|Tailwind|Ant\s*Design|Element\s*UI)\b/i,
    category: '框架/库',
  },
  {
    regex:
      /\b(MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Oracle|SQL\s*Server|SQLite|Cassandra|Neo4j|HBase|Hive|Spark|Flink|Kafka|RabbitMQ|HDFS|MinIO|S3|DynamoDB|BigQuery|Snowflake)\b/i,
    category: '数据/存储',
  },
  {
    regex:
      /\b(AWS|Azure|GCP|阿里云|腾讯云|华为云|Terraform|Ansible|Prometheus|Grafana|ELK|CI\/CD|DevOps|GitOps)\b/i,
    category: '云/DevOps',
  },
  {
    regex:
      /\b(机器学习|深度学习|强化学习|自然语言处理|计算机视觉|语音识别|推荐系统|大模型|LLM|RAG|NLP|CV|GAN|CNN|RNN|Transformer|Agent|多模态|Embedding|Fine-tuning|Prompt|AIGC|目标检测|图像分割|文本分类|情感分析|知识图谱)\b/i,
    category: 'AI/ML',
  },
  {
    regex:
      /\b(沟通|团队合作|领导力|项目管理|敏捷|Scrum|Kanban|文档|需求分析|架构设计|系统设计|设计模式|重构|TDD|代码审查|技术选型)\b/i,
    category: '方法/软技能',
  },
  {
    regex: /零售|门店|销售|商品|库存|供应链/,
    category: '零售',
  },
  {
    regex: /会计|财务|税务|审计|报表|核算/,
    category: '会计/财务',
  },
  {
    regex: /医疗|临床|影像|护理|药品|诊断/,
    category: '医疗',
  },
  {
    regex: /金融|投资|风控|信贷|基金|证券/,
    category: '金融',
  },
  {
    regex: /教育|培训|课程|教学|教研/,
    category: '教育',
  },
  {
    regex: /设计|UI|UX|交互|视觉|平面/,
    category: '设计',
  },
  {
    regex: /法务|法律|合规|知识产权|合同/,
    category: '法务',
  },
  {
    regex: /人力|招聘|薪酬|绩效|培训/,
    category: '人力资源',
  },
  {
    regex: /市场|营销|品牌|推广|运营/,
    category: '市场/运营',
  },
];

export function inferCategory(name: string): string | null {
  for (const { regex, category } of CATEGORY_PATTERNS) {
    if (regex.test(name)) return category;
  }
  return null;
}
