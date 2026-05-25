/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理后台 DTO - 分页/筛选/状态更新参数校验
 */
import { IsOptional, IsString, IsInt, IsIn, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20
}

export class UserFilterDto extends PaginationDto {
  @IsOptional()
  @IsIn(['individual', 'enterprise', 'admin'])
  role?: string

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string

  @IsOptional()
  @IsString()
  search?: string
}

export class DocumentFilterDto extends PaginationDto {
  @IsOptional()
  @IsIn(['resume', 'job_description'])
  docType?: string

  @IsOptional()
  @IsIn(['uploaded', 'parsing', 'parsed', 'failed'])
  status?: string

  @IsOptional()
  @IsString()
  search?: string
}

export class SkillFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @Type(() => Boolean)
  hasStructuralBreak?: boolean

  @IsOptional()
  @Type(() => Boolean)
  isLowFrequency?: boolean
}

export class MatchFilterDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  minScore?: number

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  maxScore?: number
}

export class LlmLogFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  callType?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @Type(() => Boolean)
  success?: boolean
}

export class TrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 7
}

export class UpdateUserStatusDto {
  @IsString()
  @IsIn(['active', 'disabled'])
  status: string
}
