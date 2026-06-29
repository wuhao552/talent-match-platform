import { Injectable } from '@nestjs/common';
import { DocumentParserAgent } from './document-parser.agent';
import { SkillExtractorAgent } from './skill-extractor.agent';
import { SkillMatcherService } from '../modules/skill/skill-matcher.service';
import type { AgentResult } from './agent.interface';

export interface PipelineStep {
  agent: string;
  status: 'pending' | 'running' | 'done' | 'error';
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}

export type ProgressCallback = (step: PipelineStep) => void;
export type ChunkCallback = (agent: string, token: string) => void;

@Injectable()
export class OrchestratorAgent {
  constructor(
    private docParser: DocumentParserAgent,
    private skillExtractor: SkillExtractorAgent,
    private skillMatcher: SkillMatcherService,
  ) {}

  async runParsePipeline(document: {
    id: string;
    userId: string;
    docType: string;
    filePath: string;
    fileFormat: string;
  }): Promise<AgentResult> {
    return this.runParsePipelineStream(document, undefined);
  }

  async runParsePipelineStream(
    document: {
      id: string;
      userId: string;
      docType: string;
      filePath: string;
      fileFormat: string;
    },
    onProgress?: ProgressCallback,
    onChunk?: ChunkCallback,
  ): Promise<AgentResult> {
    const sessionId = `parse-${document.id}`;
    const collectedSteps: PipelineStep[] = [];
    const emit = (step: PipelineStep) => {
      collectedSteps.push(step);
      onProgress?.(step);
    };

    // Step 0: Extract raw text (prerequisite for both agents)
    emit({
      agent: 'text_extractor',
      status: 'running',
      summary: '正在读取文档文本...',
      timestamp: Date.now(),
    });

    let parsedText: string;
    try {
      parsedText = await this.docParser.extractText(
        document.filePath,
        document.fileFormat,
      );
    } catch (err) {
      emit({
        agent: 'text_extractor',
        status: 'error',
        summary: '文档读取失败',
        error: (err as Error).message,
        timestamp: Date.now(),
      });
      return {
        success: false,
        data: {},
        summary: '文档读取失败',
        error: (err as Error).message,
      };
    }

    if (!parsedText || parsedText.trim().length === 0) {
      emit({
        agent: 'text_extractor',
        status: 'error',
        summary: '文档内容为空',
        error: '文件解析后无文本内容',
        timestamp: Date.now(),
      });
      return {
        success: false,
        data: {},
        summary: '文档内容为空',
        error: '文件解析后无文本内容',
      };
    }

    emit({
      agent: 'text_extractor',
      status: 'done',
      summary: `文本提取完成: ${parsedText.length} 字符`,
      data: { textLength: parsedText.length, textPreview: parsedText },
      timestamp: Date.now(),
    });

    // Step 1: Run DocumentParser and SkillExtractor in parallel
    emit({
      agent: 'document_parser',
      status: 'running',
      summary: '正在结构化解析文档...',
      timestamp: Date.now(),
    });
    emit({
      agent: 'skill_extractor',
      status: 'running',
      summary: '正在提取技能标签...',
      timestamp: Date.now(),
    });

    const [parseSettled, extractSettled] = await Promise.allSettled([
      this.docParser.execute({
        sessionId,
        userId: document.userId,
        input: { rawText: parsedText, docType: document.docType },
        onChunk: onChunk
          ? (t: string) => onChunk('document_parser', t)
          : undefined,
      }),
      this.skillExtractor.execute({
        sessionId,
        userId: document.userId,
        input: { parsedText, docType: document.docType },
        onChunk: onChunk
          ? (t: string) => onChunk('skill_extractor', t)
          : undefined,
      }),
    ]);

    // Process DocumentParser result
    let parseResult: AgentResult;
    if (parseSettled.status === 'fulfilled') {
      parseResult = parseSettled.value;
      const parsedJson = parseResult.data['parsedJson'] as Record<
        string,
        unknown
      > | null;
      const llmParseDetail = parseResult.data['llmParseDetail'];

      if (parseResult.success) {
        emit({
          agent: 'document_parser',
          status: 'done',
          summary: `文档结构化解析完成`,
          data: {
            structured: parsedJson,
            ...(llmParseDetail
              ? {
                  model: (llmParseDetail as any).model,
                  latencyMs: (llmParseDetail as any).latencyMs,
                  rawResponse: (llmParseDetail as any).rawResponse,
                }
              : {}),
          },
          timestamp: Date.now(),
        });
      } else {
        emit({
          agent: 'document_parser',
          status: 'error',
          summary: '文档解析失败',
          error: parseResult.error,
          timestamp: Date.now(),
        });
      }
    } else {
      parseResult = {
        success: false,
        data: {},
        summary: '文档解析异常',
        error: parseSettled.reason?.message || String(parseSettled.reason),
      };
      emit({
        agent: 'document_parser',
        status: 'error',
        summary: '文档解析异常',
        error: parseResult.error,
        timestamp: Date.now(),
      });
    }

    // Process SkillExtractor result
    let extractedSkills: Array<{ name: string; proficiency: string }> = [];
    let skillLlmDetail = null;

    if (extractSettled.status === 'fulfilled') {
      const extractResult = extractSettled.value;
      if (extractResult.success) {
        extractedSkills = (extractResult.data['skills'] as any[]) || [];
        skillLlmDetail = extractResult.data['llmDetail'];
        emit({
          agent: 'skill_extractor',
          status: 'done',
          summary: `提取 ${extractedSkills.length} 个技能标签`,
          data: {
            skillCount: extractedSkills.length,
            skills: extractedSkills.map((s: any) => ({
              name: s.name,
              proficiency: s.proficiency,
            })),
            ...(skillLlmDetail
              ? {
                  model: (skillLlmDetail as any).model,
                  latencyMs: (skillLlmDetail as any).latencyMs,
                  rawResponse: (skillLlmDetail as any).rawResponse,
                }
              : {}),
          },
          timestamp: Date.now(),
        });
      } else {
        emit({
          agent: 'skill_extractor',
          status: 'error',
          summary: '技能提取失败',
          error: extractResult.error,
          timestamp: Date.now(),
        });
      }
    } else {
      emit({
        agent: 'skill_extractor',
        status: 'error',
        summary: '技能提取异常',
        error: extractSettled.reason?.message || String(extractSettled.reason),
        timestamp: Date.now(),
      });
    }

    // Step 2: Map extracted names to canonical skill IDs via string matching
    emit({
      agent: 'skill_matcher',
      status: 'running',
      summary: `正在匹配 ${extractedSkills.length} 个技能到标准库...`,
      timestamp: Date.now(),
    });

    const mappedSkills: {
      skillId: number;
      proficiency: string;
      name: string;
    }[] = [];
    const seenSkillIds = new Set<number>();
    const matchingLogs: Array<{
      extracted: string;
      canonical: string | null;
      confidence: number;
      method: string;
    }> = [];

    // ── 逐个匹配并推送进度 ──
    for (let i = 0; i < extractedSkills.length; i++) {
      const s = extractedSkills[i];
      const { result: match, log } = await this.skillMatcher.match(s.name);
      matchingLogs.push(log);

      if (match) {
        if (!seenSkillIds.has(match.id)) {
          seenSkillIds.add(match.id);
          mappedSkills.push({
            skillId: match.id,
            proficiency: s.proficiency,
            name: match.name,
          });
        }
      }

      // 每完成一个技能的匹配，推送一次进度事件（含详细信息）
      emit({
        agent: 'skill_matcher',
        status: 'running',
        summary: `[${i + 1}/${extractedSkills.length}] 匹配中...`,
        data: {
          current: i + 1,
          total: extractedSkills.length,
          matchDetail: {
            extracted: log.extracted,
            canonical: log.canonical,
            confidence: log.confidence,
            method: log.method,
            matched: !!match,
            proficiency: s.proficiency,
          },
          logs: [...matchingLogs],
        },
        timestamp: Date.now(),
      });
    }

    // 统计各匹配方法的数量
    const methodCounts = new Map<string, number>();
    for (const log of matchingLogs) {
      methodCounts.set(log.method, (methodCounts.get(log.method) || 0) + 1);
    }
    const methodSummary = Object.fromEntries(methodCounts);

    emit({
      agent: 'skill_matcher',
      status: 'done',
      summary: `技能匹配完成: ${mappedSkills.length}/${extractedSkills.length} 已匹配`,
      data: {
        matched: mappedSkills.length,
        total: extractedSkills.length,
        logs: matchingLogs,
        methodSummary,
        mappedSkills: mappedSkills.map((m) => ({
          id: m.skillId,
          name: m.name,
          proficiency: m.proficiency,
        })),
      },
      timestamp: Date.now(),
    });

    // Step 3: Return result
    return {
      success: parseResult.success || extractedSkills.length > 0,
      data: {
        parsedText,
        parsedJson: parseResult.data['parsedJson'] || {},
        llmParseDetail: parseResult.data['llmParseDetail'],
        extractedSkills,
        skillLlmDetail,
        mappedSkills,
        matchingLogs,
        pipelineSteps: collectedSteps,
      },
      summary: [
        parseResult.summary,
        `技能提取: ${extractedSkills.length} 个 (匹配 ${mappedSkills.length} 个)`,
      ].join(' | '),
    };
  }
}
