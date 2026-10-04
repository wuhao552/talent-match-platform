/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台模块 - 注册实体/控制器/服务，导入 DocumentModule
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { Document } from '../document/document.entity';
import { Skill } from '../skill/skill.entity';
import { MatchResult } from '../matching/match-result.entity';
import { LlmLog } from '../llm/llm-log.entity';
import { AdminAuditLog } from './admin-audit-log.entity';
import { Job } from '../job/job.entity';
import { Application } from '../application/application.entity';
import { Notification } from '../notification/notification.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DocumentModule } from '../document/document.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Document,
      Skill,
      MatchResult,
      LlmLog,
      AdminAuditLog,
      Job,
      Application,
      Notification,
    ]),
    DocumentModule,
    NotificationModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
