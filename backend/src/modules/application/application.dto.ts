import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  jobId: string;

  @IsString()
  resumeDocId: string;

  @IsOptional()
  @IsString()
  coverLetter?: string;

  @IsOptional()
  @IsString()
  matchResultId?: string;
}

export class UpdateApplicationStatusDto {
  @IsIn(['viewed', 'screening', 'interview', 'offer', 'hired', 'rejected'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ApplicationFilterDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}
