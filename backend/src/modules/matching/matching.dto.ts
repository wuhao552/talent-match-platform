import { IsUUID } from 'class-validator';

export class CalculateMatchDto {
  @IsUUID()
  resumeDocId: string;

  @IsUUID()
  jobDocId: string;
}
