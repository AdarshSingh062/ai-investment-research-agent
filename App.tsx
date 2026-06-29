import { useState, useEffect } from "react";
import { ResearchReport, AgentStep, WatchlistItem } from "./types";
import HistorySidebar from "./components/HistorySidebar";
import ResearchConsole from "./components/ResearchConsole";
import ReportDashboard from "./components/ReportDashboard";
import Watchlist from "./components/Watchlist";
import { 
  Search, Terminal, BarChart3, TrendingUp, Sparkles, 
  Eye, Menu, X, ArrowLeft, BrainCircuit, ShieldAlert 
} from "lucide-react";

export default function App() {
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchingCompany, setSearchingCompany] = useState("");
  const [activeTab, setActiveTab] = useState<"watchlist" | "console" | "report">("watchlist");
  
  // Real-time step tracing
  const [steps, setSteps] = useState<AgentStep[]>([
    { id: "market_init", title: "Market Profiling", description: "Fetching company pricing, ticker symbol, sector, and basic trading data", status: "pending", logs: [] },
    { id: "financial_deep_dive", title: "Financial Deep Dive", description: "Analyzing multi-year income statements, margins, cash flow, and debt ratios", status: "pending", logs: [] },
    { id: "news_sentiment", title: "Sentiment & News Mining", description: "Searching recent regulatory events, news developments, and general market consensus", status: "pending", logs: [] },
    { id: "risk_swot", title: "SWOT & Competitive Grid", description: "Comparing valuations with core industry competitors and modeling a SWOT matrix", status: "pending", logs: [] },
    { id: "final_thesis", title: "Synthesis & Investment Thesis", description: "Consolidating all vectors to make a final buy/sell recommendation and target price", status: "pending", logs: [] }
  ]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const savedReports = localStorage.getItem("inv_reports");
      if (savedReports) {
        const parsedReports = JSON.parse(savedReports);
        setReports(parsedReports);
        if (parsedReports.length > 0) {
          setActiveReportId(parsedReports[0].id);
          setActiveTab("report");
        }
      }

      const savedWatchlist = localStorage.getItem("inv_watchlist");
      if (savedWatchlist) {
        setWatchlist(JSON.parse(savedWatchlist));
      }
    } catch (e) {
      console.error("Error loading localStorage data:", e);
    }
  }, []);

  // Save reports to localStorage
  const saveReports = (updatedReports: ResearchReport[]) => {
    setReports(updatedReports);
    localStorage.setItem("inv_reports", JSON.stringify(updatedReports));
  };

  // Save watchlist to localStorage
  const saveWatchlist = (updatedWatchlist: WatchlistItem[]) => {
    setWatchlist(updatedWatchlist);
    localStorage.setItem("inv_watchlist", JSON.stringify(updatedWatchlist));
  };

  const handleStartResearch = (company: string) => {
    if (!company.trim() || isSearching) return;

    setError(null);
    setIsSearching(true);
    setSearchingCompany(company);
    setActiveTab("console");

    // Reset Steps
    const freshSteps: AgentStep[] = [
      { id: "market_init", title: "Market Profiling", description: "Fetching company pricing, ticker symbol, sector, and basic trading data", status: "pending", logs: [] },
      { id: "financial_deep_dive", title: "Financial Deep Dive", description: "Analyzing multi-year income statements, margins, cash flow, and debt ratios", status: "pending", logs: [] },
      { id: "news_sentiment", title: "Sentiment & News Mining", description: "Searching recent regulatory events, news developments, and general market consensus", status: "pending", logs: [] },
      { id: "risk_swot", title: "SWOT & Competitive Grid", description: "Comparing valuations with core industry competitors and modeling a SWOT matrix", status: "pending", logs: [] },
      { id: "final_thesis", title: "Synthesis & Investment Thesis", description: "Consolidating all vectors to make a final buy/sell recommendation and target price", status: "pending", logs: [] }
    ];
    setSteps(freshSteps);
    setCurrentStepId("market_init");

    // Initiate Server Sent Events connection
    const sseUrl = `/api/research?company=${encodeURIComponent(company)}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("step", (event: MessageEvent) => {
      try {
        const updatedStep = JSON.parse(event.data) as AgentStep;
        
        setCurrentStepId(updatedStep.id);
        setSteps((prevSteps) =>
          prevSteps.map((step) =>
            step.id === updatedStep.id ? updatedStep : step
          )
        );
      } catch (err) {
        console.error("Error parsing step log:", err);
      }
    });

    eventSource.addEventListener("completed", (event: MessageEvent) => {
      try {
        const completedReport = JSON.parse(event.data) as ResearchReport;
        
        // Add new report to list
        const updatedReports = [completedReport, ...reports.filter((r) => r.companyInfo.ticker !== completedReport.companyInfo.ticker)];
        saveReports(updatedReports);
        setActiveReportId(completedReport.id);

        // Add company to watchlist
        const watchItem: WatchlistItem = {
          id: `watch_${Date.now()}`,
          companyName: completedReport.companyInfo.name,
          ticker: completedReport.companyInfo.ticker,
          decision: completedReport.thesis.decision,
          convictionScore: completedReport.thesis.convictionScore,
          currentPrice: completedReport.companyInfo.currentPrice,
          timestamp: new Date().toISOString()
        };
        const updatedWatch = [watchItem, ...watchlist.filter((w) => w.ticker !== watchItem.ticker)];
        saveWatchlist(updatedWatch);

        setIsSearching(false);
        setActiveTab("report");
        setSearchQuery("");
        eventSource.close();
      } catch (err) {
        console.error("Error parsing completed report:", err);
        setError("Failed to compile final report. Please try again.");
        setIsSearching(false);
        eventSource.close();
      }
    });

    eventSource.addEventListener("error", (event: MessageEvent) => {
      try {
        const errData = JSON.parse(event.data);
        setError(errData.message || "The autonomous agent encountered a terminal error.");
      } catch {
        setError("Failed to complete research cycle due to an internal server error.");
      }
      setIsSearching(false);
      eventSource.close();
    });

    eventSource.onerror = (e) => {
      console.error("SSE connection error:", e);
      setError("Server connection dropped unexpectedly.");
      setIsSearching(false);
      eventSource.close();
    };
  };

  const handleDeleteReport = (id: string) => {
    const updated = reports.filter((r) => r.id !== id);
    saveReports(updated);
    if (activeReportId === id) {
      if (updated.length > 0) {
        setActiveReportId(updated[0].id);
      } else {
        setActiveReportId(null);
        setActiveTab("watchlist");
      }
    }
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to permanently clear your Research Vault?")) {
      saveReports([]);
      saveWatchlist([]);
      setActiveReportId(null);
      setActiveTab("watchlist");
    }
  };

  const handleSelectReport = (id: string) => {
    setActiveReportId(id);
    setActiveTab("report");
  };

  const handleRemoveFromWatchlist = (id: string) => {
    const updated = watchlist.filter((item) => item.id !== id);
    saveWatchlist(updated);
  };

  const handleLoadFromWatchlist = (companyName: string) => {
    const matchedReport = reports.find((r) => r.companyName.toLowerCase() === companyName.toLowerCase());
    if (matchedReport) {
      setActiveReportId(matchedReport.id);
      setActiveTab("report");
    } else {
      handleStartResearch(companyName);
    }
  };

  const currentActiveReport = reports.find((r) => r.id === activeReportId);

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-slate-100 overflow-hidden font-sans">
      
      {/* Historical Side Drawer */}
      {sidebarOpen && (
        <HistorySidebar
          reports={reports}
          selectedId={activeReportId}
          onSelectReport={handleSelectReport}
          onDeleteReport={handleDeleteReport}
          onClearAll={handleClearAll}
          onNewResearch={() => setActiveTab("watchlist")}
        />
      )}

      {/* Main Panel Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0A0B]">
        
        {/* Main Application Navbar */}
        <header className="bg-[#0C0C0E]/90 backdrop-blur-md border-b border-slate-800/80 h-16 px-4 md:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-400 hover:text-slate-100 p-2 hover:bg-slate-800/40 rounded-xl transition-all duration-300 border border-transparent hover:border-slate-800"
              title="Toggle Vault"
              id="btn-toggle-sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-emerald-400" />
              <span className="font-display font-extrabold text-slate-100 text-xs md:text-sm tracking-widest uppercase">
                Apex<span className="text-emerald-400">Invest</span>
              </span>
            </div>
          </div>

          {/* Quick Deploy Search Bar */}
          <div className="flex-1 max-w-md mx-4 md:mx-12">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleStartResearch(searchQuery);
              }}
              className="relative"
            >
              <input
                type="text"
                placeholder="Deploy Research Agent (e.g. Apple, Nvidia, Eli Lilly)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSearching}
                className="w-full bg-[#050505] border border-slate-800 rounded-2xl py-2 pl-4 pr-10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/10 transition-all font-sans"
                id="search-input"
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-1.5 top-1.5 p-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800/50 text-black rounded-xl transition duration-300"
                id="search-submit-btn"
              >
                {isSearching ? (
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5 font-bold" />
                )}
              </button>
            </form>
          </div>

          {/* Active Tab Panel Selector */}
          <div className="flex bg-[#050505] p-1 rounded-2xl border border-slate-800 text-[10px] font-bold uppercase tracking-wider shrink-0">
            <button
              onClick={() => setActiveTab("watchlist")}
              className={`px-3.5 py-2 rounded-xl transition-all duration-300 ${
                activeTab === "watchlist"
                  ? "bg-slate-800/60 text-emerald-400 font-extrabold border border-slate-850"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="tab-watchlist"
            >
              Watchlist
            </button>
            
            {isSearching && (
              <button
                onClick={() => setActiveTab("console")}
                className={`px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center gap-1.5 ${
                  activeTab === "console"
                    ? "bg-slate-800/60 text-sky-400 font-extrabold border border-slate-850"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                id="tab-console"
              >
                <Terminal className="w-3.5 h-3.5 animate-pulse text-sky-400" /> Logs
              </button>
            )}

            {currentActiveReport && (
              <button
                onClick={() => setActiveTab("report")}
                className={`px-3.5 py-2 rounded-xl transition-all duration-300 ${
                  activeTab === "report"
                    ? "bg-slate-800/60 text-emerald-400 font-extrabold border border-slate-850"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                id="tab-report"
              >
                Report
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Panels */}
        <div className="flex-1 overflow-y-auto bg-[#0A0A0B]">
          
          {error && activeTab !== "console" && (
            <div className="max-w-7xl mx-auto mt-6 px-4 md:px-8">
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl p-5 text-xs flex items-center gap-3 shadow-lg">
                <ShieldAlert className="w-5 h-5 shrink-0 text-rose-500" />
                <div>
                  <h4 className="font-extrabold uppercase tracking-wider">Agent Execution Failed</h4>
                  <p className="mt-1 text-slate-400 leading-relaxed">{error}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "watchlist" && (
            <Watchlist
              items={watchlist}
              onSelectItem={handleLoadFromWatchlist}
              onRemoveItem={handleRemoveFromWatchlist}
              onExploreDefault={handleStartResearch}
            />
          )}

          {activeTab === "console" && (
            <ResearchConsole
              companyName={searchingCompany}
              steps={steps}
              currentStepId={currentStepId}
              error={error}
            />
          )}

          {activeTab === "report" && currentActiveReport && (
            <ReportDashboard report={currentActiveReport} />
          )}
          
          {activeTab === "report" && !currentActiveReport && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-16 px-4 animate-fade-in">
              <BarChart3 className="w-12 h-12 mb-4 text-slate-800" />
              <h3 className="font-display font-bold text-slate-300 uppercase tracking-widest text-xs">No Active Report Selected</h3>
              <p className="text-xs mt-2 text-slate-500 max-w-sm leading-relaxed">
                Select a previously generated report from the sidebar on the left, or launch a new agent research run.
              </p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
