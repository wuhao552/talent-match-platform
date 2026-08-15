import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import type { NotificationType } from './notification.entity';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsIn(['system', 'match', 'application', 'message', 'job'])
  type: NotificationType;

  @IsString()
  @MaxLength(128)
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  relatedId?: string;

  @IsOptional()
  @IsString()
  relatedType?: string;
}

export class BroadcastNotificationDto {
  @IsIn(['system', 'match', 'application', 'message', 'job'])
  type: NotificationType;

  @IsString()
  @MaxLength(128)
  title: string;

  @IsString()
  content: string;
}
