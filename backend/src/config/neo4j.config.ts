import { registerAs } from '@nestjs/config'

export default registerAs('neo4j', () => ({
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || '12345678',
  database: process.env.NEO4J_DATABASE || 'neo4j',
}))
