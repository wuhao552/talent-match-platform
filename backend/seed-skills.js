const neo4j = require('neo4j-driver');
const { Client } = require('pg');
const fs = require('fs');

async function run() {
  // 1. Clean PostgreSQL
  const pg = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: '123456', database: 'talent_match' });
  await pg.connect();
  await pg.query('DELETE FROM skills');
  console.log('PG skills cleared');
  await pg.end();

  // 2. Clean Neo4j
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', '12345678'));
  const session = driver.session();
  const result = await session.run('MATCH (s:Skill) DETACH DELETE s RETURN COUNT(s) AS c');
  console.log('Neo4j deleted ' + result.records[0].get('c') + ' skill nodes');

  // 3. Load entity_map
  const lines = fs.readFileSync('C:/Users/18967/Desktop/claude/entity_map/entity_map/skill.list', 'utf-8')
    .split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  console.log('Importing ' + lines.length + ' skills...');

  // PostgreSQL
  const pg2 = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: '123456', database: 'talent_match' });
  await pg2.connect();
  for (let i = 0; i < lines.length; i += 500) {
    const batch = lines.slice(i, i + 500);
    const rows = batch.map((name, j) => {
      const id = i + j + 1;
      const escaped = name.replace(/'/g, "''");
      return `(${id}, '${escaped}')`;
    });
    await pg2.query('INSERT INTO skills (id, name) VALUES ' + rows.join(','));
    console.log('PG: ' + Math.min(i + 500, lines.length) + '/' + lines.length);
  }
  await pg2.end();

  // Neo4j
  for (let i = 0; i < lines.length; i += 500) {
    const batch = lines.slice(i, i + 500);
    const params = {};
    const queries = batch.map((name, j) => {
      const key = 'n' + j;
      params[key] = name;
      params['id' + j] = i + j + 1;
      return 'CREATE (:Skill {id: $id' + j + ', name: $' + key + '})';
    });
    await session.run(queries.join('\n'), params);
    console.log('Neo4j: ' + Math.min(i + 500, lines.length) + '/' + lines.length);
  }

  const verify = await session.run('MATCH (s:Skill) RETURN COUNT(s) AS c');
  console.log('Neo4j total: ' + verify.records[0].get('c'));
  await session.close();
  await driver.close();
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });
