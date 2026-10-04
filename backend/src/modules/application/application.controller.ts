import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApplicationService } from './application.service';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  ApplicationFilterDto,
} from './application.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationController {
  constructor(private applicationService: ApplicationService) {}

  /** 个人:投递岗位 */
  @Post()
  @Roles('individual')
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    const data = await this.applicationService.create(userId, dto);
    return { code: 200, message: '投递成功', data };
  }

  /** 个人:我的投递列表 */
  @Get()
  @Roles('individual')
  async myList(
    @CurrentUser('id') userId: string,
    @Query() query: ApplicationFilterDto,
  ) {
    const data = await this.applicationService.listForApplicant(userId, query);
    return { code: 200, message: 'ok', data };
  }

  /** 企业:某岗位的投递列表(必须在 :id 之前注册) */
  @Get('by-job/:jobId')
  @Roles('enterprise', 'admin')
  async listForJob(
    @Param('jobId') jobId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ApplicationFilterDto,
  ) {
    const data = await this.applicationService.listForJob(jobId, userId, query);
    return { code: 200, message: 'ok', data };
  }

  /** 企业:我的所有投递(必须在 :id 之前注册) */
  @Get('enterprise/all')
  @Roles('enterprise', 'admin')
  async listForEnterprise(
    @CurrentUser('id') userId: string,
    @Query() query: ApplicationFilterDto,
  ) {
    const data = await this.applicationService.listForEnterprise(userId, query);
    return { code: 200, message: 'ok', data };
  }

  /** 投递详情(校验归属:投递者本人或岗位所属企业,admin 可看) */
  @Get(':id')
  @Roles('individual', 'enterprise', 'admin')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const app = await this.applicationService.findOneForUser(
      id,
      user.id,
      user.role,
    );
    return { code: 200, message: 'ok', data: app };
  }

  /** 个人:撤回投递 */
  @Patch(':id/withdraw')
  @Roles('individual')
  async withdraw(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const data = await this.applicationService.withdraw(id, userId);
    return { code: 200, message: '已撤回投递', data };
  }

  /** 企业:更新投递状态 */
  @Patch(':id/status')
  @Roles('enterprise', 'admin')
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    const data = await this.applicationService.updateStatus(id, userId, dto);
    return { code: 200, message: '投递状态已更新', data };
  }
}
