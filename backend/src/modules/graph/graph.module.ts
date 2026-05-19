import { Module } from '@nestjs/common'
import { Neo4jService } from './neo4j.service'
import { GraphController } from './graph.controller'

@Module({
  controllers: [GraphController],
  providers: [Neo4jService],
  exports: [Neo4jService],
})
export class GraphModule {}
