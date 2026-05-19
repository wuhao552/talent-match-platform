import { registerAs } from '@nestjs/config'
import type { TypeOrmModuleOptions } from '@nestjs/typeorm'

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'talent_match',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: true, // dev only, disable in production
    logging: false,
  }),
)
