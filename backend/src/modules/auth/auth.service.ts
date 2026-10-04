/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 认证服务 - 新增 changePassword 修改密码方法
 */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../user/user.entity';
import type { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      email: dto.email,
      phone: dto.phone,
      city: dto.city,
      companyName: dto.companyName,
    });
    await this.userRepo.save(user);

    const token = this.generateToken(user);
    return { accessToken: token, user: this.sanitizeUser(user) };
  }

  async login(dto: LoginDto) {
    // passwordHash 已配置 select: false，需显式 addSelect 才能读取
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username: dto.username })
      .getOne();
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('账号已被禁用，请联系管理员');
    }

    const token = this.generateToken(user);
    return { accessToken: token, user: this.sanitizeUser(user) };
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    return { user: this.sanitizeUser(user) };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new UnauthorizedException('用户不存在');
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('原密码错误');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
    return { message: '密码修改成功' };
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
