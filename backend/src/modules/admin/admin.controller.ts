/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台控制器 - 17 个接口: 统计/用户/文档/技能/匹配/LLM日志
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import {
  UserFilterDto,
  DocumentFilterDto,
  SkillFilterDto,
  MatchFilterDto,
  LlmLogFilterDto,
  TrendQueryDto,
  UpdateUserStatusDto,
} from './admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    const data = await this.adminService.getStats();
    return { code: 200, message: 'ok', data };
  }

  @Get('stats/trend')
  async getStatsTrend(@Query() query: TrendQueryDto) {
    const data = await this.adminService.getStatsTrend(query.days || 7);
    return { code: 200, message: 'ok', data };
  }

  @Get('users')
  async getUsers(@Query() query: UserFilterDto) {
    const data = await this.adminService.getUsers(query);
    return { code: 200, message: 'ok', data };
  }

  @Get('users/:id')
  async getUserDetail(@Param('id') id: string) {
    const data = await this.adminService.getUserDetail(id);
    return { code: 200, message: 'ok', data };
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() body: UpdateUserStatusDto,
    @CurrentUser('id') adminId: string,
  ) {
    const data = await this.adminService.updateUserStatus(
      id,
      body.status,
      adminId,
    );
    return { code: 200, message: '状态更新成功', data };
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    await this.adminService.deleteUser(id, adminId);
    return { code: 200, message: '用户已删除', data: null };
  }

  @Get('documents')
  async getDocuments(@Query() query: DocumentFilterDto) {
    const data = await this.adminService.getDocuments(query);
    return { code: 200, message: 'ok', data };
  }

  @Get('documents/:id')
  async getDocumentDetail(@Param('id') id: string) {
    const data = await this.adminService.getDocumentDetail(id);
    return { code: 200, message: 'ok', data };
  }

  @Post('documents/:id/reparse')
  async reparseDocument(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    const data = await this.adminService.reparseDocument(id, adminId);
    return { code: 200, message: '重新解析已触发', data };
  }

  @Delete('documents/:id')
  async deleteDocument(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    await this.adminService.deleteDocument(id, adminId);
    return { code: 200, message: '文档已删除', data: null };
  }

  @Get('skills')
  async getSkills(@Query() query: SkillFilterDto) {
    const data = await this.adminService.getSkills(query);
    return { code: 200, message: 'ok', data };
  }

  @Get('skills/stats')
  async getSkillsStats() {
    const data = await this.adminService.getSkillsStats();
    return { code: 200, message: 'ok', data };
  }

  @Get('matching/results')
  async getMatchResults(@Query() query: MatchFilterDto) {
    const data = await this.adminService.getMatchResults(query);
    return { code: 200, message: 'ok', data };
  }

  @Get('matching/results/:id')
  async getMatchResultDetail(@Param('id') id: string) {
    const data = await this.adminService.getMatchResultDetail(id);
    return { code: 200, message: 'ok', data };
  }

  @Get('llm-logs')
  async getLlmLogs(@Query() query: LlmLogFilterDto) {
    const data = await this.adminService.getLlmLogs(query);
    return { code: 200, message: 'ok', data };
  }

  @Get('llm-logs/stats')
  async getLlmLogsStats() {
    const data = await this.adminService.getLlmStats();
    return { code: 200, message: 'ok', data };
  }

  @Get('llm-logs/:id')
  async getLlmLogDetail(@Param('id') id: string) {
    const data = await this.adminService.getLlmLogDetail(id);
    return { code: 200, message: 'ok', data };
  }
}
