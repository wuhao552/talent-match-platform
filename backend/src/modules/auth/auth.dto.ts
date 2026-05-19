import { IsString, IsIn, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator'

export class LoginDto {
  @IsString()
  @MinLength(2)
  username: string

  @IsString()
  @MinLength(4)
  password: string
}

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  username: string

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password: string

  @IsString()
  @IsIn(['individual', 'enterprise'])
  role: 'individual' | 'enterprise'

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  companyName?: string
}
