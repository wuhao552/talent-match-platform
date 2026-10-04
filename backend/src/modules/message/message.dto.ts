import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @IsString()
  receiverId: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;
}

export class SendMessageDto {
  /** 二选一:已有会话直接用 conversationId */
  @IsOptional()
  @IsString()
  conversationId?: string;

  /** 或通过 receiverId 自动创建会话 */
  @IsOptional()
  @IsString()
  receiverId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsString()
  jobId?: string;
}

export class MessageListDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}
