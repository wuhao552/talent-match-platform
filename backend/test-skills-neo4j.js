/**
 * 验证技能写入Neo4j的完整流程
 * 测试unmatchedSkills是否能正确写入Neo4j图谱
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./src/app.module');
const { DocumentService } = require('./src/modules/document/document.service');

async function testSkillsToNeo4j() {
  console.log('🧪 测试技能写入Neo4j图谱...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const docService = app.get(DocumentService);

  // 获取一个已解析的文档
  const docs = await docService.docRepo.find({
    where: { status: 'parsed' },
    order: { createdAt: 'DESC' },
    take: 1,
  });

  if (docs.length === 0) {
    console.log('❌ 没有找到已解析的文档');
    return;
  }

  const doc = docs[0];
  console.log(`📄 文档: ${doc.originalFilename} (${doc.docType})`);
  console.log(`   ID: ${doc.id}`);
  console.log(`   状态: ${doc.status}`);

  // 获取该文档的所有技能
  const docSkills = await docService.getDocumentSkills(doc.id);
  console.log(`\n📊 技能统计:`);
  console.log(`   总计: ${docSkills.length} 个技能`);

  // 区分mapped和unmatched
  const parsedJson = doc.parsedJson as any;
  const unmatchedSkills = parsedJson?.unmatchedSkills || [];
  console.log(`   mappedSkills: ${docSkills.length - unmatchedSkills.length} 个`);
  console.log(`   unmatchedSkills: ${unmatchedSkills.length} 个`);

  // 显示unmatched技能
  if (unmatchedSkills.length > 0) {
    console.log(`\n🔧 unmatched技能:`);
    for (const skill of unmatchedSkills.slice(0, 10)) {
      console.log(`   - ${skill.name}`);
    }
  }

  // 验证这些技能是否在Neo4j中
  console.log(`\n🔍 验证Neo4j图谱...`);
  const neo4jService = app.get('Neo4jService');

  if (doc.docType === 'resume') {
    const query = `
      MATCH (p:Person {userId: $userId})-[:HAS_SKILL]->(s:Skill)
      RETURN s.id AS skillId, s.name AS skillName
      ORDER BY s.name
      LIMIT 50
    `;
    const result = await neo4jService.run(query, { userId: doc.userId });
    const neo4jSkills = result.records.map(r => ({
      id: r.get('skillId'),
      name: r.get('skillName'),
    }));

    console.log(`   Neo4j中的技能: ${neo4jSkills.length} 个`);
    console.log(`   前10个:`);
    for (const skill of neo4jSkills.slice(0, 10)) {
      console.log(`     - ${skill.name}`);
    }
  }

  console.log('\n✅ 测试完成');
  await app.close();
}

testSkillsToNeo4j().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
