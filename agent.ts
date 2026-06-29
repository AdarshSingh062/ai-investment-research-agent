import { GoogleGenAI, Type } from "@google/genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { 
  ResearchReport, 
  AgentStep, 
  CompanyInfo, 
  Financials, 
  SWOTAnalysis, 
  NewsItem, 
  CompetitorMetric, 
  InvestmentThesis,
  GroundingSource
} from "./types.js";

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Prompt templates using LangChain.js
const stage1SearchPrompt = new PromptTemplate({
  template: "Conduct a comprehensive web search to find current stock and market information for {companyName}. Find the ticker symbol, current stock price, price change, percentage price change, market cap, 52-week high and low range, sector/industry, P/E ratio, and dividend yield.",
  inputVariables: ["companyName"]
});

const stage1SynthesisPrompt = new PromptTemplate({
  template: `You are an elite equity research analyst. Synthesize the raw search data below into a structured JSON profile for {companyName}. Use professional formatting for numbers (e.g., "$3.02 Trillion" for market cap, "$182.30" for prices, etc.).
  
  Raw Search Data:
  {rawData}
  
  Format strictly according to the requested JSON schema.`,
  inputVariables: ["companyName", "rawData"]
});

const stage2SearchPrompt = new PromptTemplate({
  template: "Conduct a web search for the financial fundamentals and balance sheet health of {companyName} ({ticker}). Retrieve the annual revenue and net income for the last 3-4 years/quarters, recent revenue growth rate, operating/profit margin, debt-to-equity ratio, annual free cash flow, and valuation compared to its industry.",
  inputVariables: ["companyName", "ticker"]
});

const stage2SynthesisPrompt = new PromptTemplate({
  template: `As a senior financial analyst, parse the following research data to compile the historical financial metrics, balance sheet metrics, and a health summary for {companyName} ({ticker}).
  Ensure you list annual or quarterly financial metrics (revenue, net income, revenue growth, operating margin) for the last 3 years.
  
  Raw Search Data:
  {rawData}
  
  Format strictly according to the requested JSON schema.`,
  inputVariables: ["companyName", "ticker", "rawData"]
});

const stage3SearchPrompt = new PromptTemplate({
  template: "Conduct a search for recent news, regulatory filings (SEC, Form 10-K/Q highlights), key announcements, product releases, major controversies, and general market consensus/sentiment for {companyName} ({ticker}) in 2026.",
  inputVariables: ["companyName", "ticker"]
});

const stage3SynthesisPrompt = new PromptTemplate({
  template: `Synthesize the latest news, events, and sentiment for {companyName} ({ticker}). Identify the overall market sentiment (Bullish, Bearish, or Neutral) and extract 3-4 major recent news events with their title, source, a brief 1-2 sentence summary, and their specific sentiment.
  
  Raw Search Data:
  {rawData}
  
  Format strictly according to the requested JSON schema.`,
  inputVariables: ["companyName", "ticker", "rawData"]
});

const stage4SearchPrompt = new PromptTemplate({
  template: "Identify the top 2-3 main competitors of {companyName} ({ticker}) in their primary business sector. Conduct a search for their competitor tickers, market caps, P/E ratios, revenue growth rates, and profit margins, and list the strengths, weaknesses, opportunities, and threats (SWOT analysis) of {companyName}.",
  inputVariables: ["companyName", "ticker"]
});

const stage4SynthesisPrompt = new PromptTemplate({
  template: `Synthesize the competitive landscape and SWOT analysis for {companyName} ({ticker}). Include 2-3 major competitors with key financial metrics, along with a detailed SWOT matrix (at least 3 points for each SWOT section).
  
  Raw Search Data:
  {rawData}
  
  Format strictly according to the requested JSON schema.`,
  inputVariables: ["companyName", "ticker", "rawData"]
});

const stage5ThesisPrompt = new PromptTemplate({
  template: `You are the Chief Investment Officer (CIO) of a multi-billion dollar hedge fund. Synthesize all the research compiled for {companyName} ({ticker}) to make a final investment decision.
  
  Decide between:
  - "INVEST" (Buy recommendation)
  - "HOLD" (Wait / neutral stance)
  - "PASS" (Avoid / sell recommendation)
  
  Your decision should be backed by:
  1. A conviction score (1 to 10)
  2. A estimated target price for the 1-year horizon (e.g., "$240 (18% upside)")
  3. A robust, institutional-grade thesis summary (2 detailed paragraphs)
  4. At least 3 key positive catalysts or bull drivers
  5. At least 3 key negative risks or bear scenarios
  6. A clear strategy recommendation (e.g., position size limit, dollar-cost averaging, entry trigger)

  Company Profile:
  {profile}

  Financial Deep Dive:
  {financials}

  News & Sentiment:
  {news}

  SWOT & Competitors:
  {swot}
  
  Ensure all recommendations are logical and directly supported by the research data. Format strictly according to the requested JSON schema.`,
  inputVariables: ["companyName", "ticker", "profile", "financials", "news", "swot"]
});

/**
 * Execute a search-grounded call to Gemini
 */
async function performSearchResearch(query: string, logCallback: (log: string) => void): Promise<{ text: string; sources: GroundingSource[] }> {
  logCallback(`Initiating Google Search: "${query}"...`);
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "No search data found.";
    const sources: GroundingSource[] = [];

    // Extract sources if available
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || "Web Resource",
            uri: chunk.web.uri
          });
        }
      }
    }

    logCallback(`Google Search completed. Found ${sources.length} sources.`);
    return { text, sources };
  } catch (err: any) {
    logCallback(`Search query failed: ${err.message || err}`);
    return { text: "Search failed. Utilizing default knowledge base.", sources: [] };
  }
}

/**
 * Perform Structured Synthesis Call
 */
async function synthesizeData<T>(prompt: string, schema: any): Promise<T> {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty response from synthesis model");
  }

  return JSON.parse(text) as T;
}

/**
 * Main Investment Research Agent Runner
 */
export async function runInvestmentResearch(
  companyName: string,
  onStepChange: (step: AgentStep) => void
): Promise<ResearchReport> {
  const steps: Record<string, AgentStep> = {
    market_init: {
      id: "market_init",
      title: "Market Profiling",
      description: "Fetching company pricing, ticker symbol, sector, and basic trading data",
      status: "pending",
      logs: []
    },
    financial_deep_dive: {
      id: "financial_deep_dive",
      title: "Financial Deep Dive",
      description: "Analyzing multi-year income statements, margins, cash flow, and debt ratios",
      status: "pending",
      logs: []
    },
    news_sentiment: {
      id: "news_sentiment",
      title: "Sentiment & News Mining",
      description: "Searching recent regulatory events, news developments, and general market consensus",
      status: "pending",
      logs: []
    },
    risk_swot: {
      id: "risk_swot",
      title: "SWOT & Competitive Grid",
      description: "Comparing valuations with core industry competitors and modeling a SWOT matrix",
      status: "pending",
      logs: []
    },
    final_thesis: {
      id: "final_thesis",
      title: "Synthesis & Investment Thesis",
      description: "Consolidating all vectors to make a final buy/sell recommendation and target price",
      status: "pending",
      logs: []
    }
  };

  const updateStep = (id: string, updates: Partial<AgentStep>) => {
    steps[id] = { ...steps[id], ...updates };
    onStepChange(steps[id]);
  };

  const addLog = (id: string, log: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const formattedLog = `[${timestamp}] ${log}`;
    steps[id].logs = [...steps[id].logs, formattedLog];
    updateStep(id, { logs: steps[id].logs });
  };

  const allSources: GroundingSource[] = [];

  // ==========================================
  // STAGE 1: Market Profiling
  // ==========================================
  updateStep("market_init", { status: "running" });
  addLog("market_init", `Starting market profiling for company: "${companyName}"...`);
  
  const stage1Query = await stage1SearchPrompt.format({ companyName });
  const stage1Result = await performSearchResearch(stage1Query, (log) => addLog("market_init", log));
  allSources.push(...stage1Result.sources);

  addLog("market_init", "Synthesizing market profile into structured fields...");
  
  const companyInfoSchema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Full name of the company" },
      ticker: { type: Type.STRING, description: "Stock ticker symbol (e.g., GOOGL, AAPL)" },
      sector: { type: Type.STRING, description: "Primary sector or industry" },
      currentPrice: { type: Type.STRING, description: "Current trading price (with currency, e.g. $182.30)" },
      priceChange: { type: Type.STRING, description: "Recent day or absolute price change" },
      priceChangePercent: { type: Type.STRING, description: "Recent percentage change" },
      marketCap: { type: Type.STRING, description: "Total market capitalization" },
      fiftyTwoWeekRange: { type: Type.STRING, description: "52-Week High and Low price range" },
      peRatio: { type: Type.STRING, description: "Price-to-earnings ratio" },
      dividendYield: { type: Type.STRING, description: "Current dividend yield (e.g. 1.25%, or N/A)" }
    },
    required: ["name", "ticker", "sector", "currentPrice", "priceChange", "priceChangePercent", "marketCap", "fiftyTwoWeekRange", "peRatio", "dividendYield"]
  };

  const companyInfoPrompt = await stage1SynthesisPrompt.format({
    companyName,
    rawData: stage1Result.text
  });

  const companyInfo = await synthesizeData<CompanyInfo>(companyInfoPrompt, companyInfoSchema);
  addLog("market_init", `Identified ticker: ${companyInfo.ticker} on ${companyInfo.sector}. Current Price: ${companyInfo.currentPrice}.`);
  updateStep("market_init", { status: "completed" });

  const ticker = companyInfo.ticker;

  // ==========================================
  // STAGE 2: Financial Deep Dive
  // ==========================================
  updateStep("financial_deep_dive", { status: "running" });
  addLog("financial_deep_dive", `Commencing financial analysis for ${companyInfo.name} (${ticker})...`);
  
  const stage2Query = await stage2SearchPrompt.format({ companyName: companyInfo.name, ticker });
  const stage2Result = await performSearchResearch(stage2Query, (log) => addLog("financial_deep_dive", log));
  allSources.push(...stage2Result.sources);

  addLog("financial_deep_dive", "Synthesizing fundamentals, revenue trends, and balance sheet metrics...");

  const financialsSchema = {
    type: Type.OBJECT,
    properties: {
      metrics: {
        type: Type.ARRAY,
        description: "Yearly or quarterly financials (last 3 intervals)",
        items: {
          type: Type.OBJECT,
          properties: {
            year: { type: Type.STRING, description: "Year/Quarter designation (e.g. 2024 or Q1 2025)" },
            revenue: { type: Type.STRING, description: "Revenue value" },
            netIncome: { type: Type.STRING, description: "Net income value" },
            revenueGrowth: { type: Type.STRING, description: "Revenue growth percentage" },
            operatingMargin: { type: Type.STRING, description: "Operating margin percentage" }
          },
          required: ["year", "revenue", "netIncome", "revenueGrowth", "operatingMargin"]
        }
      },
      debtToEquity: { type: Type.STRING, description: "Debt-to-equity ratio" },
      freeCashFlow: { type: Type.STRING, description: "Latest free cash flow" },
      peVsIndustry: { type: Type.STRING, description: "Quick comparison of P/E vs industry average" },
      financialHealthSummary: { type: Type.STRING, description: "Overall concise summary of financial health" }
    },
    required: ["metrics", "debtToEquity", "freeCashFlow", "peVsIndustry", "financialHealthSummary"]
  };

  const financialsPrompt = await stage2SynthesisPrompt.format({
    companyName: companyInfo.name,
    ticker,
    rawData: stage2Result.text
  });

  const financials = await synthesizeData<Financials>(financialsPrompt, financialsSchema);
  addLog("financial_deep_dive", `Processed ${financials.metrics.length} financial years. Debt/Equity: ${financials.debtToEquity}. Free Cash Flow: ${financials.freeCashFlow}.`);
  updateStep("financial_deep_dive", { status: "completed" });

  // ==========================================
  // STAGE 3: News & Sentiment Mining
  // ==========================================
  updateStep("news_sentiment", { status: "running" });
  addLog("news_sentiment", `Retrieving recent news and regulatory updates for ${companyInfo.name}...`);

  const stage3Query = await stage3SearchPrompt.format({ companyName: companyInfo.name, ticker });
  const stage3Result = await performSearchResearch(stage3Query, (log) => addLog("news_sentiment", log));
  allSources.push(...stage3Result.sources);

  addLog("news_sentiment", "Analyzing market sentiment and filtering core headlines...");

  const newsSchema = {
    type: Type.OBJECT,
    properties: {
      sentiment: { type: Type.STRING, description: "Overall market sentiment: Bullish, Bearish, or Neutral", enum: ["Bullish", "Bearish", "Neutral"] },
      newsItems: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "News headline" },
            source: { type: Type.STRING, description: "News publisher or source" },
            sentiment: { type: Type.STRING, description: "Specific sentiment of this news", enum: ["Bullish", "Bearish", "Neutral"] },
            summary: { type: Type.STRING, description: "Brief 1-2 sentence description of the news event" },
            url: { type: Type.STRING, description: "Source URL if found, or empty string" }
          },
          required: ["title", "source", "sentiment", "summary"]
        }
      }
    },
    required: ["sentiment", "newsItems"]
  };

  const newsPrompt = await stage3SynthesisPrompt.format({
    companyName: companyInfo.name,
    ticker,
    rawData: stage3Result.text
  });

  const newsData = await synthesizeData<{ sentiment: "Bullish" | "Bearish" | "Neutral"; newsItems: NewsItem[] }>(
    newsPrompt, 
    newsSchema
  );
  addLog("news_sentiment", `Overall News Sentiment: ${newsData.sentiment}. Compiled ${newsData.newsItems.length} core news events.`);
  updateStep("news_sentiment", { status: "completed" });

  // ==========================================
  // STAGE 4: SWOT & Competitors
  // ==========================================
  updateStep("risk_swot", { status: "running" });
  addLog("risk_swot", `Scouting competitor landscape and building SWOT matrix for ${companyInfo.name}...`);

  const stage4Query = await stage4SearchPrompt.format({ companyName: companyInfo.name, ticker });
  const stage4Result = await performSearchResearch(stage4Query, (log) => addLog("risk_swot", log));
  allSources.push(...stage4Result.sources);

  addLog("risk_swot", "Generating competitor comparison grid and SWOT matrix...");

  const swotCompetitorSchema = {
    type: Type.OBJECT,
    properties: {
      swot: {
        type: Type.OBJECT,
        properties: {
          strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Company strengths (at least 3)" },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Company weaknesses (at least 3)" },
          opportunities: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Industry opportunities (at least 3)" },
          threats: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Macro/competitive threats (at least 3)" }
        },
        required: ["strengths", "weaknesses", "opportunities", "threats"]
      },
      competitors: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            companyName: { type: Type.STRING, description: "Competitor name" },
            ticker: { type: Type.STRING, description: "Competitor ticker" },
            marketCap: { type: Type.STRING, description: "Competitor market cap" },
            peRatio: { type: Type.STRING, description: "Competitor P/E" },
            revenueGrowth: { type: Type.STRING, description: "Competitor revenue growth" },
            profitMargin: { type: Type.STRING, description: "Competitor profit margin" }
          },
          required: ["companyName", "ticker", "marketCap", "peRatio", "revenueGrowth", "profitMargin"]
        }
      }
    },
    required: ["swot", "competitors"]
  };

  const swotPrompt = await stage4SynthesisPrompt.format({
    companyName: companyInfo.name,
    ticker,
    rawData: stage4Result.text
  });

  const swotCompetitorData = await synthesizeData<{ swot: SWOTAnalysis; competitors: CompetitorMetric[] }>(
    swotPrompt, 
    swotCompetitorSchema
  );
  addLog("risk_swot", `Constructed SWOT. Competitors mapped: ${swotCompetitorData.competitors.map(c => c.ticker).join(", ")}.`);
  updateStep("risk_swot", { status: "completed" });

  // ==========================================
  // STAGE 5: Synthesis & Investment Thesis
  // ==========================================
  updateStep("final_thesis", { status: "running" });
  addLog("final_thesis", "Deliberating investment decision, target pricing, and conviction modeling...");

  const thesisSchema = {
    type: Type.OBJECT,
    properties: {
      decision: { type: Type.STRING, description: "Final call: INVEST, HOLD, or PASS", enum: ["INVEST", "HOLD", "PASS"] },
      convictionScore: { type: Type.INTEGER, description: "Rating of the recommendation from 1 (lowest) to 10 (highest)" },
      targetPriceEstimate: { type: Type.STRING, description: "1-year target price with % potential upside/downside (e.g., $210 (15% upside))" },
      thesisSummary: { type: Type.STRING, description: "A detailed, institutional-grade thesis explaining the rationale (at least 2 paragraphs)" },
      keyCatalysts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific upcoming triggers/catalysts (at least 3)" },
      keyRisks: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Primary risks and vulnerabilities (at least 3)" },
      strategyRecommendation: { type: Type.STRING, description: "Strategic allocation advice or buying instructions" }
    },
    required: ["decision", "convictionScore", "targetPriceEstimate", "thesisSummary", "keyCatalysts", "keyRisks", "strategyRecommendation"]
  };

  const thesisPromptInput = await stage5ThesisPrompt.format({
    companyName: companyInfo.name,
    ticker,
    profile: JSON.stringify(companyInfo, null, 2),
    financials: JSON.stringify(financials, null, 2),
    news: JSON.stringify(newsData, null, 2),
    swot: JSON.stringify(swotCompetitorData, null, 2)
  });

  const thesis = await synthesizeData<InvestmentThesis>(thesisPromptInput, thesisSchema);
  addLog("final_thesis", `Investment decision formulated: ${thesis.decision}. Conviction: ${thesis.convictionScore}/10. 1-Yr Target: ${thesis.targetPriceEstimate}.`);
  updateStep("final_thesis", { status: "completed" });

  // Filter unique sources to keep reports elegant and avoid duplicates
  const seenUrls = new Set<string>();
  const uniqueSources = allSources.filter(source => {
    if (seenUrls.has(source.uri)) {
      return false;
    }
    seenUrls.add(source.uri);
    return true;
  }).slice(0, 10); // Keep top 10 relevant references

  // Return full synthesized report
  return {
    id: `report_${Date.now()}`,
    companyName: companyInfo.name,
    timestamp: new Date().toISOString(),
    companyInfo,
    financials,
    swot: swotCompetitorData.swot,
    news: newsData.newsItems,
    competitors: swotCompetitorData.competitors,
    thesis,
    sources: uniqueSources
  };
}
