/**
 * Multer 在某些环境下会把非 ASCII 文件名按 latin1 解码，
 * 这里转回 UTF-8 以保留原始中文文件名。
 */
export function decodeFileName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}
