import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET 环境变量未配置，请在 backend/.env 中设置');
}

/**
 * 统一 JWT 配置，供需要 JwtService / JwtModule 的模块导入。
 * 避免各业务模块各自注册 JwtModule 导致配置不一致。
 */
@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  exports: [JwtModule],
})
export class JwtConfigModule {}
