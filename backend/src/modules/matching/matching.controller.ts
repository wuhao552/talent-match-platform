import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { MatchingService } from './matching.service'

@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private matchingService: MatchingService) {}

  @Post('calculate')
  async calculate(
    @Body() body: { resumeDocId: string; jobDocId: string },
  ) {
    const data = await this.matchingService.calculateMatch(
      body.resumeDocId,
      body.jobDocId,
      { useLLM: true },
    )
    return { code: 200, message: '匹配完成', data }
  }

  @Post('recommend')
  async recommend(@CurrentUser() user: { id: string; role: string }) {
    const data = await this.matchingService.recommend(user.id, user.role)
    return { code: 200, message: 'ok', data }
  }

  @Get('results')
  async getResults(@CurrentUser() user: { id: string }) {
    const data = await this.matchingService.getResults(user.id)
    return { code: 200, message: 'ok', data }
  }

  @Get('results/:id')
  async getResult(@Param('id') id: string) {
    const data = await this.matchingService.getResult(id)
    return { code: 200, message: 'ok', data }
  }

  @Get('by-job/:jobDocId')
  async getByJob(@Param('jobDocId') jobDocId: string) {
    const data = await this.matchingService.getMatchesByJob(jobDocId)
    return { code: 200, message: 'ok', data }
  }

  @Get('by-resume/:resumeDocId')
  async getByResume(@Param('resumeDocId') resumeDocId: string) {
    const data = await this.matchingService.getMatchesByResume(resumeDocId)
    return { code: 200, message: 'ok', data }
  }
}
