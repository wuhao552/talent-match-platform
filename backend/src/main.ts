import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableShutdownHooks()

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  })

  app.setGlobalPrefix('api')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const compression = require('compression')
  app.use(compression({
    filter: (req: any, res: any) => {
      // Skip compression for SSE responses — compression buffers output, breaking event-stream
      if (res.getHeader('Content-Type') === 'text/event-stream') return false
      return compression.filter(req, res)
    },
  }))
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  const port = process.env.PORT ?? 3100
  await app.listen(port)
  console.log(`Server running on http://localhost:${port}`)
}
bootstrap()
