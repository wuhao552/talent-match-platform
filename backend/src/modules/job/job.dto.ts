import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJobDto {
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  companyName?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsString()
  description: string;

  @IsOptional()
  requirements?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  salaryUnit?: string;

  @IsOptional()
  @IsString()
  experienceRequired?: string;

  @IsOptional()
  @IsString()
  educationRequired?: string;

  @IsOptional()
  @IsIn(['full_time', 'part_time', 'internship', 'contract'])
  employmentType?: 'full_time' | 'part_time' | 'internship' | 'contract';

  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  expiresAt?: Date;

  @IsOptional()
  @IsString()
  documentId?: string;
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  companyName?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  requirements?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  salaryUnit?: string;

  @IsOptional()
  @IsString()
  experienceRequired?: string;

  @IsOptional()
  @IsString()
  educationRequired?: string;

  @IsOptional()
  @IsIn(['full_time', 'part_time', 'internship', 'contract'])
  employmentType?: 'full_time' | 'part_time' | 'internship' | 'contract';

  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  expiresAt?: Date;
}

export class UpdateJobStatusDto {
  @IsIn(['draft', 'published', 'closed', 'archived'])
  status: string;
}

export class JobFilterDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  employmentType?: string;

  @IsOptional()
  @IsString()
  experienceRequired?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}
