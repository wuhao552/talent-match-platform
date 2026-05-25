import { Injectable } from '@nestjs/common'
import type { IAgent, AgentContext, AgentResult, AgentDefinition } from './agent.interface'
import { LlmService } from '../modules/llm/llm.service'
import * as fs from 'fs'

@Injectable()
export class DocumentParserAgent implements IAgent {
  constructor(private llmService: LlmService) {}

  readonly definition: AgentDefinition = {
    agentType: 'document_parser',
    description: '解析 DOC/PDF 文档提取纯文本，并调用大模型进行结构化解析',
    whenToUse: '用户上传简历或职位描述文档后',
    tools: ['pdfParser', 'docxParser', 'llmParser'],
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { filePath, fileFormat } = context.input as {
      filePath: string
      fileFormat: string
    }

    // Step 1: Extract raw text from file
    let parsedText = ''
    try {
      parsedText = await this.extractText(filePath, fileFormat)
    } catch (err) {
      return {
        success: false,
        data: {},
        summary: '文件读取失败',
        error: err instanceof Error ? err.message : '无法读取文件',
      }
    }

    if (!parsedText || parsedText.trim().length === 0) {
      return {
        success: false,
        data: {},
        summary: '文档内容为空',
        error: '文件解析后无文本内容',
      }
    }

    // Step 2: Structured parsing via LLM
    let parsedJson: Record<string, unknown> = {}
    try {
      const llmResult = await this.llmService.parseDocument(parsedText, context.onChunk)
      parsedJson = llmResult.parsed

      return {
        success: true,
        data: {
          parsedText,
          parsedJson,
          llmParseDetail: llmResult.detail,
        },
        summary: `文档解析成功: 文本${parsedText.length}字符, 结构化字段${Object.keys(parsedJson).length}个 (模型: ${llmResult.detail.model}, 耗时: ${llmResult.detail.latencyMs}ms)`,
      }
    } catch (err) {
      // LLM structured parsing failed, but raw text is available
      return {
        success: true,
        data: {
          parsedText,
          parsedJson: null,
          llmParseDetail: null,
          llmError: err instanceof Error ? err.message : 'LLM解析失败',
        },
        summary: `文档文本提取成功(${parsedText.length}字符), 大模型结构化解析失败: ${err instanceof Error ? err.message : '未知错误'}`,
      }
    }
  }

  private async extractText(filePath: string, fileFormat: string): Promise<string> {
    if (fileFormat === 'pdf') {
      const pdfParse = require('pdf-parse')
      const buffer = fs.readFileSync(filePath)
      const data = await pdfParse(buffer)
      return data.text || ''
    }

    if (fileFormat === 'docx' || fileFormat === 'doc') {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value || ''
    }

    // Plain text fallback
    return fs.readFileSync(filePath, 'utf-8')
  }
}
