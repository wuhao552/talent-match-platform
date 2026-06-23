import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres', // KingbaseES pg 兼容模式，使用 postgres 驱动
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '54321', 10),
    username: process.env.DB_USERNAME || 'system',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'talent_match',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false, // 已手动同步 schema，避免有数据时列约束约束变更失败
    logging: false,
    poolSize: 25,
    extra: {
      max: 25,
      // 空闲连接超时：KingbaseES 默认 tcp_keepalives_idle 较短，
      // 需要客户端主动保活，避免事务执行中连接被服务端断开
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      options: '-c search_path=public',
    },
  }),
);
