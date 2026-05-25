/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 应用主模块 - 注册 AdminModule 管理后台
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import databaseConfig from './config/database.config'
import neo4jConfig from './config/neo4j.config'
import llmConfig from './config/llm.config'
import { AuthModule } from './modules/auth/auth.module'
import { DocumentModule } from './modules/document/document.module'
import { SkillModule } from './modules/skill/skill.module'
import { GraphModule } from './modules/graph/graph.module'
import { MatchingModule } from './modules/matching/matching.module'
import { LlmModule } from './modules/llm/llm.module'
import { AgentModule } from './agents/agent.module'
import { AdminModule } from './modules/admin/admin.module'

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, neo4jConfig, llmConfig],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => config.get('database')!,
      inject: [ConfigService],
    }),

    // Static files (uploads)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // Feature modules
    AuthModule,
    DocumentModule,
    SkillModule,
    GraphModule,
    MatchingModule,
    LlmModule,
    AgentModule,
    AdminModule,
  ],
})
export class AppModule {}
