import { Injectable } from '@nestjs/common';
import {
  MatchDetail,
  ScoreBreakdown,
  AlgorithmStep,
  LlmAssessment,
} from './match-result.entity';
import { DocumentSkill } from '../skill/document-skill.entity';

@Injectable()
export class MatchScoringService {
  private static readonly PROFICIENCY_LEVEL: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  };

  static readonly SEMANTIC_MATCH_THRESHOLD = 0.6;

  /**
   * 计算算法技能匹配分（双维度）。
   *
   * coverage(60%): 技能覆盖率 — 岗位技能被匹配的比例
   * adequacy(40%): 熟练度达标率 — 匹配项的熟练度是否达标
   */
  calculateAlgorithmScore(
    matchDetails: MatchDetail[],
    resumeSkills: DocumentSkill[],
    jobSkills: DocumentSkill[],
  ): {
    score: number;
    dimensions: {
      coverage: number;
      adequacy: number;
    };
  } {
    let coverageSum = 0;
    for (const js of jobSkills) {
      const detail = matchDetails.find((d) => d.jobSkillId === js.skillId);
      if (detail) {
        coverageSum +=
          detail.skillId > 0 ? 1.0 : Math.abs(detail.skillId) / 100;
      }
    }
    const coverage = jobSkills.length > 0 ? coverageSum / jobSkills.length : 0;

    let adequacySum = 0;
    let adequacyCount = 0;
    for (const d of matchDetails) {
      const candLevel =
        MatchScoringService.PROFICIENCY_LEVEL[d.personProficiency] ?? 2;
      const reqLevel =
        MatchScoringService.PROFICIENCY_LEVEL[d.jobRequirement] ?? 2;
      adequacySum += Math.min(1.0, candLevel / reqLevel);
      adequacyCount++;
    }
    const adequacy = adequacyCount > 0 ? adequacySum / adequacyCount : coverage;

    const score = (coverage * 0.6 + adequacy * 0.4) * 100;

    return {
      score: Math.round(score * 10) / 10,
      dimensions: {
        coverage: Math.round(coverage * 100) / 100,
        adequacy: Math.round(adequacy * 100) / 100,
      },
    };
  }

  buildFinalResult(
    algorithmScore: number,
    llmAssessment: LlmAssessment | null,
    matchDetails: MatchDetail[],
    algorithmDimensions: { coverage: number; adequacy: number },
  ): {
    overallScore: number;
    llmScore: number;
    skillMatchScore: number;
    scoreBreakdown: ScoreBreakdown;
  } {
    const llmScore = llmAssessment?.overallFit ?? 0;
    const overallScore = llmAssessment
      ? Math.round((algorithmScore * 0.5 + llmScore * 0.5) * 10) / 10
      : algorithmScore;
    const skillMatchScore =
      matchDetails.length > 0
        ? Math.min(
            100,
            (matchDetails.filter((d) => d.skillId > 0).length /
              Math.max(1, matchDetails.length)) *
              100,
          )
        : 0;
    const scoreBreakdown: ScoreBreakdown = {
      algorithmScore,
      llmScore,
      overallScore,
      matchStatus: llmAssessment ? 'computed' : 'fallback',
      algorithmDimensions,
    };
    return { overallScore, llmScore, skillMatchScore, scoreBreakdown };
  }

  buildResultStep(
    algorithmScore: number,
    llmScore: number,
    overallScore: number,
  ): AlgorithmStep {
    return {
      phase: 'result',
      label: '最终结果',
      status: 'done',
      durationMs: 0,
      summary: `算法分: ${algorithmScore.toFixed(1)}/100, LLM分: ${llmScore.toFixed(1)}/100, 最终: ${overallScore.toFixed(1)}/100`,
    };
  }

  inferImportance(proficiency: string): string {
    const idx = ['beginner', 'intermediate', 'advanced', 'expert'].indexOf(
      proficiency,
    );
    return idx >= 2 ? 'required' : idx >= 1 ? 'preferred' : 'optional';
  }
}
