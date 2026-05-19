import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import { User } from '../user/user.entity'
import type { LoginDto, RegisterDto } from './auth.dto'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { username: dto.username } })
    if (existing) {
      throw new ConflictException('用户名已存在')
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = this.userRepo.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      email: dto.email,
      phone: dto.phone,
      city: dto.city,
      companyName: dto.companyName,
    })
    await this.userRepo.save(user)

    const token = this.generateToken(user)
    return { accessToken: token, user: this.sanitizeUser(user) }
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { username: dto.username } })
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const token = this.generateToken(user)
    return { accessToken: token, user: this.sanitizeUser(user) }
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('用户不存在')
    return { user: this.sanitizeUser(user) }
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, username: user.username, role: user.role })
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...rest } = user
    return rest
  }
}
