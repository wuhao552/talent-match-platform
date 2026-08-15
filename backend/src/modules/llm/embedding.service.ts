import { Injectable, Logger } from '@nestjs/common';

/**
 * Embedding 服务 — 调用阿里云 text-embedding-v4 获取文本向量，
 * 用于技能语义相似度计算（作为字符串匹配的兜底方案）。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  // API Key 仅从环境变量读取（backend/.env 中配置 EMBEDDING_API_KEY），
  // 避免密钥硬编码在源码中；未配置时 embedding 调用会明确失败并降级为纯字符串匹配。
  private readonly apiKey = process.env.EMBEDDING_API_KEY || '';
  private readonly baseUrl =
    process.env.EMBEDDING_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  private readonly model = process.env.EMBEDDING_MODEL || 'text-embedding-v4';

  // 内存缓存：技能名 → 向量，避免重复调用 API
  private cache = new Map<string, number[]>();

  /**
   * 获取单个文本的 embedding 向量（带缓存）。
   */
  async getEmbedding(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) return cached;

    const vec = await this.callEmbeddingApi([text]);
    this.cache.set(text, vec[0]);
    return vec[0];
  }

  /**
   * 批量获取 embedding 向量（带缓存），减少 API 调用次数。
   */
  async getEmbeddingBatch(texts: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const uncached: string[] = [];
    for (const t of texts) {
      if (this.cache.has(t)) {
        result.set(t, this.cache.get(t)!);
      } else {
        uncached.push(t);
      }
    }

    if (uncached.length > 0) {
      const vectors = await this.callEmbeddingApiBatched(uncached);
      for (let i = 0; i < uncached.length; i++) {
        this.cache.set(uncached[i], vectors[i]);
        result.set(uncached[i], vectors[i]);
      }
    }

    return result;
  }

  /**
   * 计算两个文本的语义余弦相似度（已归一化向量，dot product = cosine）。
   */
  async semanticSimilarity(a: string, b: string): Promise<number> {
    const [va, vb] = await Promise.all([
      this.getEmbedding(a),
      this.getEmbedding(b),
    ]);
    return this.cosineSim(va, vb);
  }

  /**
   * 批量计算一个查询文本与多个候选文本的语义相似度。
   */
  async batchSemanticSimilarity(
    query: string,
    candidates: string[],
  ): Promise<Map<string, number>> {
    const allTexts = [query, ...candidates];
    const embeddings = await this.getEmbeddingBatch(allTexts);
    const queryVec = embeddings.get(query)!;

    const result = new Map<string, number>();
    for (const c of candidates) {
      const cv = embeddings.get(c);
      result.set(c, cv ? this.cosineSim(queryVec, cv) : 0);
    }
    return result;
  }

  // ── 内部方法 ──

  /**
   * 最大 batch size: DashScope text-embedding-v4 限制每次最多 10 条。
   */
  private readonly maxBatchSize = 10;

  private async callEmbeddingApi(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('EMBEDDING_API_KEY 未配置，无法调用 Embedding API');
    }
    const url = `${this.baseUrl}/embeddings`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Embedding API ${response.status}: ${errText.slice(0, 200)}`,
        );
      }

      const data = await response.json();
      return (data.data as Array<{ embedding: number[] }>).map(
        (d) => d.embedding,
      );
    } catch (err) {
      clearTimeout(timeout);
      this.logger.error(`Embedding API 调用失败: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * 自动分批调用 API，每批不超过 maxBatchSize 条，结果按输入顺序拼接。
   */
  private async callEmbeddingApiBatched(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const chunk = texts.slice(i, i + this.maxBatchSize);
      const vectors = await this.callEmbeddingApi(chunk);
      results.push(...vectors);
    }
    return results;
  }

  private cosineSim(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // text-embedding-v4 返回的向量已归一化
  }
}
