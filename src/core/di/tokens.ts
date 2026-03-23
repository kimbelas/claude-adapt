export const TOKENS = {
  FileIndex: Symbol('FileIndex'),
  GitContext: Symbol('GitContext'),
  ScanContext: Symbol('ScanContext'),
  DetectorChain: Symbol('DetectorChain'),
  Pipeline: Symbol('Pipeline'),
  ScoringEngine: Symbol('ScoringEngine'),
  RecommendationEngine: Symbol('RecommendationEngine'),
  HistoryStore: Symbol('HistoryStore'),
  Reporter: Symbol('Reporter'),
  Cache: Symbol('Cache'),
  HookRegistry: Symbol('HookRegistry'),
  Config: Symbol('Config'),
} as const;
