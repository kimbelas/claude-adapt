import type { ScoreResult, Recommendation, Trend } from '../types.js';

export interface ReportData {
  scoreResult: ScoreResult;
  recommendations: Recommendation[];
  trends: Trend[];
  repoName: string;
  version: string;
}

export interface Reporter {
  render(data: ReportData): string;
}
