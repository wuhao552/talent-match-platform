/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 认证控制器 - 新增 PATCH /auth/password 修改密码接口
 */
import { Controller, Post, Patch, Get, Body, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto, RegisterDto, ChangePasswordDto } from './auth.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto)
    return { code: 200, message: '注册成功', data: result }
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto)
    return { code: 200, message: '登录成功', data: result }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async profile(@CurrentUser() user: { id: string }) {
    const result = await this.authService.getProfile(user.id)
    return { code: 200, message: 'ok', data: result }
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(userId, dto.oldPassword, dto.newPassword)
    return { code: 200, message: '密码修改成功', data: result }
  }
}
