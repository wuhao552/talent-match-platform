import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkillService } from './skill.service';

@Controller('skills')
@UseGuards(JwtAuthGuard)
export class SkillController {
  constructor(private skillService: SkillService) {}

  @Get()
  async list(@Query('page') page?: string, @Query('search') search?: string) {
    const data = await this.skillService.findAll({
      page: page ? parseInt(page) : 1,
      pageSize: 20,
      search,
    });
    return { code: 200, message: 'ok', data };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const data = await this.skillService.findById(parseInt(id));
    return { code: 200, message: 'ok', data };
  }

  @Get(':id/related')
  async getRelated() {
    const ids = await this.skillService.getRelatedSkills()
    const data = await this.skillService.findByIds(ids)
    return { code: 200, message: 'ok', data }
  }

  @Get(':id/frequency')
  async getFrequency() {
    const data = await this.skillService.getFrequency()
    return { code: 200, message: 'ok', data }
  }
}
