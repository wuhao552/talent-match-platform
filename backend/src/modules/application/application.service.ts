import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Application,
  ApplicationStatus,
  StatusChange,
} from './application.entity';
import { Job } from '../job/job.entity';
import { NotificationService } from '../notification/notification.service';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  ApplicationFilterDto,
} from './application.dto';

/** 合法的状态流转 */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['viewed', 'withdrawn'],
  viewed: ['screening', 'rejected', 'withdrawn'],
  screening: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected'],
  offer: ['hired', 'rejected'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: '已投递',
  viewed: '已查看',
  screening: '筛选中',
  interview: '面试中',
  offer: '已发offer',
  hired: '已录用',
  rejected: '已拒绝',
  withdrawn: '已撤回',
};

@Injectable()
export class ApplicationService {
  constructor(
    @InjectRepository(Application)
    private readonly repo: Repository<Application>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly notificationService: NotificationService,
  ) {}

  /** 个人投递岗位 */
  async create(
    applicantId: string,
    dto: CreateApplicationDto,
  ): Promise<Application> {
    const job = await this.jobRepo.findOne({ where: { id: dto.jobId } });
    if (!job) throw new NotFoundException('岗位不存在');
    if (job.status !== 'published') {
      throw new BadRequestException('该岗位未在招聘中');
    }
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new BadRequestException('该岗位已截止投递');
    }
    if (job.enterpriseId === applicantId) {
      throw new BadRequestException('不能投递自己发布的岗位');
    }

    // 防重复投递(唯一约束兜底)
    const existing = await this.repo.findOne({
      where: { jobId: dto.jobId, applicantId },
    });
    if (existing) {
      throw new ConflictException('您已投递过该岗位');
    }

    const initialChange: StatusChange = {
      status: 'submitted',
      at: new Date().toISOString(),
      by: applicantId,
    };

    const app = this.repo.create({
      ...dto,
      applicantId,
      status: 'submitted',
      statusHistory: [initialChange],
    });

    let saved: Application;
    try {
      saved = await this.repo.save(app);
    } catch (err) {
      // 并发投递撞上唯一约束时返回 409 而不是 500
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException('您已投递过该岗位');
      }
      throw err;
    }

    // 通知企业(通知失败不影响投递本身,仅记录日志)
    this.notificationService
      .send({
        userId: job.enterpriseId,
        type: 'application',
        title: '收到新的岗位投递',
        content: `有候选人投递了「${job.title}」岗位`,
        relatedId: saved.id,
        relatedType: 'application',
      })
      .catch((err) =>
        console.error(
          `[Application] Notification failed for ${saved.id}:`,
          (err as Error).message,
        ),
      );

    return saved;
  }

  /** 投递详情(带归属校验):投递者本人或岗位所属企业可看,admin 放行 */
  async findOneForUser(
    id: string,
    userId: string,
    role: string,
  ): Promise<Application> {
    const app = await this.repo.findOne({
      where: { id },
      relations: ['job'],
    });
    if (!app) throw new NotFoundException('投递记录不存在');
    if (role === 'admin') return app;
    if (app.applicantId === userId) return app;
    if (app.job && app.job.enterpriseId === userId) return app;
    throw new ForbiddenException('无权查看此投递记录');
  }

  /** 个人:我的投递列表(带岗位信息) */
  async listForApplicant(applicantId: string, filter: ApplicationFilterDto) {
    const page = filter.page ?? 1;
    const size = filter.size ?? 10;
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.job', 'job')
      .where('a.applicantId = :applicantId', { applicantId })
      .orderBy('a.createdAt', 'DESC');

    if (filter.status) {
      qb.andWhere('a.status = :status', { status: filter.status });
    }

    const [items, total] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return { items, total, page, size };
  }

  /** 企业:某岗位的投递列表(带申请人信息) */
  async listForJob(
    jobId: string,
    enterpriseId: string,
    filter: ApplicationFilterDto,
  ) {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('岗位不存在');
    if (job.enterpriseId !== enterpriseId) {
      throw new ForbiddenException('无权查看此岗位的投递');
    }

    const page = filter.page ?? 1;
    const size = filter.size ?? 10;
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.applicant', 'applicant')
      .where('a.jobId = :jobId', { jobId })
      .orderBy('a.createdAt', 'DESC');

    if (filter.status) {
      qb.andWhere('a.status = :status', { status: filter.status });
    }

    const [items, total] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return { items, total, page, size };
  }

  /** 企业:我的所有投递(跨岗位,带岗位+申请人) */
  async listForEnterprise(enterpriseId: string, filter: ApplicationFilterDto) {
    const page = filter.page ?? 1;
    const size = filter.size ?? 10;
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.job', 'job')
      .leftJoinAndSelect('a.applicant', 'applicant')
      .where('job.enterpriseId = :enterpriseId', { enterpriseId })
      .orderBy('a.createdAt', 'DESC');

    if (filter.status) {
      qb.andWhere('a.status = :status', { status: filter.status });
    }
    if (filter.jobId) {
      qb.andWhere('a.jobId = :jobId', { jobId: filter.jobId });
    }

    const [items, total] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return { items, total, page, size };
  }

  /** 企业:更新投递状态 */
  async updateStatus(
    id: string,
    enterpriseId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<Application> {
    const app = await this.repo.findOne({
      where: { id },
      relations: ['job'],
    });
    if (!app) throw new NotFoundException('投递记录不存在');
    if (app.job.enterpriseId !== enterpriseId) {
      throw new ForbiddenException('无权操作此投递');
    }

    const target = dto.status as ApplicationStatus;
    const current = app.status;
    if (!TRANSITIONS[current].includes(target)) {
      throw new BadRequestException(
        `不能从 ${STATUS_LABEL[current]} 流转到 ${STATUS_LABEL[target]}`,
      );
    }

    const change: StatusChange = {
      status: target,
      at: new Date().toISOString(),
      by: enterpriseId,
      note: dto.note,
    };
    app.status = target;
    app.statusHistory = [...(app.statusHistory || []), change];
    if (dto.note) {
      app.enterpriseNote = dto.note;
    }
    const saved = await this.repo.save(app);

    // 通知候选人
    await this.notificationService.send({
      userId: app.applicantId,
      type: 'application',
      title: '投递状态更新',
      content: `您投递的「${app.job.title}」岗位状态更新为:${STATUS_LABEL[target]}`,
      relatedId: app.id,
      relatedType: 'application',
    });

    return saved;
  }

  /** 个人:撤回投递 */
  async withdraw(id: string, applicantId: string): Promise<Application> {
    const app = await this.repo.findOne({
      where: { id },
      relations: ['job'],
    });
    if (!app) throw new NotFoundException('投递记录不存在');
    if (app.applicantId !== applicantId) {
      throw new ForbiddenException('无权操作此投递');
    }
    const current = app.status;
    if (!TRANSITIONS[current].includes('withdrawn')) {
      throw new BadRequestException(
        `当前状态 ${STATUS_LABEL[current]} 不可撤回`,
      );
    }

    const change: StatusChange = {
      status: 'withdrawn',
      at: new Date().toISOString(),
      by: applicantId,
    };
    app.status = 'withdrawn';
    app.statusHistory = [...(app.statusHistory || []), change];
    return this.repo.save(app);
  }

  /** 岗位收到的投递计数 */
  async countByJob(jobId: string): Promise<number> {
    return this.repo.count({ where: { jobId } });
  }
}
