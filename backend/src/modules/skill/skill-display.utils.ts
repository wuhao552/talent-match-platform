import type { Document } from '../document/document.entity';
import type { DocumentSkill } from './document-skill.entity';

interface ExtractedSkill {
  name?: string;
  proficiency?: string;
}

interface MatchingLog {
  extracted?: string;
  canonical?: string | null;
}

/**
 * 将 parsedJson 中未映射到标准技能库的提取技能补充到 DocumentSkill 列表。
 *
 * 历史上解析流程没有返回/保存 unmatchedSkills，导致 document_skills 只落库
 * 映射成功项，个人 vs 岗位能力图谱的岗位侧（以及简历侧）缺少未匹配技能。
 * 该函数在读取时根据 matchingLogs 补全，使已解析的历史文档无需重新解析
 * 也能展示完整能力图谱。
 */
export function mergeUnmatchedSkillsFromParsedJson(
  doc: Pick<Document, 'id' | 'parsedJson'>,
  savedSkills: DocumentSkill[],
): DocumentSkill[] {
  const result = [...savedSkills];
  const parsedJson = (doc.parsedJson || {}) as {
    extractedSkills?: ExtractedSkill[];
    unmatchedSkills?: ExtractedSkill[];
    matchingLogs?: MatchingLog[];
  };

  const existingNames = new Set<string>();
  for (const s of savedSkills) {
    for (const name of [s.skillName, s.skill?.name]) {
      const key = name?.trim().toLowerCase();
      if (key) existingNames.add(key);
    }
  }

  const proficiencyByName = new Map<string, string>();
  for (const s of parsedJson.extractedSkills || []) {
    const name = s?.name?.trim();
    if (name && !proficiencyByName.has(name)) {
      proficiencyByName.set(name, s.proficiency || 'intermediate');
    }
  }

  let syntheticSeq = 0;
  const append = (rawName: string) => {
    const name = rawName?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (existingNames.has(key)) return;
    existingNames.add(key);
    syntheticSeq += 1;

    // 合成负 ID 仅用于前端图谱渲染，不会与标准技能 ID 或匹配明细中的
    // 正数/模糊负数 ID 冲突，也不会写入数据库。
    result.push({
      id: `unmatched-${doc.id}-${syntheticSeq}`,
      documentId: doc.id,
      skillId: -(1_000_000 + syntheticSeq),
      skillName: name,
      proficiency: proficiencyByName.get(name) || 'intermediate',
      confidence: 0.8,
      sourceText: '',
      extractionMethod: 'llm',
      category: null,
    } as unknown as DocumentSkill);
  };

  const logs = parsedJson.matchingLogs;
  if (Array.isArray(logs) && logs.length > 0) {
    // 以匹配日志为准：canonical 为 null 的提取项就是未匹配技能。
    // 已匹配技能若在历史数据中未落库（例如旧数据只保存了部分映射），
    // 也用提取名补上，避免能力图谱缺节点。
    for (const log of logs) {
      if (!log) continue;
      const extracted = log.extracted?.trim() || '';
      if (!extracted) continue;
      const saved = existingNames.has(extracted.toLowerCase());
      const savedCanonical =
        log.canonical?.trim() &&
        existingNames.has(log.canonical.trim().toLowerCase());
      if (!saved && !savedCanonical) append(extracted);
    }
    return result;
  }

  for (const s of parsedJson.unmatchedSkills || []) {
    append(s?.name || '');
  }

  // 兜底：旧数据既没有 matchingLogs 也没有 unmatchedSkills 时，
  // 至少把未落库的提取技能补进图谱。
  for (const s of parsedJson.extractedSkills || []) {
    append(s?.name || '');
  }

  return result;
}
