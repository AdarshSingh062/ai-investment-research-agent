export type DecisionType = "INVEST" | "HOLD" | "PASS";

export interface CompanyInfo {
  name: string;
  ticker: string;
  sector: string;
  currentPrice: string;
  priceChange: string;
  priceChangePercent: string;
  marketCap: string;
  fiftyTwoWeekRange: string;
  peRatio: string;
  dividendYield: string;
}

export interface FinancialMetric {
  year: string;
  revenue: string;
  netIncome: string;
  revenueGrowth: string;
  operatingMargin: string;
}

export interface Financials {
  metrics: FinancialMetric[];
  debtToEquity: string;
  freeCashFlow: string;
  peVsIndustry: string;
  financialHealthSummary: string;
}

export interface SWOTAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface NewsItem {
  title: string;
  source: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  summary: string;
  url?: string;
}

export interface CompetitorMetric {
  companyName: string;
  ticker: string;
  marketCap: string;
  peRatio: string;
  revenueGrowth: string;
  profitMargin: string;
}

export interface InvestmentThesis {
  decision: DecisionType;
  convictionScore: number; // 1-10
  targetPriceEstimate: string;
  thesisSummary: string;
  keyCatalysts: string[];
  keyRisks: string[];
  strategyRecommendation: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ResearchReport {
  id: string;
  companyName: string;
  timestamp: string;
  companyInfo: CompanyInfo;
  financials: Financials;
  swot: SWOTAnalysis;
  news: NewsItem[];
  competitors: CompetitorMetric[];
  thesis: InvestmentThesis;
  sources: GroundingSource[];
}

export interface AgentStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  logs: string[];
}

export interface WatchlistItem {
  id: string;
  companyName: string;
  ticker: string;
  decision: DecisionType;
  convictionScore: number;
  currentPrice: string;
  timestamp: string;
}
