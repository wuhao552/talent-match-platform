import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JobService } from './job.service';
import {
  CreateJobDto,
  UpdateJobDto,
  UpdateJobStatusDto,
  JobFilterDto,
} from './job.dto';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobController {
  constructor(private jobService: JobService) {}

  /** 企业发布岗位 */
  @Post()
  @Roles('enterprise', 'admin')
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateJobDto) {
    const data = await this.jobService.create(userId, dto);
    return { code: 200, message: '岗位发布成功', data };
  }

  /** 个人端:浏览已发布岗位(管理员也可访问) */
  @Get()
  @Roles('individual', 'enterprise', 'admin')
  async list(@Query() query: JobFilterDto) {
    const data = await this.jobService.listPublished(query);
    return { code: 200, message: 'ok', data };
  }

  /** 企业:我的岗位列表(必须在 :id 之前注册) */
  @Get('mine/list')
  @Roles('enterprise', 'admin')
  async mine(@CurrentUser('id') userId: string) {
    const data = await this.jobService.findByEnterprise(userId);
    return { code: 200, message: 'ok', data };
  }

  /** 按 JD 文档 ID 查找岗位(匹配结果页投递入口使用,任何登录用户可查) */
  @Get('by-document/:documentId')
  @Roles('individual', 'enterprise', 'admin')
  async getByDocument(@Param('documentId') documentId: string) {
    const data = await this.jobService.findByDocumentId(documentId);
    return { code: 200, message: 'ok', data };
  }

  /** 岗位详情(已发布或本人/管理员可查) */
  @Get(':id')
  @Roles('individual', 'enterprise', 'admin')
  async detail(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const job = await this.jobService.findOne(id);
    // 非发布状态的岗位只有本人或管理员可查
    if (
      job.status !== 'published' &&
      job.enterpriseId !== userId &&
      role !== 'admin'
    ) {
      throw new NotFoundException('岗位不存在');
    }
    return { code: 200, message: 'ok', data: job };
  }

  /** 企业:更新岗位 */
  @Patch(':id')
  @Roles('enterprise', 'admin')
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateJobDto,
  ) {
    const data = await this.jobService.update(id, userId, dto);
    return { code: 200, message: '岗位更新成功', data };
  }

  /** 企业:上下架 */
  @Patch(':id/status')
  @Roles('enterprise', 'admin')
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    const data = await this.jobService.updateStatus(id, userId, dto);
    return { code: 200, message: '岗位状态已更新', data };
  }

  /** 企业:删除岗位 */
  @Delete(':id')
  @Roles('enterprise', 'admin')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.jobService.remove(id, userId);
    return { code: 200, message: '岗位已删除', data: null };
  }
}
