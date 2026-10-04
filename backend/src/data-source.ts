import 'reflect-metadata';
import { DataSource } from 'typeorm';

// TypeORM CLI 需要独立的数据源；加载本地 .env 变量
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_DATABASE || 'talent_match',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
  extra: {
    max: 25,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    options: '-c search_path=public',
  },
});
