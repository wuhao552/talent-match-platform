import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus } from './job.entity';
import {
  CreateJobDto,
  UpdateJobDto,
  UpdateJobStatusDto,
  JobFilterDto,
} from './job.dto';

/** 岗位状态机:draft→published→closed→published;archived 为终态 */
const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['published', 'archived'],
  published: ['closed', 'archived'],
  closed: ['published', 'archived'],
  archived: [],
};

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: '草稿',
  published: '招聘中',
  closed: '已关闭',
  archived: '已归档',
};

@Injectable()
export class JobService {
  constructor(
    @InjectRepository(Job)
    private readonly repo: Repository<Job>,
  ) {}

  async create(enterpriseId: string, dto: CreateJobDto): Promise<Job> {
    const job = this.repo.create({
      ...dto,
      enterpriseId,
      status: 'draft',
    });
    return this.repo.save(job);
  }

  async update(
    id: string,
    enterpriseId: string,
    dto: UpdateJobDto,
  ): Promise<Job> {
    const job = await this.findOwned(id, enterpriseId);
    Object.assign(job, dto);
    return this.repo.save(job);
  }

  async updateStatus(
    id: string,
    enterpriseId: string,
    dto: UpdateJobStatusDto,
  ): Promise<Job> {
    const job = await this.findOwned(id, enterpriseId);
    const target = dto.status as JobStatus;
    if (!JOB_TRANSITIONS[job.status].includes(target)) {
      throw new BadRequestException(
        `不能从 ${JOB_STATUS_LABEL[job.status]} 流转到 ${JOB_STATUS_LABEL[target]}`,
      );
    }
    job.status = target;
    return this.repo.save(job);
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.repo.findOne({ where: { id } });
    if (!job) throw new NotFoundException('岗位不存在');
    return job;
  }

  /** 按 JD 文档 ID 查找关联岗位(匹配结果页投递入口使用) */
  async findByDocumentId(documentId: string): Promise<Job> {
    const job = await this.repo.findOne({ where: { documentId } });
    if (!job) throw new NotFoundException('该职位暂未开放投递');
    return job;
  }

  /** 企业查看自己发布的岗位 */
  async findByEnterprise(enterpriseId: string): Promise<Job[]> {
    return this.repo.find({
      where: { enterpriseId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 个人端:浏览已发布岗位,自动排除已过期 */
  async listPublished(filter: JobFilterDto) {
    const page = filter.page ?? 1;
    const size = filter.size ?? 10;
    const qb = this.repo
      .createQueryBuilder('j')
      .where('j.status = :status', { status: 'published' })
      .andWhere('(j.expires_at IS NULL OR j.expires_at > :now)', {
        now: new Date(),
      });

    if (filter.keyword) {
      qb.andWhere(
        '(j.title ILIKE :kw OR j.description ILIKE :kw OR j.company_name ILIKE :kw)',
        { kw: `%${filter.keyword}%` },
      );
    }
    if (filter.location) {
      qb.andWhere('j.location = :loc', { loc: filter.location });
    }
    if (filter.employmentType) {
      qb.andWhere('j.employment_type = :et', { et: filter.employmentType });
    }
    if (filter.experienceRequired) {
      qb.andWhere('j.experience_required = :exp', {
        exp: filter.experienceRequired,
      });
    }

    qb.orderBy('j.createdAt', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, size };
  }

  async remove(id: string, enterpriseId: string): Promise<void> {
    const job = await this.findOwned(id, enterpriseId);
    await this.repo.remove(job);
  }

  private async findOwned(id: string, enterpriseId: string): Promise<Job> {
    const job = await this.repo.findOne({ where: { id } });
    if (!job) throw new NotFoundException('岗位不存在');
    if (job.enterpriseId !== enterpriseId) {
      throw new ForbiddenException('无权操作此岗位');
    }
    return job;
  }

  /**
   * JD 文档解析完成后,自动同步/创建对应的 Job 记录
   * - 已存在 documentId 关联:用结构化数据更新
   * - 不存在:创建岗位,上传即默认"招聘中"(published),企业可在岗位管理页调整
   * 只填可识别字段,其余字段保留给用户在岗位管理页编辑
   */
  async syncFromDocument(
    docId: string,
    enterpriseId: string,
    structured: any,
  ): Promise<Job | null> {
    if (!structured || typeof structured !== 'object') return null;

    const jobTypeMap: Record<string, Job['employmentType']> = {
      全职: 'full_time',
      全职工作: 'full_time',
      兼职: 'part_time',
      实习: 'internship',
      外包: 'contract',
      合同制: 'contract',
    };
    const employmentType = jobTypeMap[structured.jobType] || 'full_time';

    // 解析薪资范围(如 "15k-25k" / "15000-25000" / "15K-25K·14薪")
    let salaryMin: number | undefined;
    let salaryMax: number | undefined;
    if (typeof structured.salaryRange === 'string') {
      const m = structured.salaryRange.match(
        /(\d[\d,]*)\s*[kK]?\s*[-~到]\s*(\d[\d,]*)\s*[kK]?/,
      );
      if (m) {
        const lo = parseFloat(m[1].replace(/,/g, ''));
        const hi = parseFloat(m[2].replace(/,/g, ''));
        const isK = /[kK]/.test(structured.salaryRange);
        salaryMin = isK ? lo * 1000 : lo;
        salaryMax = isK ? hi * 1000 : hi;
      }
    }

    const title =
      (structured.jobTitle as string) ||
      (structured.title as string) ||
      '未命名岗位';
    const description = Array.isArray(structured.responsibilities)
      ? structured.responsibilities.join('\n')
      : (structured.summary as string) ||
        (structured.description as string) ||
        '';

    const requirements: Record<string, unknown> = {
      requirements: structured.requirements || [],
      benefits: structured.benefits || [],
      companyIndustry: structured.companyIndustry || null,
      companySize: structured.companySize || null,
    };

    const existing = await this.repo.findOne({ where: { documentId: docId } });
    if (existing) {
      // 更新已有 Job 的可识别字段(保留 status / enterpriseNote 等用户编辑字段)
      existing.title = title;
      existing.companyName = structured.companyName || existing.companyName;
      existing.department = structured.department || existing.department;
      existing.description = description || existing.description;
      existing.requirements = requirements;
      existing.location = structured.location || existing.location;
      existing.experienceRequired =
        structured.experienceRequired || existing.experienceRequired;
      existing.educationRequired =
        structured.educationRequired || existing.educationRequired;
      existing.employmentType = employmentType;
      if (salaryMin !== undefined) existing.salaryMin = salaryMin;
      if (salaryMax !== undefined) existing.salaryMax = salaryMax;
      return this.repo.save(existing);
    }

    const job = this.repo.create({
      enterpriseId,
      documentId: docId,
      title,
      companyName: structured.companyName || undefined,
      department: structured.department || undefined,
      description,
      requirements,
      location: structured.location || undefined,
      salaryMin,
      salaryMax,
      salaryUnit: 'month',
      experienceRequired: structured.experienceRequired || undefined,
      educationRequired: structured.educationRequired || undefined,
      employmentType,
      headcount: 1,
      // 上传 JD 即默认招聘中,无需企业再手动发布
      status: 'published',
    });
    return this.repo.save(job);
  }
}
