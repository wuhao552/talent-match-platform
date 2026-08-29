import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';

export interface SseUser {
  userId: string;
  role?: string;
}

/**
 * SSE 场景无法通过 Authorization 头携带 JWT，统一从 query 解析 token。
 * 失败时直接写入 401 JSON 响应并返回 null。
 */
export function verifySseUser(
  jwtService: JwtService,
  token: string | undefined,
  res: Response,
): SseUser | null {
  if (!token) {
    res.status(401).json({ code: 401, message: '缺少 token' });
    return null;
  }

  try {
    const payload = jwtService.verify<{
      sub?: string;
      id?: string;
      role?: string;
    }>(token);
    const userId = payload.sub || payload.id;
    if (!userId) {
      res.status(401).json({ code: 401, message: 'token 无效' });
      return null;
    }
    return { userId, role: payload.role };
  } catch {
    res.status(401).json({ code: 401, message: 'token 无效' });
    return null;
  }
}

export function setupSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function sendSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
