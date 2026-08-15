// 必须先于任何模块装饰器求值加载 .env——
// auth/matching/document 等模块在 import 阶段读取 process.env.JWT_SECRET,
// 若此处不先加载,模块级取值永远是 undefined,只能依赖硬编码兜底(不安全)。
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import databaseConfig from './config/database.config';
import llmConfig from './config/llm.config';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentModule } from './modules/document/document.module';
import { SkillModule } from './modules/skill/skill.module';
import { GraphModule } from './modules/graph/graph.module';
import { MatchingModule } from './modules/matching/matching.module';
import { LlmModule } from './modules/llm/llm.module';
import { AgentModule } from './agents/agent.module';
import { AdminModule } from './modules/admin/admin.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { JobModule } from './modules/job/job.module';
import { ApplicationModule } from './modules/application/application.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MessageModule } from './modules/message/message.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, llmConfig],
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
    DashboardModule,
    JobModule,
    ApplicationModule,
    NotificationModule,
    MessageModule,
    AiAssistantModule,
  ],
})
export class AppModule {}
