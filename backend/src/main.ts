import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });

  app.setGlobalPrefix('api');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const compression = require('compression');
  app.use(
    compression({
      filter: (req: any, res: any) => {
        // Skip compression for SSE responses — compression buffers output, breaking event-stream。
        // 注意:中间件阶段 Content-Type 尚未设置,需按 Accept 头(EventSource 会发送
        // Accept: text/event-stream)或已写入的 header 判断,不能只看 res.getHeader()。
        const accept = String(req.headers?.accept || '');
        if (accept.includes('text/event-stream')) return false;
        if (res.getHeader('Content-Type') === 'text/event-stream') return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT ?? 3100;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();
