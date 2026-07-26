const allocationScenarioKeys = ["bull", "balanced", "bear"];
const allocationAssetKeys = ["equity", "bond", "alternative", "cash"];
const allocationRegionKeys = ["us", "developed", "emerging"];
const allowedMarketRegionKeys = ["us", "japan", "hongkong", "chinaa"];
const equityStyleTickerKeys = ["cyclical", "growth", "active"];
const equityStyleTickerLabels = {
  cyclical: "Cyclical",
  growth: "Growth",
  active: "Active",
};
const equityReturnAllocationMethodLabels = {
  baselineGap: "Baseline + positive shortfall gap",
  pureProRata: "Pure pro-rata equity target",
  manual: "Manual equity contribution",
};
const marketRiskFreeRateKeys = ["us", "developed", "hongkong", "chinaa"];
const marketRiskFreeRateLabels = {
  us: "U.S. / USD",
  developed: "Japan / JPY",
  hongkong: "Hong Kong / HKD",
  chinaa: "China A / CNY",
};
let pendingAuthReturnPage = null;

const defaults = {
  cpi: [],
  scenario: "balanced",
  systemConfig: {
    maintenance: {
      version: 0,
      lastMaintainedAt: "",
      lastMaintainedBy: "",
    },
    publicCpiSources: [
      {
        priority: 1,
        name: "Philadelphia Fed SPF CPI forecast",
        institution: "Federal Reserve Bank of Philadelphia",
        url: "https://www.philadelphiafed.org/surveys-and-data/cpi-spf",
        category: "Official survey forecast",
        kind: "forecast-page",
        active: true,
        note: "Survey of Professional Forecasters CPI reference.",
      },
      {
        priority: 2,
        name: "Cleveland Fed Inflation Nowcasting",
        institution: "Federal Reserve Bank of Cleveland",
        url: "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting",
        category: "Official nowcast",
        kind: "nowcast-page",
        active: true,
        note: "Federal Reserve Bank inflation nowcast reference.",
      },
      {
        priority: 3,
        name: "BLS CPI-U latest 12-month change reference",
        institution: "U.S. Bureau of Labor Statistics",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        documentationUrl: "https://www.bls.gov/developers/api_signature_v2.htm",
        category: "Official historical reference",
        kind: "historical-cpi-api",
        active: true,
        note: "Official CPI history for reference only.",
      },
    ],
    businessParameters: {
      scenarioBands: {
        bull: { low: 5, high: 12 },
        balanced: { low: -2, high: 2 },
        bear: { low: -12, high: -3 },
      },
      equityReturnAllocationMethod: "baselineGap",
      allocationDefaults: {
        bull: {
          assets: {
            equity: { weight: 68 },
            bond: { weight: 16 },
            alternative: { weight: 11 },
            cash: { weight: 5 },
          },
          regions: {
            us: { share: 60 },
            developed: { share: 15 },
            emerging: { share: 25 },
          },
        },
        balanced: {
          assets: {
            equity: { weight: 55 },
            bond: { weight: 25 },
            alternative: { weight: 12 },
            cash: { weight: 8 },
          },
          regions: {
            us: { share: 60 },
            developed: { share: 15 },
            emerging: { share: 25 },
          },
        },
        bear: {
          assets: {
            equity: { weight: 35 },
            bond: { weight: 42 },
            alternative: { weight: 10 },
            cash: { weight: 13 },
          },
          regions: {
            us: { share: 65 },
            developed: { share: 15 },
            emerging: { share: 20 },
          },
        },
      },
      drawdownRatioLow: 0.6,
      drawdownRatioHigh: 0.8,
      betaRelativeTolerance: 0.05,
      returnShortfallTolerance: 0.05,
      returnExcessReviewTolerance: 0.5,
	      drawdownExcessTolerance: 0.1,
	      executionQuantityTolerance: 0.01,
	      executionValueTolerance: 0.02,
	      executionWeightTolerancePp: 0.5,
      maxSingleSecurityWeight: 35,
      styleTickerMin: 2,
      styleTickerMax: 5,
      rebalanceLowerDrift: -20,
      rebalanceUpperDrift: 20,
      rebalanceCompletionDays: 3,
      testDateOverride: "",
      riskFreeRates: {
        us: 4.5,
        developed: 0.5,
        hongkong: 4.2,
        chinaa: 1.8,
      },
    },
  },
  scenarioBands: {
    bull: { type: "range", low: 5, high: 12 },
    balanced: { type: "range", low: -2, high: 2 },
    bear: { type: "range", low: -12, high: -3 },
  },
  allocationRecommendations: {
    bull: {
      note: "Bull market guidance tilts toward equities and alternatives while keeping bonds and cash as risk buffers.",
      assets: {
        equity: { label: "Equity", range: [60, 75], weight: 68, return: 8.6, volatility: 16.8, drawdown: -22.5 },
        bond: { label: "Bond", range: [10, 25], weight: 16, return: 3.8, volatility: 5.4, drawdown: -7.2 },
        alternative: { label: "Alternative", range: [8, 18], weight: 11, return: 5.2, volatility: 12.5, drawdown: -15.8 },
        cash: { label: "Cash & cash-like", range: [0, 8], weight: 5, return: 2.5, volatility: 0.8, drawdown: -0.2 },
      },
      regions: {
        us: { label: "U.S. equity", share: 60, return: 9.5, volatility: 17.5, correlation: "Core market beta anchor" },
        developed: { label: "Developed ex-U.S. equity", share: 15, return: 6.8, volatility: 16.5, correlation: "Japan-only developed ex-U.S. exposure" },
        emerging: { label: "Emerging markets equity", share: 25, return: 7.48, volatility: 22.0, correlation: "Hong Kong and China A exposure" },
      },
    },
    balanced: {
      note: "Balanced market guidance keeps equity as the return engine while using bonds, alternatives, and cash to control drawdown.",
      assets: {
        equity: { label: "Equity", range: [45, 65], weight: 55, return: 6.7, volatility: 15.5, drawdown: -19.0 },
        bond: { label: "Bond", range: [20, 35], weight: 25, return: 3.6, volatility: 5.2, drawdown: -6.5 },
        alternative: { label: "Alternative", range: [8, 18], weight: 12, return: 4.6, volatility: 11.0, drawdown: -13.0 },
        cash: { label: "Cash & cash-like", range: [5, 15], weight: 8, return: 2.4, volatility: 0.7, drawdown: -0.2 },
      },
      regions: {
        us: { label: "U.S. equity", share: 60, return: 7.5, volatility: 16.0, correlation: "Primary equity beta market" },
        developed: { label: "Developed ex-U.S. equity", share: 15, return: 5.8, volatility: 15.5, correlation: "Japan-only developed ex-U.S. exposure" },
        emerging: { label: "Emerging markets equity", share: 25, return: 6.44, volatility: 21.5, correlation: "Hong Kong and China A exposure" },
      },
    },
    bear: {
      note: "Bear market guidance reduces equity weight and increases bonds plus cash to protect drawdown capacity.",
      assets: {
        equity: { label: "Equity", range: [25, 45], weight: 35, return: 3.8, volatility: 17.0, drawdown: -24.0 },
        bond: { label: "Bond", range: [35, 55], weight: 42, return: 4.0, volatility: 5.8, drawdown: -8.0 },
        alternative: { label: "Alternative", range: [5, 15], weight: 10, return: 3.4, volatility: 10.5, drawdown: -12.0 },
        cash: { label: "Cash & cash-like", range: [8, 22], weight: 13, return: 2.6, volatility: 0.6, drawdown: -0.1 },
      },
      regions: {
        us: { label: "U.S. equity", share: 65, return: 4.4, volatility: 17.5, correlation: "Most liquid defensive equity anchor" },
        developed: { label: "Developed ex-U.S. equity", share: 15, return: 3.4, volatility: 16.5, correlation: "Japan-only developed ex-U.S. defensive exposure" },
        emerging: { label: "Emerging markets equity", share: 20, return: 3.0, volatility: 23.0, correlation: "Reduced Hong Kong and China A exposure" },
      },
    },
  },
  riskFreeRateSource: "fed12m",
  manualRiskFreeRate: 4.5,
  marketBenchmark: "VTI",
  manualMarketReturn: 9,
  drawdownRatioLow: 0.6,
  drawdownRatioHigh: 0.8,
  investmentStyle: "balanced",
  optimizerScopeRegion: "all",
  optimizerScopeAssetClass: "all",
  optimizerScopeStyle: "all",
  maxSingleSecurityWeight: 35,
  rebalanceLowerDrift: -20,
  rebalanceUpperDrift: 20,
  rebalanceCompletionDays: 3,
  rebalanceActionStatus: "Pending",
  rebalancePlanChoice: "Minimum Trade Plan",
  rebalanceAcceptedPlan: {
    plan: "",
    acceptedAt: "",
    acceptedBy: "",
    dueDate: "",
  },
  rebalanceCheckFrequency: "Monthly",
  rebalanceFormalCheckDate: "",
  rebalanceFormalCheckOpen: false,
  rebalanceOwner: "will1976",
  rebalanceException: {
    ticker: "",
    reason: "",
  },
  rebalanceExceptionCommittee: [
    { role: "Decision Committee Approver", member: "will", status: "Pending", note: "" },
  ],
	  tradeApprovalLimit: 100000,
	  reportPeriod: "weekly",
	  nonEquityNav: {
	    asOfDate: "",
	    bond: 0,
	    alternative: 0,
	    cash: 0,
	    status: "Draft",
	    submittedBy: "",
	    submittedAt: "",
	    approvedBy: "",
	    approvedAt: "",
	    rejectedBy: "",
	    rejectedAt: "",
	  },
	  reportDistributionStatus: "Draft",
  reportDistributionDate: "",
  reportRecipientGroup: "Decision Committee",
  initialPrincipal: 1000000,
  systemAdmin: "system_admin",
  currentUser: "system_admin",
  uiMode: "clean",
  auditLog: [],
  users: [
    { name: "will", group: "Decision Committee", role: "Decision Approver", active: true },
    { name: "will1976", group: "Execution Team", role: "Execution Authorizer", active: true },
  ],
  userCredentials: {
    admin: { username: "system_admin", password: "admin000" },
    decision: { username: "will", password: "141242" },
    execution: { username: "will1976", password: "517518" },
  },
  tradeOrders: [
    {
      action: "Buy",
      ticker: "VTI",
      quantity: 10,
      price: 300,
      reasonType: "Compliant",
      remark: "",
      executionApprover: "will1976",
      executionStatus: "Pending",
      committeeStatus: "Pending",
      authorizedAt: "",
    },
  ],
  proposal: {
    executionManager: "will1976",
    proposalStatus: "Draft",
    proposalNote: "",
  },
  portfolioVersion: {
    number: 1,
    status: "Draft",
    locked: false,
    lastChange: "Initial draft",
  },
  targetCommittee: [
    { role: "Decision Committee Approver", member: "will", status: "Pending", note: "" },
  ],
  committee: [
    { role: "Decision Committee Approver", member: "will", status: "Pending", note: "" },
  ],
  styleConstraints: {
    conservative: { equity: [20, 45], bond: [30, 60], alternative: [0, 15], cash: [10, 35], cyclical: [0, 20], growth: [0, 25], active: [0, 20], us: [45, 80], japan: [5, 25], hongkong: [0, 20], chinaa: [0, 15], global: [0, 30] },
    balanced: { equity: [40, 70], bond: [10, 40], alternative: [0, 20], cash: [5, 35], cyclical: [15, 45], growth: [20, 50], active: [10, 40], us: [45, 80], japan: [5, 25], hongkong: [5, 25], chinaa: [0, 20], global: [0, 30] },
    growth: { equity: [65, 90], bond: [0, 20], alternative: [0, 25], cash: [0, 15], cyclical: [20, 55], growth: [45, 80], active: [25, 60], us: [45, 80], japan: [5, 25], hongkong: [5, 25], chinaa: [5, 25], global: [0, 30] },
    income: { equity: [25, 55], bond: [25, 60], alternative: [0, 20], cash: [5, 25], cyclical: [5, 30], growth: [0, 30], active: [0, 25], us: [50, 85], japan: [5, 25], hongkong: [0, 20], chinaa: [0, 15], global: [0, 25] },
  },
  holdings: [],
};

const state = structuredClone(defaults);
let currentTargetBeta = null;
let currentTargetDrawdownBand = null;
let currentFinalTargetReturn = null;
let currentUsEquityTargetReturn = null;
let currentPortfolioBacktestPass = false;
let currentTargetReturnApproved = false;
let currentUsEquityReferenceBetaPass = false;
let currentTargetAllocationPass = false;
let currentCpiSourcePass = true;
let currentEquitySleeveTargets = {};
let activePortfolioSleeve = "us";
let optimizerOptions = [];
let selectedOptimizationOptionId = "";
let tickerReplacementPlan = null;
let approvedVersionSnapshot = null;
let priceHistory = [];
const benchmarkReferenceAutoAttempts = new Set();
let publicDataCacheAutoLoadAttempted = false;
let marketStatisticsRecommendations = null;
let betaEstimates = {};
let betaEstimateBenchmarks = {};
let actualHoldings = [];
let actualTrades = [];
let cashFlows = [];
let actualEquityValueHistory = [];
let tradeAuthorizationSyncQueue = Promise.resolve();
let reportDistributionSyncQueue = Promise.resolve();
let dataLoadRecords = [];
let dataLoadErrors = [];
let rebalanceFollowUps = [];
let dataQuality = {
  price: { status: "Missing", ok: false, message: "Historical price CSV has not been loaded." },
  publicData: { status: "Missing", ok: false, message: "Public data engine has not been run." },
  marketStats: { status: "Default", ok: true, message: "Using built-in historical allocation reference statistics." },
  tickerUniverse: { status: "Pass", ok: true, message: "Default ticker universe loaded." },
  proposedPortfolio: { status: "Missing", ok: false, message: "No proposed portfolio has been built in the system." },
  actualHoldings: { status: "Missing", ok: true, message: "Actual holdings are not required before implementation." },
  actualTrades: { status: "Missing", ok: true, message: "Actual trades are not required before execution." },
  cashFlows: { status: "Missing", ok: true, message: "External cash flows are optional." },
};
const backendState = {
  baseUrl: "",
  sessionId: "",
  user: null,
  targetPackageId: "",
  portfolioId: "",
  syncedTargetSignature: "",
  syncedPortfolioSignature: "",
  targetApprovals: {},
  portfolioApprovals: {},
  targetStatus: "Not submitted",
  portfolioStatus: "Not submitted",
  approvedTargetPackage: null,
  approvedPortfolioPackage: null,
  nonEquityNavPackageId: "",
  nonEquityNavStatus: "Not submitted",
  approvedNonEquityNavPackage: null,
  tradeAuthorizationPackageId: "",
  latestTradeAuthorizationPackage: null,
  reportDistributionId: "",
  latestReportDistribution: null,
  targetSyncInFlightSignature: "",
  targetSyncInFlightPromise: null,
  portfolioSubmissionInFlightSignature: "",
  portfolioSubmissionInFlightPromise: null,
  portfolioApprovalInFlightId: "",
  portfolioApprovalInFlightPromise: null,
};
const backendStorageKey = "investmentManagementBackendSession";
const userCredentialStorageKey = "puyanCapitalUserCredentials";
const capmPolicy = {
  minimumPositiveMarketRiskPremium: 0.5,
  betaFloor: 0,
  betaCap: 2.5,
};
const requiredDecisionApprovals = 1;
let tickerUniverse = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Core" },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Core" },
  { ticker: "QQQ", name: "Invesco QQQ Trust", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors" },
  { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF Trust", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
  { ticker: "IWM", name: "iShares Russell 2000 ETF", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
  { ticker: "NVDA", name: "NVIDIA Corporation", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors" },
  { ticker: "AAPL", name: "Apple Inc.", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
  { ticker: "MSFT", name: "Microsoft Corporation", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
  { ticker: "XOM", name: "Exxon Mobil Corporation", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
  { ticker: "BRK.B", name: "Berkshire Hathaway Inc. Class B", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Quality Compounders" },
  { ticker: "AMZN", name: "Amazon.com Inc.", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Quality Compounders" },
  { ticker: "EWJ", name: "iShares MSCI Japan ETF", market: "US ETF", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
  { ticker: "DXJ", name: "WisdomTree Japan Hedged Equity Fund", market: "US ETF", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
  { ticker: "7203.T", name: "Toyota Motor Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Japan Industrials" },
  { ticker: "6758.T", name: "Sony Group Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
  { ticker: "9984.T", name: "SoftBank Group Corp.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
  { ticker: "8306.T", name: "Mitsubishi UFJ Financial Group", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "1321.T", name: "iShares Core Nikkei 225 ETF", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
  { ticker: "1306.T", name: "NEXT FUNDS TOPIX ETF", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
  { ticker: "8035.T", name: "Tokyo Electron Limited", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
  { ticker: "6857.T", name: "Advantest Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
  { ticker: "6920.T", name: "Lasertec Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
  { ticker: "6526.T", name: "Socionext Inc.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
  { ticker: "9983.T", name: "Fast Retailing Co., Ltd.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Consumer" },
  { ticker: "6367.T", name: "Daikin Industries, Ltd.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Industrials" },
  { ticker: "7011.T", name: "Mitsubishi Heavy Industries, Ltd.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Industrials" },
  { ticker: "EWH", name: "iShares MSCI Hong Kong ETF", market: "US ETF", region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
  { ticker: "2800.HK", name: "Tracker Fund of Hong Kong", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
  { ticker: "0700.HK", name: "Tencent Holdings Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
  { ticker: "0005.HK", name: "HSBC Holdings plc", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "0388.HK", name: "Hong Kong Exchanges and Clearing Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "1299.HK", name: "AIA Group Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
  { ticker: "3690.HK", name: "Meituan", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform" },
  { ticker: "2828.HK", name: "Hang Seng H-Share Index ETF", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
  { ticker: "9988.HK", name: "Alibaba Group Holding Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform" },
  { ticker: "1810.HK", name: "Xiaomi Corporation", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
  { ticker: "2318.HK", name: "Ping An Insurance Group", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "1398.HK", name: "Industrial and Commercial Bank of China", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "ASHR", name: "Xtrackers Harvest CSI 300 China A-Shares ETF", market: "US ETF", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
  { ticker: "KBA", name: "KraneShares Bosera MSCI China A 50 Connect ETF", market: "US ETF", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
  { ticker: "510300.SS", name: "Huatai-PB CSI 300 ETF", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
  { ticker: "600519.SS", name: "Kweichow Moutai Co., Ltd.", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Leaders" },
  { ticker: "300750.SZ", name: "Contemporary Amperex Technology Co., Ltd.", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery" },
  { ticker: "601318.SS", name: "Ping An Insurance Group", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "000001.SZ", name: "Ping An Bank Co., Ltd.", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "159915.SZ", name: "China AMC ChiNext ETF", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
  { ticker: "002594.SZ", name: "BYD Company Limited", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery" },
  { ticker: "688981.SS", name: "Semiconductor Manufacturing International Corporation", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
  { ticker: "600036.SS", name: "China Merchants Bank Co., Ltd.", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
  { ticker: "000858.SZ", name: "Wuliangye Yibin Co., Ltd.", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Consumer" },
  { ticker: "BIL", name: "SPDR Bloomberg 1-3 Month T-Bill ETF", market: "US", region: "United States", assetClass: "Cash & Cash-like", styleFactor: "Defensive", theme: "Not Applicable" },
  { ticker: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", market: "US", region: "United States", assetClass: "Bond", styleFactor: "Defensive", theme: "Not Applicable" },
  { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", market: "US", region: "United States", assetClass: "Bond", styleFactor: "Defensive", theme: "Not Applicable" },
  { ticker: "GLD", name: "SPDR Gold Shares", market: "US", region: "Global", assetClass: "Alternative", styleFactor: "Defensive", theme: "Not Applicable" },
];
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const scenarioLabels = {
  bull: "Bull Market",
  balanced: "Balanced Market",
  bear: "Bear Market",
};
const equityMarketKeys = ["us", "developed", "emerging"];
const nonUsEquityMarketKeys = ["developed", "emerging"];
const equityMarketInputConfig = {
  us: {
    label: "U.S. equity",
    targetWeightId: "usEquityTargetWeight",
    contributionId: "usEquityReturnContribution",
    targetReturnId: "usEquityTargetReturn",
    cmaDisplayId: "usEquityCmaDisplay",
    targetBetaId: "usEquityAllocationTargetBeta",
    benchmarkLabel: () => selectedBenchmarkLabel(),
  },
  developed: {
    label: "Developed ex-U.S. equity",
    targetWeightId: "developedEquityTargetWeight",
    contributionId: "developedEquityReturnContribution",
    targetReturnId: "developedEquityTargetReturn",
    cmaId: "developedEquityCma",
    targetBetaId: "developedEquityTargetBeta",
    benchmarkLabel: () => "Japan local market benchmark / 1306.T",
  },
  emerging: {
    label: "Emerging markets equity",
    targetWeightId: "emergingEquityTargetWeight",
    contributionId: "emergingEquityReturnContribution",
    targetReturnId: "emergingEquityTargetReturn",
    cmaId: "emergingEquityCma",
    targetBetaId: "emergingEquityTargetBeta",
    benchmarkLabel: () => "Emerging market local benchmark / 2800.HK + 510300.SS",
  },
};

const marketBetaBenchmarkConfig = {
  japan: { symbol: "1306.T", label: "Japan local market benchmark / 1306.T" },
  hongkong: { symbol: "2800.HK", label: "Hong Kong local market benchmark / 2800.HK" },
  chinaa: { symbol: "510300.SS", label: "China A local market benchmark / 510300.SS" },
};

const el = (id) => document.getElementById(id);
const percent = (value) => `${Number(value || 0).toFixed(2)}%`;
const percentOrNoData = (value) => Number.isFinite(Number(value)) ? percent(value) : "No data";

function backendBaseUrl() {
  if (backendState.baseUrl) return backendState.baseUrl;
  if (window.location.protocol.startsWith("http")) return window.location.origin;
  return "http://localhost:8787";
}

function updateBackendStatus(message, ok = true) {
  const status = el("backendStatus");
  if (!status) return;
  status.textContent = `Local data service status: ${message}`;
  status.className = ok ? "validation-message is-valid" : "validation-message is-invalid";
  updateWorkflowOverview();
}

function saveBackendSession() {
  if (!backendState.sessionId || !backendState.user) return;
  try {
    localStorage.setItem(backendStorageKey, JSON.stringify({
      sessionId: backendState.sessionId,
      user: backendState.user,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    updateBackendStatus("connected, but browser storage is unavailable for session restore.", false);
  }
}

function clearBackendSession() {
  backendState.sessionId = "";
  backendState.user = null;
  clearBackendTargetWorkflowState();
  clearBackendPortfolioWorkflowState();
  updateBackendWorkflowStatus();
  try {
    localStorage.removeItem(backendStorageKey);
  } catch {
    // Ignore storage cleanup errors; the in-memory state has already been cleared.
  }
}

function clearBackendTargetWorkflowState({ keepApprovedTarget = false } = {}) {
  backendState.targetPackageId = "";
  backendState.syncedTargetSignature = "";
  backendState.targetApprovals = {};
  backendState.targetStatus = "Not submitted";
  if (!keepApprovedTarget) backendState.approvedTargetPackage = null;
}

function clearBackendPortfolioWorkflowState() {
  backendState.portfolioId = "";
  backendState.syncedPortfolioSignature = "";
  backendState.portfolioApprovals = {};
  backendState.portfolioStatus = "Not submitted";
  backendState.approvedPortfolioPackage = null;
  backendState.tradeAuthorizationPackageId = "";
  backendState.latestTradeAuthorizationPackage = null;
  backendState.reportDistributionId = "";
  backendState.latestReportDistribution = null;
}

function applyBackendUser(user, statusMessage) {
  backendState.user = user;
  mergeBackendUserIntoLocalState(user);
  state.currentUser = user.name;
  el("currentUserName").value = user.name;
  el("backendUserId").value = user.id;
  updatePermissionStatus(`Current acting user set to backend user ${user.name}.`, true);
  updateBackendStatus(statusMessage || `connected as ${user.name} (${user.group}).`, true);
  refreshSelfProfileForm();
  refreshGovernanceAfterUserChange();
}

async function backendRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (backendState.sessionId) headers["x-session-id"] = backendState.sessionId;
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Backend request failed with status ${response.status}`);
  }
  return payload;
}

function backendUserExistsLocally(user) {
  return state.users.some((item) => item.name === user.name);
}

function mergeBackendUserIntoLocalState(user) {
  if (!user || backendUserExistsLocally(user)) return;
  if (user.group === "System Administrator") {
    state.systemAdmin = user.name;
    state.userCredentials.admin.username = user.name;
    if (el("systemAdminName")) el("systemAdminName").value = user.name;
    updateGateLoginUserLabels();
    return;
  }
  state.users.push({
    name: user.name,
    group: user.group,
    role: user.role,
    active: user.active !== false,
  });
  renderUsers();
  refreshGovernanceAfterUserChange();
}

async function loginBackendUser() {
  const userId = el("backendUserId").value;
  await loginBackendUserById(userId);
}

async function loginBackendUserById(userId, options = {}) {
  const {
    loadApprovedTarget = true,
    loadApprovedPortfolio = true,
    loadApprovedNonEquityNav = true,
    loadTradeAuthorizations = true,
    loadRuntimeImports = true,
    loadReportDistribution = true,
    password = "",
  } = options;
  try {
    const body = { userId };
    if (password !== "") body.password = password;
    const result = await backendRequest("/api/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    backendState.sessionId = result.session.id;
    applyBackendUser(result.user, `connected as ${result.user.name} (${result.user.group}).`);
    saveBackendSession();
    await loadSystemConfigFromBackend();
    if (loadApprovedTarget) await loadLatestApprovedTargetFromBackend();
    if (loadApprovedPortfolio) await loadLatestApprovedPortfolioFromBackend();
    if (loadApprovedNonEquityNav) await loadLatestApprovedNonEquityNavFromBackend();
    if (loadTradeAuthorizations) await loadLatestTradeAuthorizationsFromBackend();
    if (loadRuntimeImports) await restoreRuntimeImportsFromBackend();
    if (loadReportDistribution) await loadLatestReportDistributionFromBackend();
    logAudit("Backend login", `${result.user.name} connected to local backend`);
    return result;
  } catch (error) {
    clearBackendSession();
    updateBackendStatus(`login failed. ${error.message}`, false);
    throw error;
  }
}

function backendUserIdForRole(role) {
  if (role === "admin") return "admin-1";
  if (role === "decision") return "committee-1";
  if (role === "execution") return "execution-1";
  return "";
}

function backendSyncAvailable() {
  return window.location.protocol.startsWith("http");
}

async function ensureBackendSessionForRole(role, options = {}) {
  if (!backendSyncAvailable()) return false;
  const userId = backendUserIdForRole(role);
  if (!userId) return false;
  if (backendState.sessionId && backendState.user?.id === userId) return true;
  await loginBackendUserById(userId, options);
  return true;
}

async function syncUserProfileToBackend(role, alias, password) {
  if (!backendSyncAvailable()) return null;
  await ensureBackendSessionForRole(role);
  const result = await backendRequest("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify({
      userId: backendUserIdForRole(role),
      name: alias,
      password,
    }),
  });
  backendState.user = result.user;
  if (el("backendUserId")) el("backendUserId").value = result.user.id;
  saveBackendSession();
  updateBackendStatus(`profile synced for ${result.user.name}.`, true);
  return result.user;
}

function updateSystemConfigStatus(message, ok = true) {
  const status = el("systemConfigStatus");
  if (!status) return;
  status.textContent = message;
  status.className = ok ? "validation-message is-valid" : "validation-message is-invalid";
}

function normalizeAllocationDefaults(input = {}, base = defaults.systemConfig.businessParameters.allocationDefaults) {
  const merged = {};
  allocationScenarioKeys.forEach((scenario) => {
    merged[scenario] = { assets: {}, regions: {} };
    allocationAssetKeys.forEach((asset) => {
      const fallback = base?.[scenario]?.assets?.[asset] || {};
      const source = input?.[scenario]?.assets?.[asset] || {};
      const weight = Number.isFinite(Number(source.weight)) ? Number(source.weight) : fallback.weight;
      merged[scenario].assets[asset] = { ...fallback, ...source, weight };
    });
    allocationRegionKeys.forEach((region) => {
      const fallback = base?.[scenario]?.regions?.[region] || {};
      const source = input?.[scenario]?.regions?.[region] || {};
      const share = Number.isFinite(Number(source.share)) ? Number(source.share) : fallback.share;
      merged[scenario].regions[region] = { ...fallback, ...source, share };
    });
  });
  return merged;
}

function normalizeRiskFreeRates(input = {}, base = defaults.systemConfig.businessParameters.riskFreeRates) {
  return Object.fromEntries(marketRiskFreeRateKeys.map((key) => {
    const source = Number(input?.[key]);
    const fallback = Number(base?.[key]);
    return [key, Number.isFinite(source) ? source : (Number.isFinite(fallback) ? fallback : 0)];
  }));
}

function normalizeClientSystemConfig(config = {}) {
  const base = structuredClone(defaults.systemConfig);
  const businessParameters = config.businessParameters || {};
  const rawStyleTickerMin = Number(businessParameters.styleTickerMin ?? base.businessParameters.styleTickerMin);
  const rawStyleTickerMax = Number(businessParameters.styleTickerMax ?? base.businessParameters.styleTickerMax);
  const styleTickerMin = Math.max(0, Math.round(Number.isFinite(rawStyleTickerMin) ? rawStyleTickerMin : base.businessParameters.styleTickerMin));
  const styleTickerMax = Math.max(styleTickerMin, Math.round(Number.isFinite(rawStyleTickerMax) ? rawStyleTickerMax : base.businessParameters.styleTickerMax));
  const toleranceValue = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
  };
  const hasConfiguredRiskFreeRates = businessParameters.riskFreeRates
    && typeof businessParameters.riskFreeRates === "object";
  const rawMaxSingleSecurityWeight = Number(businessParameters.maxSingleSecurityWeight);
  const maxSingleSecurityWeight = Number.isFinite(rawMaxSingleSecurityWeight)
    ? (!hasConfiguredRiskFreeRates && rawMaxSingleSecurityWeight === 15
      ? base.businessParameters.maxSingleSecurityWeight
      : rawMaxSingleSecurityWeight)
    : base.businessParameters.maxSingleSecurityWeight;
  return {
    maintenance: {
      ...base.maintenance,
      ...(config.maintenance || {}),
      version: Math.max(0, Math.round(Number(config.maintenance?.version ?? base.maintenance.version))),
      lastMaintainedAt: config.maintenance?.lastMaintainedAt || base.maintenance.lastMaintainedAt,
      lastMaintainedBy: config.maintenance?.lastMaintainedBy || base.maintenance.lastMaintainedBy,
    },
    publicCpiSources: Array.isArray(config.publicCpiSources) && config.publicCpiSources.length
      ? config.publicCpiSources.map((source, index) => ({
        priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : index + 1,
        name: source.name || `Trusted CPI source ${index + 1}`,
        institution: source.institution || "",
        url: source.url || "",
        documentationUrl: source.documentationUrl || "",
        category: source.category || "Trusted public source",
        kind: source.kind || "forecast-page",
        active: source.active !== false,
        note: source.note || "",
      }))
      : base.publicCpiSources,
    businessParameters: {
      ...base.businessParameters,
      ...businessParameters,
      scenarioBands: {
        ...base.businessParameters.scenarioBands,
        ...(businessParameters.scenarioBands || {}),
      },
      styleTickerMin,
      styleTickerMax,
      betaRelativeTolerance: toleranceValue(
        businessParameters.betaRelativeTolerance,
        base.businessParameters.betaRelativeTolerance,
      ),
      returnShortfallTolerance: toleranceValue(
        businessParameters.returnShortfallTolerance,
        base.businessParameters.returnShortfallTolerance,
      ),
      returnExcessReviewTolerance: toleranceValue(
        businessParameters.returnExcessReviewTolerance,
        base.businessParameters.returnExcessReviewTolerance,
      ),
	      drawdownExcessTolerance: toleranceValue(
	        businessParameters.drawdownExcessTolerance,
	        base.businessParameters.drawdownExcessTolerance,
	      ),
	      executionQuantityTolerance: toleranceValue(
	        businessParameters.executionQuantityTolerance,
	        base.businessParameters.executionQuantityTolerance,
	      ),
	      executionValueTolerance: toleranceValue(
	        businessParameters.executionValueTolerance,
	        base.businessParameters.executionValueTolerance,
	      ),
	      executionWeightTolerancePp: (() => {
	        const number = Number(businessParameters.executionWeightTolerancePp);
	        return Number.isFinite(number) && number >= 0 && number <= 100
	          ? number
	          : base.businessParameters.executionWeightTolerancePp;
	      })(),
	      maxSingleSecurityWeight,
      testDateOverride: normalizedIsoDate(businessParameters.testDateOverride),
      equityReturnAllocationMethod: Object.keys(equityReturnAllocationMethodLabels).includes(businessParameters.equityReturnAllocationMethod)
        ? businessParameters.equityReturnAllocationMethod
        : base.businessParameters.equityReturnAllocationMethod,
      allocationDefaults: normalizeAllocationDefaults(
        businessParameters.allocationDefaults,
        base.businessParameters.allocationDefaults,
      ),
      riskFreeRates: normalizeRiskFreeRates(
        businessParameters.riskFreeRates,
        base.businessParameters.riskFreeRates,
      ),
    },
  };
}

function normalizedIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return "";
  return raw;
}

function numberWithFallback(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function applySystemConfigToWorkflow() {
  const params = state.systemConfig.businessParameters || defaults.systemConfig.businessParameters;
  const bands = params.scenarioBands || defaults.systemConfig.businessParameters.scenarioBands;
  const setNumber = (id, value, digits = 2) => {
    if (el(id)) el(id).value = Number(value || 0).toFixed(digits);
  };
  setNumber("bullLow", bands.bull?.low ?? defaults.scenarioBands.bull.low);
  setNumber("bullHigh", bands.bull?.high ?? defaults.scenarioBands.bull.high);
  setNumber("balancedLow", bands.balanced?.low ?? defaults.scenarioBands.balanced.low);
  setNumber("balancedHigh", bands.balanced?.high ?? defaults.scenarioBands.balanced.high);
  setNumber("bearLow", bands.bear?.low ?? defaults.scenarioBands.bear.low);
  setNumber("bearHigh", bands.bear?.high ?? defaults.scenarioBands.bear.high);
  setNumber("drawdownRatioLow", params.drawdownRatioLow ?? defaults.drawdownRatioLow);
  setNumber("drawdownRatioHigh", params.drawdownRatioHigh ?? defaults.drawdownRatioHigh);
  const riskFreeRates = normalizeRiskFreeRates(params.riskFreeRates);
  setNumber("configRiskFreeUs", riskFreeRates.us);
  setNumber("configRiskFreeDeveloped", riskFreeRates.developed);
  setNumber("configRiskFreeHongKong", riskFreeRates.hongkong);
  setNumber("configRiskFreeChinaA", riskFreeRates.chinaa);
  if (el("maxSingleSecurityWeight")) el("maxSingleSecurityWeight").value = params.maxSingleSecurityWeight ?? defaults.maxSingleSecurityWeight;
  if (el("configStyleTickerMin")) el("configStyleTickerMin").value = params.styleTickerMin ?? defaults.systemConfig.businessParameters.styleTickerMin;
  if (el("configStyleTickerMax")) el("configStyleTickerMax").value = params.styleTickerMax ?? defaults.systemConfig.businessParameters.styleTickerMax;
  if (el("rebalanceLowerDrift")) el("rebalanceLowerDrift").value = params.rebalanceLowerDrift ?? defaults.rebalanceLowerDrift;
  if (el("rebalanceUpperDrift")) el("rebalanceUpperDrift").value = params.rebalanceUpperDrift ?? defaults.rebalanceUpperDrift;
  if (el("rebalanceCompletionDays")) el("rebalanceCompletionDays").value = params.rebalanceCompletionDays ?? defaults.rebalanceCompletionDays;
  if (el("configTestDateOverride")) el("configTestDateOverride").value = params.testDateOverride || "";
  state.rebalanceLowerDrift = Number(params.rebalanceLowerDrift ?? defaults.rebalanceLowerDrift);
  state.rebalanceUpperDrift = Number(params.rebalanceUpperDrift ?? defaults.rebalanceUpperDrift);
  state.rebalanceCompletionDays = Math.max(1, Number(params.rebalanceCompletionDays || defaults.rebalanceCompletionDays));
  updateEstimationPeriod();
  calculate({ resetManualTarget: true });
  renderHoldings();
  renderActualHoldings();
}

function populateSystemConfigInputs() {
  const params = state.systemConfig.businessParameters || defaults.systemConfig.businessParameters;
  const bands = params.scenarioBands || defaults.systemConfig.businessParameters.scenarioBands;
  const riskFreeRates = normalizeRiskFreeRates(params.riskFreeRates);
  const values = {
    configBullLow: bands.bull?.low,
    configBullHigh: bands.bull?.high,
    configBalancedLow: bands.balanced?.low,
    configBalancedHigh: bands.balanced?.high,
    configBearLow: bands.bear?.low,
    configBearHigh: bands.bear?.high,
    configDrawdownRatioLow: params.drawdownRatioLow,
    configDrawdownRatioHigh: params.drawdownRatioHigh,
    configRiskFreeUs: riskFreeRates.us,
    configRiskFreeDeveloped: riskFreeRates.developed,
    configRiskFreeHongKong: riskFreeRates.hongkong,
    configRiskFreeChinaA: riskFreeRates.chinaa,
    configBetaRelativeTolerance: Number(params.betaRelativeTolerance || 0) * 100,
	    configReturnShortfallTolerance: Number(params.returnShortfallTolerance || 0) * 100,
	    configReturnExcessReviewTolerance: Number(params.returnExcessReviewTolerance || 0) * 100,
	    configDrawdownExcessTolerance: Number(params.drawdownExcessTolerance || 0) * 100,
	    configExecutionQuantityTolerance: Number(params.executionQuantityTolerance || 0) * 100,
	    configExecutionValueTolerance: Number(params.executionValueTolerance || 0) * 100,
	    configExecutionWeightTolerance: params.executionWeightTolerancePp,
	    configMaxSingleSecurityWeight: params.maxSingleSecurityWeight,
    configStyleTickerMin: params.styleTickerMin,
    configStyleTickerMax: params.styleTickerMax,
    configRebalanceLowerDrift: params.rebalanceLowerDrift,
    configRebalanceUpperDrift: params.rebalanceUpperDrift,
    configRebalanceCompletionDays: params.rebalanceCompletionDays,
    configTestDateOverride: params.testDateOverride || "",
  };
  Object.entries(values).forEach(([id, value]) => {
    if (el(id)) el(id).value = value ?? "";
  });
  if (el("configEquityReturnAllocationMethod")) {
    el("configEquityReturnAllocationMethod").value = params.equityReturnAllocationMethod || "baselineGap";
  }
}

function configAllocationInputId(scenario, type, key) {
  return `configAllocation${scenario[0].toUpperCase()}${scenario.slice(1)}${type[0].toUpperCase()}${type.slice(1)}${key[0].toUpperCase()}${key.slice(1)}`;
}

function renderSystemConfigAllocationDefaults() {
  const body = el("configAllocationRows");
  if (!body) return;
  const params = state.systemConfig.businessParameters || defaults.systemConfig.businessParameters;
  const allocationDefaults = normalizeAllocationDefaults(params.allocationDefaults);
  body.replaceChildren();
  allocationScenarioKeys.forEach((scenario) => {
    const row = document.createElement("tr");
    const scenarioCell = document.createElement("td");
    scenarioCell.textContent = scenarioLabels[scenario];
    row.append(scenarioCell);

    allocationAssetKeys.forEach((asset) => {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.id = configAllocationInputId(scenario, "asset", asset);
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.step = "0.1";
      input.value = Number(allocationDefaults[scenario].assets[asset].weight || 0).toFixed(1);
      cell.append(input);
      row.append(cell);
    });

    allocationRegionKeys.forEach((region) => {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.id = configAllocationInputId(scenario, "region", region);
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.step = "0.1";
      input.value = Number(allocationDefaults[scenario].regions[region].share || 0).toFixed(1);
      cell.append(input);
      row.append(cell);
    });

    body.append(row);
  });
}

function parameterPercent(value, digits = 2) {
  const number = Number(value || 0);
  return `${number.toFixed(digits)}%`;
}

function scenarioBandSummary(bands) {
  return [
    `Bull ${parameterPercent(bands.bull?.low)} to ${parameterPercent(bands.bull?.high)}`,
    `Balanced ${parameterPercent(bands.balanced?.low)} to ${parameterPercent(bands.balanced?.high)}`,
    `Bear ${parameterPercent(bands.bear?.low)} to ${parameterPercent(bands.bear?.high)}`,
  ].join("; ");
}

function allocationAssetSummary(allocationDefaults) {
  return allocationScenarioKeys.map((scenario) => {
    const assets = allocationDefaults[scenario].assets;
    return `${scenarioLabels[scenario]}: Equity ${parameterPercent(assets.equity.weight, 1)}, Bond ${parameterPercent(assets.bond.weight, 1)}, Alt ${parameterPercent(assets.alternative.weight, 1)}, Cash ${parameterPercent(assets.cash.weight, 1)}`;
  }).join("; ");
}

function allocationRegionSummary(allocationDefaults) {
  return allocationScenarioKeys.map((scenario) => {
    const regions = allocationDefaults[scenario].regions;
    return `${scenarioLabels[scenario]}: U.S. ${parameterPercent(regions.us.share, 1)}, Developed ${parameterPercent(regions.developed.share, 1)}, Emerging ${parameterPercent(regions.emerging.share, 1)}`;
  }).join("; ");
}

function parameterMaintenanceRows() {
  const config = normalizeClientSystemConfig(state.systemConfig);
  const params = config.businessParameters;
  const bands = params.scenarioBands;
  const allocationDefaults = normalizeAllocationDefaults(params.allocationDefaults);
  const riskFreeRates = normalizeRiskFreeRates(params.riskFreeRates);
  const activeSources = config.publicCpiSources.filter((source) => source.active !== false).length;
  return [
    {
      category: "Trusted data sources",
      parameter: "CPI source priority list",
      value: `${activeSources} active / ${config.publicCpiSources.length} configured`,
      note: "Maintain approved public CPI sources in priority order. Numeric CPI values still require committee-accepted source inclusion.",
      usedIn: "Annual target return CPI estimate and public-source lookup.",
    },
    {
      category: "Target return",
      parameter: "Bull / Balanced / Bear market bands",
      value: scenarioBandSummary(bands),
      note: "Defines the allowed manual market-outlook value after the committee selects a scenario.",
      usedIn: "Annual target return formula and target approval gate.",
    },
    {
      category: "Target drawdown",
      parameter: "Drawdown ratio range",
      value: `${Number(params.drawdownRatioLow).toFixed(2)} to ${Number(params.drawdownRatioHigh).toFixed(2)}`,
      note: "Target maximum drawdown is derived from target return divided by this ratio range.",
      usedIn: "Target max drawdown budget and sleeve drawdown checks.",
    },
    {
      category: "Allocation defaults",
      parameter: "Scenario asset-class weights",
      value: allocationAssetSummary(allocationDefaults),
      note: "Fallback asset-class weights if annual public-data statistics are unavailable or incomplete.",
      usedIn: "Annual public-data recommendation and target return decomposition.",
    },
    {
      category: "Allocation defaults",
      parameter: "Equity sleeve regional shares",
      value: allocationRegionSummary(allocationDefaults),
      note: "Fallback equity-sleeve shares if the annual public-data engine cannot generate complete market shares.",
      usedIn: "Sleeve target returns, market-specific beta targets, portfolio construction.",
    },
    {
      category: "CAPM / beta",
      parameter: "Market-specific risk-free rates",
      value: `U.S. ${parameterPercent(riskFreeRates.us)}, Japan ${parameterPercent(riskFreeRates.developed)}, Hong Kong ${parameterPercent(riskFreeRates.hongkong)}, China A ${parameterPercent(riskFreeRates.chinaa)}`,
      note: "Each sleeve uses the risk-free rate for its local market proxy rather than a single global risk-free rate.",
      usedIn: "CAPM target beta by equity sleeve and Sharpe/Sortino reporting.",
    },
    {
      category: "CAPM / beta",
      parameter: "Equity return allocation method",
      value: equityReturnAllocationMethodLabels[params.equityReturnAllocationMethod] || params.equityReturnAllocationMethod,
      note: "Controls how residual target return is allocated from total portfolio target into equity sleeve targets.",
      usedIn: "Sleeve target return and target beta calculation.",
    },
    {
      category: "Backtest controls",
      parameter: "Beta / return / drawdown tolerances",
      value: `Beta ${parameterPercent(params.betaRelativeTolerance * 100, 1)}, return shortfall ${parameterPercent(params.returnShortfallTolerance * 100, 1)}, high-return review ${parameterPercent(params.returnExcessReviewTolerance * 100, 1)}, drawdown excess ${parameterPercent(params.drawdownExcessTolerance * 100, 1)}`,
      note: "Defines pass/review thresholds for proposed portfolio backtest and optimizer validation.",
      usedIn: "Backtest result, optimization acceptance, and report review notes.",
    },
    {
      category: "Portfolio construction",
      parameter: "Ticker diversification and single-name limit",
      value: `Style bucket ${params.styleTickerMin}-${params.styleTickerMax} tickers; single security max ${parameterPercent(params.maxSingleSecurityWeight, 1)} of sleeve`,
      note: "Controls concentration risk inside each sleeve/style bucket.",
      usedIn: "Proposed portfolio entry, validation warnings, optimizer constraints.",
    },
    {
      category: "Rebalancing",
      parameter: "Monthly corridor and completion deadline",
      value: `${parameterPercent(params.rebalanceLowerDrift, 1)} to ${parameterPercent(params.rebalanceUpperDrift, 1)} corridor; ${params.rebalanceCompletionDays} trading day(s)`,
      note: "Formal monthly check triggers a standard rebalance plan only when sleeve/style weights breach corridor.",
      usedIn: "Monitoring & Rebalance alerts, accepted plans, escalation timing.",
    },
    {
      category: "Execution control",
      parameter: "Trade and holding completion tolerances",
      value: `Qty ${parameterPercent(params.executionQuantityTolerance * 100, 1)}, value ${parameterPercent(params.executionValueTolerance * 100, 1)}, holding ${Number(params.executionWeightTolerancePp || 0).toFixed(1)} pp`,
      note: "Defines acceptable execution difference when comparing authorized trades against next imported trades/holdings.",
      usedIn: "Execution authorization reconciliation and next-day holding completion check.",
    },
    {
      category: "Formal testing",
      parameter: "Testing / replay date",
      value: params.testDateOverride || "Live date",
      note: "Optional. When set, workflow dates, source dates, and deadline checks use this replay date for formal backtesting.",
      usedIn: "Teresa-style end-to-end scenario replay, target estimation period, CPI source date, and due-date checks.",
    },
  ];
}

function renderParameterMaintenanceRegister() {
  const body = el("parameterMaintenanceRows");
  if (!body) return;
  const maintenance = normalizeClientSystemConfig(state.systemConfig).maintenance;
  if (el("parameterMaintenanceVersion")) {
    el("parameterMaintenanceVersion").textContent = maintenance.version > 0 ? `v${maintenance.version}` : "Draft";
  }
  if (el("parameterMaintenanceTimestamp")) {
    const timestamp = maintenance.lastMaintainedAt
      ? `${new Date(maintenance.lastMaintainedAt).toLocaleString()} by ${maintenance.lastMaintainedBy || "System Administrator"}`
      : "Not saved yet";
    el("parameterMaintenanceTimestamp").textContent = timestamp;
  }
  if (el("systemDefaultConfigNotice")) {
    if (maintenance.version > 0) {
      el("systemDefaultConfigNotice").textContent = `Active backend parameter version ${maintenance.version} is loaded. Unchanged fields keep their current active values.`;
      el("systemDefaultConfigNotice").className = "validation-message is-valid";
    } else {
      el("systemDefaultConfigNotice").textContent = "System defaults are pre-filled. If the administrator does not change a field, the default value will be submitted as the active backend parameter.";
      el("systemDefaultConfigNotice").className = "validation-message is-warning";
    }
  }
  body.replaceChildren();
  parameterMaintenanceRows().forEach((item) => {
    const row = document.createElement("tr");
    [item.category, item.parameter, item.value, item.note, item.usedIn].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function renderSystemConfigSources() {
  const body = el("configCpiSourceRows");
  const template = el("configCpiSourceTemplate");
  if (!body || !template) return;
  body.replaceChildren();
  state.systemConfig.publicCpiSources
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
    .forEach((source, index) => {
      const row = template.content.firstElementChild.cloneNode(true);
      const priority = row.querySelector(".config-source-priority");
      const name = row.querySelector(".config-source-name");
      const institution = row.querySelector(".config-source-institution");
      const category = row.querySelector(".config-source-category");
      const url = row.querySelector(".config-source-url");
      const active = row.querySelector(".config-source-active");
      const remove = row.querySelector(".config-source-remove");

      priority.value = source.priority || index + 1;
      name.value = source.name || "";
      institution.value = source.institution || "";
      category.value = source.category || "";
      url.value = source.url || "";
      active.checked = source.active !== false;

      const updateSource = () => {
        source.priority = Math.max(1, Number.parseInt(priority.value, 10) || index + 1);
        source.name = name.value.trim();
        source.institution = institution.value.trim();
        source.category = category.value.trim();
        source.url = url.value.trim();
        source.active = active.checked;
      };
      [priority, name, institution, category, url].forEach((input) => input.addEventListener("input", updateSource));
      active.addEventListener("change", updateSource);
      remove.addEventListener("click", () => {
        if (!requirePermission("admin", "remove trusted CPI source")) return;
        state.systemConfig.publicCpiSources.splice(index, 1);
        renderSystemConfigSources();
        updateSystemConfigStatus("System configuration changed. Save configuration to persist it.", false);
      });
      body.append(row);
    });
}

function renderSystemConfig() {
  state.systemConfig = normalizeClientSystemConfig(state.systemConfig);
  renderSystemConfigSources();
  renderSystemConfigAllocationDefaults();
  populateSystemConfigInputs();
  renderParameterMaintenanceRegister();
  applySystemConfigToWorkflow();
}

function collectSystemConfigFromInputs() {
  const current = normalizeClientSystemConfig(state.systemConfig);
  const allocationDefaults = normalizeAllocationDefaults(current.businessParameters.allocationDefaults);
  allocationScenarioKeys.forEach((scenario) => {
    allocationAssetKeys.forEach((asset) => {
      const id = configAllocationInputId(scenario, "asset", asset);
      allocationDefaults[scenario].assets[asset].weight = numberWithFallback(
        el(id)?.value,
        allocationDefaults[scenario].assets[asset].weight,
      );
    });
    allocationRegionKeys.forEach((region) => {
      const id = configAllocationInputId(scenario, "region", region);
      allocationDefaults[scenario].regions[region].share = numberWithFallback(
        el(id)?.value,
        allocationDefaults[scenario].regions[region].share,
      );
    });
  });
  return normalizeClientSystemConfig({
    publicCpiSources: current.publicCpiSources,
    businessParameters: {
      scenarioBands: {
        bull: {
          low: numberWithFallback(el("configBullLow").value, current.businessParameters.scenarioBands.bull.low),
          high: numberWithFallback(el("configBullHigh").value, current.businessParameters.scenarioBands.bull.high),
        },
        balanced: {
          low: numberWithFallback(el("configBalancedLow").value, current.businessParameters.scenarioBands.balanced.low),
          high: numberWithFallback(el("configBalancedHigh").value, current.businessParameters.scenarioBands.balanced.high),
        },
        bear: {
          low: numberWithFallback(el("configBearLow").value, current.businessParameters.scenarioBands.bear.low),
          high: numberWithFallback(el("configBearHigh").value, current.businessParameters.scenarioBands.bear.high),
        },
      },
      drawdownRatioLow: numberWithFallback(el("configDrawdownRatioLow").value, current.businessParameters.drawdownRatioLow),
      drawdownRatioHigh: numberWithFallback(el("configDrawdownRatioHigh").value, current.businessParameters.drawdownRatioHigh),
      riskFreeRates: {
        us: numberWithFallback(el("configRiskFreeUs")?.value, current.businessParameters.riskFreeRates.us),
        developed: numberWithFallback(el("configRiskFreeDeveloped")?.value, current.businessParameters.riskFreeRates.developed),
        hongkong: numberWithFallback(el("configRiskFreeHongKong")?.value, current.businessParameters.riskFreeRates.hongkong),
        chinaa: numberWithFallback(el("configRiskFreeChinaA")?.value, current.businessParameters.riskFreeRates.chinaa),
      },
      betaRelativeTolerance: numberWithFallback(el("configBetaRelativeTolerance")?.value, current.businessParameters.betaRelativeTolerance * 100) / 100,
	      returnShortfallTolerance: numberWithFallback(el("configReturnShortfallTolerance")?.value, current.businessParameters.returnShortfallTolerance * 100) / 100,
	      returnExcessReviewTolerance: numberWithFallback(el("configReturnExcessReviewTolerance")?.value, current.businessParameters.returnExcessReviewTolerance * 100) / 100,
	      drawdownExcessTolerance: numberWithFallback(el("configDrawdownExcessTolerance")?.value, current.businessParameters.drawdownExcessTolerance * 100) / 100,
	      executionQuantityTolerance: numberWithFallback(el("configExecutionQuantityTolerance")?.value, current.businessParameters.executionQuantityTolerance * 100) / 100,
	      executionValueTolerance: numberWithFallback(el("configExecutionValueTolerance")?.value, current.businessParameters.executionValueTolerance * 100) / 100,
	      executionWeightTolerancePp: numberWithFallback(el("configExecutionWeightTolerance")?.value, current.businessParameters.executionWeightTolerancePp),
	      maxSingleSecurityWeight: numberWithFallback(el("configMaxSingleSecurityWeight").value, current.businessParameters.maxSingleSecurityWeight),
      styleTickerMin: Math.max(0, Math.round(numberWithFallback(el("configStyleTickerMin")?.value, current.businessParameters.styleTickerMin))),
      styleTickerMax: Math.max(1, Math.round(numberWithFallback(el("configStyleTickerMax")?.value, current.businessParameters.styleTickerMax))),
      rebalanceLowerDrift: numberWithFallback(el("configRebalanceLowerDrift").value, current.businessParameters.rebalanceLowerDrift),
      rebalanceUpperDrift: numberWithFallback(el("configRebalanceUpperDrift").value, current.businessParameters.rebalanceUpperDrift),
      rebalanceCompletionDays: Math.max(1, Math.round(numberWithFallback(el("configRebalanceCompletionDays").value, current.businessParameters.rebalanceCompletionDays))),
      testDateOverride: normalizedIsoDate(el("configTestDateOverride")?.value),
      equityReturnAllocationMethod: el("configEquityReturnAllocationMethod")?.value || current.businessParameters.equityReturnAllocationMethod,
      allocationDefaults,
    },
  });
}

function addConfiguredCpiSource() {
  if (!requirePermission("admin", "add trusted CPI source")) return;
  state.systemConfig.publicCpiSources.push({
    priority: state.systemConfig.publicCpiSources.length + 1,
    name: "New trusted CPI source",
    institution: "",
    url: "",
    category: "Trusted public source",
    kind: "forecast-page",
    active: true,
    note: "",
  });
  renderSystemConfigSources();
  updateSystemConfigStatus("System configuration changed. Save configuration to persist it.", false);
}

async function loadSystemConfigFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return;
  try {
    const result = await backendRequest("/api/system-config");
    state.systemConfig = normalizeClientSystemConfig(result.systemConfig);
    renderSystemConfig();
    updateSystemConfigStatus("System configuration loaded from backend.", true);
  } catch (error) {
    updateSystemConfigStatus(`System configuration could not be loaded: ${error.message}`, false);
  }
}

function captureEquitySleeveTargetSnapshot(key) {
  const config = equityMarketInputConfig[key];
  const target = currentEquitySleeveTargets[key] || {};
  return {
    label: config?.label || key,
    weight: config ? readNumber(el(config.targetWeightId)) : null,
    contribution: config ? readNumber(el(config.contributionId)) : null,
    targetReturn: Number.isFinite(Number(target.targetReturn)) ? Number(target.targetReturn) : null,
    cma: Number.isFinite(Number(target.cma)) ? Number(target.cma) : marketCmaForSleeve(key),
    riskFreeRate: Number.isFinite(Number(target.riskFreeRate)) ? Number(target.riskFreeRate) : sleeveRiskFreeRate(key),
    beta: Number.isFinite(Number(target.beta)) ? Number(target.beta) : null,
    benchmark: target.benchmark || config?.benchmarkLabel?.() || "",
    drawdownBand: target.drawdownBand || null,
  };
}

function captureAnnualDecisionSnapshot() {
  const recommendation = currentAllocationRecommendation();
  const params = normalizeClientSystemConfig(state.systemConfig).businessParameters;
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    scenarioKey: selectedScenario(),
    scenarioLabel: scenarioLabels[selectedScenario()],
    finalTargetReturn: currentFinalTargetReturn,
    operatingCost: readNumber(el("costRate")),
    cpiEstimate: chosenRate("cpi"),
    selectedOutlookRate: readNumber(el("selectedOutlookRate")),
    initialPrincipal: reportInitialPrincipal(),
    benchmark: {
      proxy: benchmarkProxy(),
      label: selectedBenchmarkLabel(),
    },
    drawdownRatios: selectedDrawdownRatioRange(),
    targetDrawdownBand: currentTargetDrawdownBand,
    equityReturnAllocationMethod: selectedEquityReturnAllocationMethod(),
    allocationRecommendation: structuredClone(recommendation),
    riskFreeRates: normalizeRiskFreeRates(params.riskFreeRates),
    equitySleeveTargets: Object.fromEntries(equityMarketKeys.map((key) => [
      key,
      captureEquitySleeveTargetSnapshot(key),
    ])),
  };
}

function setNumberInputValue(id, value, digits = 2) {
  const node = el(id);
  const number = Number(value);
  if (node && Number.isFinite(number)) node.value = number.toFixed(digits);
}

function applyAnnualDecisionSnapshotToInputs(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const scenarioKey = snapshot.scenarioKey;
  if (scenarioKey && scenarioLabels[scenarioKey]) {
    const scenarioInput = document.querySelector(`input[name='marketScenario'][value='${scenarioKey}']`);
    if (scenarioInput) scenarioInput.checked = true;
  }
  setNumberInputValue("costRate", snapshot.operatingCost);
  setNumberInputValue("selectedOutlookRate", snapshot.selectedOutlookRate);
  setNumberInputValue("finalTargetRate", snapshot.finalTargetReturn);
  if (Number(snapshot.initialPrincipal) > 0) state.initialPrincipal = Number(snapshot.initialPrincipal);
  if (snapshot.benchmark?.proxy && el("marketBenchmark")) {
    const benchmarkSelect = el("marketBenchmark");
    const optionExists = Array.from(benchmarkSelect.options).some((option) => option.value === snapshot.benchmark.proxy);
    benchmarkSelect.value = optionExists ? snapshot.benchmark.proxy : "manual";
  }
  setNumberInputValue("manualMarketReturn", snapshot.equitySleeveTargets?.us?.cma);
  if (snapshot.drawdownRatios) {
    setNumberInputValue("drawdownRatioLow", snapshot.drawdownRatios.low);
    setNumberInputValue("drawdownRatioHigh", snapshot.drawdownRatios.high);
  }

  const recommendation = snapshot.allocationRecommendation;
  if (recommendation?.assets) {
    setNumberInputValue("bondTargetWeight", recommendation.assets.bond?.weight);
    setNumberInputValue("bondReferenceReturn", recommendation.assets.bond?.return);
    setNumberInputValue("alternativeTargetWeight", recommendation.assets.alternative?.weight);
    setNumberInputValue("alternativeReferenceReturn", recommendation.assets.alternative?.return);
    setNumberInputValue("cashTargetWeight", recommendation.assets.cash?.weight);
    setNumberInputValue("cashReferenceReturn", recommendation.assets.cash?.return);
  }

  equityMarketKeys.forEach((key) => {
    const config = equityMarketInputConfig[key];
    const target = snapshot.equitySleeveTargets?.[key];
    if (!config || !target) return;
    setNumberInputValue(config.targetWeightId, target.weight);
    setNumberInputValue(config.contributionId, target.contribution);
    if (config.cmaId) setNumberInputValue(config.cmaId, target.cma);
  });

  currentEquitySleeveTargets = structuredClone(snapshot.equitySleeveTargets || {});
  currentTargetDrawdownBand = snapshot.targetDrawdownBand || null;
  return true;
}

function applyApprovedTargetPackage(targetPackage) {
  if (!targetPackage || !Number.isFinite(Number(targetPackage.finalTargetReturn))) return false;
  backendState.approvedTargetPackage = targetPackage;
  backendState.targetPackageId = targetPackage.id || backendState.targetPackageId;
  backendState.targetStatus = targetPackage.status || "Approved";
  const approvedTargetReturn = Number(targetPackage.finalTargetReturn);
  const approvedOperatingCost = Number.isFinite(Number(targetPackage.operatingCost))
    ? Number(targetPackage.operatingCost)
    : readNumber(el("costRate"));
  const approvedCpi = Number.isFinite(Number(targetPackage.cpiEstimate))
    ? Number(targetPackage.cpiEstimate)
    : chosenRate("cpi");
  const approvedOutlook = approvedTargetReturn - approvedOperatingCost - approvedCpi;
  currentFinalTargetReturn = approvedTargetReturn;
  currentTargetReturnApproved = true;
  const snapshotApplied = applyAnnualDecisionSnapshotToInputs(targetPackage.annualDecisionSnapshot);
  if (!snapshotApplied) {
    if (el("costRate")) el("costRate").value = approvedOperatingCost.toFixed(2);
    if (el("selectedOutlookRate")) el("selectedOutlookRate").value = approvedOutlook.toFixed(2);
    const scenarioEntry = Object.entries(scenarioLabels)
      .find(([, label]) => label === targetPackage.scenario);
    if (scenarioEntry) {
      const scenarioInput = document.querySelector(`input[name='marketScenario'][value='${scenarioEntry[0]}']`);
      if (scenarioInput) scenarioInput.checked = true;
    }
  }
  const evidenceSources = Array.isArray(targetPackage.sourceEvidence?.cpiSources)
    ? targetPackage.sourceEvidence.cpiSources
    : [];
  if (Number.isFinite(approvedCpi)) {
    state.cpi = evidenceSources.length
      ? evidenceSources.map((source, index) => ({
        name: source.name || `Approved CPI source ${index + 1}`,
        rate: source.rate == null || source.rate === "" ? approvedCpi : Number(source.rate),
        sourceDate: source.sourceDate || configuredTestDateOverride() || todayIso(),
        note: source.note || source.sourceUrl || "Loaded from approved backend target package.",
        sourceUrl: source.sourceUrl || extractSourceUrl(source) || "",
        status: source.status === "Excluded from calculation" || source.status === "Archived"
          ? source.status
          : "Included in calculation",
        selected: source.selected ?? false,
      }))
      : [
        {
          name: "Approved backend CPI estimate",
          rate: approvedCpi,
          sourceDate: configuredTestDateOverride() || todayIso(),
          enteredBy: "Backend approved target package",
          note: "Loaded from approved backend target package.",
          sourceUrl: "",
          status: "Included in calculation",
          selected: true,
        },
        {
          name: "Approved backend CPI control total",
          rate: approvedCpi,
          sourceDate: configuredTestDateOverride() || todayIso(),
          enteredBy: "Backend approved target package",
          note: "Control source used to preserve the approved CPI estimate after reload.",
          sourceUrl: "",
          status: "Included in calculation",
          selected: false,
        },
      ];
    renderSources("cpi");
  }
  if (!snapshotApplied && Number.isFinite(Number(targetPackage.initialPrincipal)) && Number(targetPackage.initialPrincipal) > 0) {
    state.initialPrincipal = Number(targetPackage.initialPrincipal);
    syncPrincipalDisplay("Loaded approved principal from backend target package.", true);
  }
  if (snapshotApplied) syncPrincipalDisplay("Loaded approved principal from backend target package.", true);
  calculate();
  if (el("finalTargetRate")) el("finalTargetRate").value = approvedTargetReturn.toFixed(2);
  if (el("targetRate")) el("targetRate").textContent = percent(approvedTargetReturn);
  if (el("targetRateLarge")) el("targetRateLarge").textContent = percent(approvedTargetReturn);
  if (el("formulaTargetPreview")) el("formulaTargetPreview").textContent = percent(approvedTargetReturn);
  if (el("targetApprovalDecision")) {
    el("targetApprovalDecision").textContent = `Target return approval: loaded approved backend target ${percent(approvedTargetReturn)}.`;
    el("targetApprovalDecision").className = "approval-decision is-valid";
  }
  updateBackendWorkflowStatus("latest approved target return loaded from backend.", true);
  return true;
}

async function loadLatestApprovedTargetFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return null;
  try {
    const result = await backendRequest("/api/targets/latest-approved");
    if (applyApprovedTargetPackage(result.targetPackage)) {
      logAudit("Backend approved target loaded", `Loaded ${percent(result.targetPackage.finalTargetReturn)} from backend`);
    }
    return result.targetPackage || null;
  } catch (error) {
    updateBackendWorkflowStatus(`approved target lookup failed. ${error.message}`, false);
    return null;
  }
}

function restoreCommitteeApprovalFromBackendPortfolio() {
  const portfolioIsApproved = backendState.portfolioStatus === "Approved"
    || backendState.approvedPortfolioPackage?.status === "Approved";
  if (!portfolioIsApproved) return;

  state.committee.forEach((member) => {
    member.status = "Approve";
    member.note = member.note || "Loaded from approved backend portfolio";
  });
  backendState.portfolioApprovals = Object.fromEntries(
    state.committee.map((member, index) => [member.id || `committee-${index + 1}`, "Approve"]),
  );
}

function hasBackendApprovedPortfolio() {
  return backendState.portfolioStatus === "Approved"
    || backendState.approvedPortfolioPackage?.status === "Approved";
}

function applyApprovedPortfolioPackage(portfolio) {
  if (!portfolio || !Array.isArray(portfolio.holdings) || !portfolio.holdings.length) return false;
  state.holdings = portfolio.holdings.map((holding) => ({
    symbol: String(holding.ticker || holding.symbol || "").trim().toUpperCase(),
    region: holding.region || "United States",
    assetClass: holding.assetClass || "Equity",
    styleFactor: holding.styleFactor || "Core",
    theme: holding.theme || "Core",
    weight: Number(holding.weight || 0),
    beta: Number(holding.beta || 0),
    betaMethod: holding.betaMethod || "Auto from selected benchmark",
    lockedWeight: Boolean(holding.lockedWeight),
  })).filter((holding) => holding.symbol);
  state.portfolioVersion.number = Number(portfolio.version || state.portfolioVersion.number || 1);
  state.portfolioVersion.status = "Committee Approved";
  state.portfolioVersion.locked = true;
  state.portfolioVersion.lastChange = "Loaded approved backend portfolio";
  backendState.portfolioId = portfolio.id || "";
  backendState.portfolioStatus = portfolio.status || "Approved";
  backendState.approvedPortfolioPackage = portfolio;
  // The approved backend package is the source of truth after a reload.
  restoreCommitteeApprovalFromBackendPortfolio();
  renderHoldings();
  renderPortfolioVersion();
  refreshProposedPortfolioQualityFromHoldings();
  updatePortfolio();
  renderTradeHoldingCompletion();
  updateBackendWorkflowStatus("latest approved portfolio loaded from backend.", true);
  return true;
}

async function loadLatestApprovedPortfolioFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return null;
  try {
    const result = await backendRequest("/api/portfolios/latest-approved");
    if (applyApprovedPortfolioPackage(result.portfolio)) {
      logAudit("Backend approved portfolio loaded", `Loaded portfolio ${result.portfolio.id} with ${result.portfolio.holdings.length} holding row(s)`);
    }
    return result.portfolio || null;
  } catch (error) {
    updateBackendWorkflowStatus(`approved portfolio lookup failed. ${error.message}`, false);
    return null;
  }
}

function applyApprovedNonEquityNavPackage(navPackage) {
  if (!navPackage || navPackage.status !== "Approved") return false;
  state.nonEquityNav = normalizeNonEquityNav({
    asOfDate: navPackage.asOfDate || "",
    bond: navPackage.bond,
    alternative: navPackage.alternative,
    cash: navPackage.cash,
    status: "Approved",
    submittedBy: navPackage.submittedByName || navPackage.submittedBy || "",
    submittedAt: navPackage.submittedAt || "",
    approvedBy: navPackage.approvedByName || navPackage.approvedBy || "Decision Committee",
    approvedAt: navPackage.approvedAt || "",
    rejectedBy: "",
    rejectedAt: "",
  });
  backendState.nonEquityNavPackageId = navPackage.id || "";
  backendState.nonEquityNavStatus = "Approved";
  backendState.approvedNonEquityNavPackage = navPackage;
  renderNonEquityNavReview();
  updatePerformanceReport();
  return true;
}

async function loadLatestApprovedNonEquityNavFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return null;
  try {
    const result = await backendRequest("/api/non-equity-nav/latest-approved");
    if (applyApprovedNonEquityNavPackage(result.navPackage)) {
      logAudit("Backend non-equity NAV loaded", `Loaded approved non-equity NAV package ${result.navPackage.id}`);
    }
    return result.navPackage || null;
  } catch (error) {
    updateBackendWorkflowStatus(`approved non-equity NAV lookup failed. ${error.message}`, false);
    return null;
  }
}

function latestImportedRecord(records, acceptedTypes) {
  const allowed = new Set(acceptedTypes);
  return (records || []).find((record) => allowed.has(record.type) && String(record.rawText || "").trim()) || null;
}

async function restoreRuntimeImportsFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return [];
  const types = [
    "assumed_test_historical_prices",
    "historical_prices",
    "public_data_engine_historical_prices",
    "actual_holdings",
    "test_actual_holdings",
    "sample_actual_holdings",
    "actual_trades",
    "test_actual_trades",
    "sample_actual_trades",
    "cash_flows",
    "sample_cash_flows",
  ];
  try {
    const result = await backendRequest(`/api/imports/latest?types=${encodeURIComponent(types.join(","))}`);
    const records = result.imports || [];
    const priceRecord = latestImportedRecord(records, ["assumed_test_historical_prices", "historical_prices", "public_data_engine_historical_prices"]);
    const holdingsRecord = latestImportedRecord(records, ["actual_holdings", "test_actual_holdings", "sample_actual_holdings"]);
    const tradesRecord = latestImportedRecord(records, ["actual_trades", "test_actual_trades", "sample_actual_trades"]);
    const cashFlowRecord = latestImportedRecord(records, ["cash_flows", "sample_cash_flows"]);
    let restored = 0;

    if (priceRecord) {
      applyHistoricalPriceText(priceRecord.rawText, priceRecord.fileName || "restored_historical_prices.csv", {
        record: false,
        sync: false,
        auditAction: "Historical prices restored from backend",
      });
      restored += 1;
    }
    if (holdingsRecord) {
      actualHoldings = parseActualHoldings(holdingsRecord.rawText);
      mergeEquityValueHistory(actualHoldings);
      renderActualHoldings();
      restored += 1;
    }
    if (tradesRecord) {
      actualTrades = parseActualTrades(tradesRecord.rawText);
      renderTradeReconciliation();
      restored += 1;
    }
    if (cashFlowRecord) {
      cashFlows = parseCashFlows(cashFlowRecord.rawText);
      renderCashFlows();
      restored += 1;
    }
    if (restored) {
      updatePerformanceReport();
      updateBackendWorkflowStatus(`${restored} latest runtime data set(s) restored from backend.`, true);
    }
    return records;
  } catch (error) {
    updateBackendWorkflowStatus(`runtime data restore failed. ${error.message}`, false);
    return [];
  }
}

function tradeAuthorizationPayload() {
  return {
    portfolioId: backendState.portfolioId || backendState.approvedPortfolioPackage?.id || "",
    orders: state.tradeOrders.map((order) => ({
      action: order.action,
      ticker: String(order.ticker || "").trim().toUpperCase(),
      quantity: Number(order.quantity || 0),
      price: Number(order.price || 0),
      reasonType: order.reasonType || "Compliant",
      remark: order.remark || "",
      executionApprover: order.executionApprover || "",
      executionStatus: order.executionStatus || "Pending",
      committeeStatus: order.committeeStatus || "Pending",
      authorizedAt: order.authorizedAt || "",
      source: order.source || "",
    })),
  };
}

function normalizeTradeAuthorizationOrder(order = {}) {
  return {
    action: order.action === "Sell" ? "Sell" : "Buy",
    ticker: String(order.ticker || "").trim().toUpperCase(),
    quantity: Number(order.quantity || 0),
    price: Number(order.price || 0),
    reasonType: order.reasonType || "Compliant",
    remark: order.remark || "",
    executionApprover: order.executionApprover || state.proposal.executionManager || "",
    executionStatus: order.executionStatus || "Pending",
    committeeStatus: order.committeeStatus || "Pending",
    authorizedAt: order.authorizedAt || "",
    source: order.source || "",
  };
}

function applyTradeAuthorizationPackage(tradeAuthorizationPackage) {
  if (!tradeAuthorizationPackage || !Array.isArray(tradeAuthorizationPackage.orders)) return false;
  const packagePortfolioId = String(tradeAuthorizationPackage.portfolioId || "");
  const activePortfolioId = String(backendState.portfolioId || backendState.approvedPortfolioPackage?.id || "");
  if (packagePortfolioId && activePortfolioId && packagePortfolioId !== activePortfolioId) return false;
  state.tradeOrders = tradeAuthorizationPackage.orders.map(normalizeTradeAuthorizationOrder).filter((order) => order.ticker);
  backendState.tradeAuthorizationPackageId = tradeAuthorizationPackage.id || "";
  backendState.latestTradeAuthorizationPackage = tradeAuthorizationPackage;
  renderTradeOrders();
  updateWorkflowOverview();
  return true;
}

async function loadLatestTradeAuthorizationsFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return null;
  try {
    const result = await backendRequest("/api/trade-authorizations/latest");
    if (applyTradeAuthorizationPackage(result.tradeAuthorizationPackage)) {
      logAudit("Backend trade authorizations loaded", `Loaded ${result.tradeAuthorizationPackage.orders.length} trade authorization row(s)`);
    }
    return result.tradeAuthorizationPackage || null;
  } catch (error) {
    updateBackendWorkflowStatus(`trade authorization lookup failed. ${error.message}`, false);
    return null;
  }
}

function queueTradeAuthorizationSync() {
  if (!backendSyncAvailable()) return Promise.resolve(null);
  const role = actorCan("decision") ? "decision" : (actorCan("execution") ? "execution" : "");
  if (!role) return Promise.resolve(null);
  const payload = tradeAuthorizationPayload();
  tradeAuthorizationSyncQueue = tradeAuthorizationSyncQueue
    .catch(() => null)
    .then(async () => {
      const connected = await ensureBackendSessionForRole(role, {
        loadApprovedTarget: false,
        loadApprovedPortfolio: false,
        loadApprovedNonEquityNav: false,
        loadTradeAuthorizations: false,
        loadRuntimeImports: false,
      });
      if (!connected) return null;
      const result = await backendRequest("/api/trade-authorizations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      backendState.tradeAuthorizationPackageId = result.tradeAuthorizationPackage.id;
      backendState.latestTradeAuthorizationPackage = result.tradeAuthorizationPackage;
      updateBackendWorkflowStatus(`trade authorization state saved (${result.tradeAuthorizationPackage.orders.length} order(s)).`, true);
      return result.tradeAuthorizationPackage;
    })
    .catch((error) => {
      updateBackendWorkflowStatus(`trade authorization sync failed. ${error.message}`, false);
      return null;
    });
  return tradeAuthorizationSyncQueue;
}

async function saveSystemConfig() {
  if (!requirePermission("admin", "save business system configuration")) return;
  const previousVersion = normalizeClientSystemConfig(state.systemConfig).maintenance.version || 0;
  state.systemConfig = collectSystemConfigFromInputs();
  state.systemConfig.maintenance = {
    version: previousVersion + 1,
    lastMaintainedAt: new Date().toISOString(),
    lastMaintainedBy: currentAuditActor(),
  };
  renderSystemConfig();
  try {
    if (backendSyncAvailable()) {
      await ensureBackendSessionForRole("admin");
      const savedMaintenance = { ...state.systemConfig.maintenance };
      const result = await backendRequest("/api/system-config", {
        method: "PUT",
        body: JSON.stringify({ systemConfig: state.systemConfig }),
      });
      const returnedConfig = normalizeClientSystemConfig(result.systemConfig);
      if (Number(returnedConfig.maintenance.version || 0) < Number(savedMaintenance.version || 0)) {
        returnedConfig.maintenance = savedMaintenance;
      }
      state.systemConfig = returnedConfig;
      renderSystemConfig();
    }
    const versionLabel = `v${state.systemConfig.maintenance.version}`;
    updateSystemConfigStatus(`System configuration ${versionLabel} saved. Target ranges, risk controls, and trusted-source priority are now active.`, true);
    logAudit("System configuration saved", `${versionLabel}; ${state.systemConfig.publicCpiSources.length} CPI source(s) configured`);
  } catch (error) {
    updateSystemConfigStatus(`System configuration save failed: ${error.message}`, false);
  }
}

async function syncConfiguredUsersToBackend() {
  if (!backendSyncAvailable()) return true;
  const names = requiredUserNamesFromGate();
  await ensureBackendSessionForRole("admin");
  await backendRequest("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify({
      userId: "committee-1",
      name: names.decision,
      password: String(el("gateDecisionPassword")?.value || ""),
    }),
  });
  await backendRequest("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify({
      userId: "execution-1",
      name: names.execution,
      password: String(el("gateExecutionPassword")?.value || ""),
    }),
  });
  updateBackendStatus("role users synced to local backend.", true);
  return true;
}

async function restoreBackendSession() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(backendStorageKey) || "null");
  } catch {
    clearBackendSession();
  }
  if (!saved?.sessionId || !saved?.user) {
    updateBackendStatus("not connected. Start the local backend, then connect a review role.", false);
    return;
  }

  backendState.sessionId = saved.sessionId;
  backendState.user = saved.user;
  try {
    const result = await backendRequest("/api/session");
    applyBackendUser(result.user, `restored session for ${result.user.name} (${result.user.group}).`);
    saveBackendSession();
    await loadSystemConfigFromBackend();
    await loadLatestApprovedTargetFromBackend();
    await loadLatestApprovedPortfolioFromBackend();
    await loadLatestApprovedNonEquityNavFromBackend();
    await loadLatestTradeAuthorizationsFromBackend();
    await restoreRuntimeImportsFromBackend();
    await loadLatestReportDistributionFromBackend();
    logAudit("Backend session restored", `${result.user.name} restored from browser storage`);
  } catch (error) {
    clearBackendSession();
    updateBackendStatus(`saved session expired or backend unavailable. ${error.message}`, false);
  }
}

function targetPackagePayload() {
  const annualDecisionSnapshot = captureAnnualDecisionSnapshot();
  return {
    operatingCost: readNumber(el("costRate")),
    cpiEstimate: chosenRate("cpi"),
    scenario: scenarioLabels[selectedScenario()],
    finalTargetReturn: currentFinalTargetReturn,
    initialPrincipal: reportInitialPrincipal(),
    usEquityTargetReturn: currentUsEquityTargetReturn,
    usEquityTargetBeta: currentTargetBeta,
    equitySleeveTargets: annualDecisionSnapshot.equitySleeveTargets,
    allocationRecommendation: annualDecisionSnapshot.allocationRecommendation,
    riskFreeRates: annualDecisionSnapshot.riskFreeRates,
    annualDecisionSnapshot,
    targetMaxDrawdownLow: currentTargetDrawdownBand?.low ?? null,
    targetMaxDrawdownHigh: currentTargetDrawdownBand?.high ?? null,
    benchmark: benchmarkProxy(),
    approvedInUi: currentTargetReturnApproved,
    sourceEvidence: {
      publicSourceStatus: el("publicSourceStatus")?.textContent || "",
      outlookSourceDate: el("outlookSourceDate")?.value || "",
      outlookSourceNote: el("outlookSourceNote")?.value || "",
      cpiSources: state.cpi.map((source) => ({
        name: source.name,
        rate: source.rate,
        sourceDate: source.sourceDate,
        sourceUrl: source.sourceUrl || extractSourceUrl(source),
        note: source.note,
        status: source.status,
        selected: source.selected,
      })),
    },
  };
}

function portfolioPayload() {
  return {
    targetPackageId: backendState.targetPackageId || "",
    benchmark: benchmarkProxy(),
    version: state.portfolioVersion.number,
    holdings: state.holdings.map((holding) => ({
      ticker: holding.symbol,
      region: holding.region,
      assetClass: holding.assetClass,
      styleFactor: holding.styleFactor,
      theme: holding.theme,
      weight: Number(holding.weight || 0),
      beta: Number(holding.beta || 0),
      betaMethod: holding.betaMethod,
      lockedWeight: Boolean(holding.lockedWeight),
    })),
    backtest: {
      annualizedReturn: el("backtestedReturn").textContent,
      maxDrawdown: el("backtestedMaxDrawdown").textContent,
      returnStatus: el("backtestReturnStatus").textContent,
      sleeveBetaStatus: el("backtestBetaStatus").textContent,
      drawdownStatus: el("backtestDrawdownStatus").textContent,
      pass: currentPortfolioBacktestPass,
    },
    optimization: {
      selectedOption: selectedOptimizationOptionId || "",
      selectionStatus: el("optimizerSelectionStatus").textContent,
    },
  };
}

async function syncTargetPackageToBackend(options = {}) {
  const { approve = false } = options;
  if (!currentTargetReturnApproved) return;
  const payload = targetPackagePayload();
  const signature = JSON.stringify(payload);
  const inFlightSignature = `${approve ? "approve" : "sync"}:${signature}`;
  if (
    backendState.targetSyncInFlightPromise
    && backendState.targetSyncInFlightSignature === inFlightSignature
  ) {
    return backendState.targetSyncInFlightPromise;
  }

  const syncPromise = (async () => {
    if (backendSyncAvailable()) {
      await ensureBackendSessionForRole("decision", { loadApprovedTarget: false, loadApprovedPortfolio: false });
    }
    if (!backendState.sessionId) return;
    if (!backendState.targetPackageId || signature !== backendState.syncedTargetSignature) {
      const result = await backendRequest("/api/targets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      backendState.targetPackageId = result.targetPackage.id;
      backendState.targetStatus = result.targetPackage.status || "Submitted";
      backendState.targetApprovals = {};
      backendState.syncedTargetSignature = signature;
      backendState.approvedTargetPackage = null;
      logAudit("Backend target synced", `Target package ${backendState.targetPackageId} stored in backend`);
    }
    if (approve && backendState.targetPackageId && backendState.targetStatus !== "Approved") {
      const approvalResult = await backendRequest("/api/targets/approve", {
        method: "POST",
        body: JSON.stringify({
          targetPackageId: backendState.targetPackageId,
          decision: "Approve",
          note: `Approved annual target return ${percent(currentFinalTargetReturn)} from formal target-return page`,
        }),
      });
      backendState.targetStatus = approvalResult.target.status || backendState.targetStatus;
      backendState.targetApprovals["committee-1"] = "Approve";
      backendState.approvedTargetPackage = approvalResult.target;
      logAudit("Backend target approval", `Target package ${backendState.targetPackageId} approved from formal target-return page`);
    }
    const statusMessage = approve && backendState.targetStatus === "Approved"
      ? `target package approved as ${backendState.targetPackageId}.`
      : `target package synced as ${backendState.targetPackageId}.`;
    updateBackendStatus(statusMessage, true);
    updateBackendWorkflowStatus();
  })();

  backendState.targetSyncInFlightSignature = inFlightSignature;
  backendState.targetSyncInFlightPromise = syncPromise;

  try {
    await syncPromise;
  } catch (error) {
    updateBackendStatus(`target sync skipped. ${error.message}`, false);
  } finally {
    if (backendState.targetSyncInFlightSignature === inFlightSignature) {
      backendState.targetSyncInFlightSignature = "";
      backendState.targetSyncInFlightPromise = null;
    }
  }
}

async function syncPortfolioToBackend() {
  if (!backendState.sessionId || !state.portfolioVersion.locked || backendState.portfolioId) return;
  const payload = portfolioPayload();
  const signature = JSON.stringify(payload);
  if (signature === backendState.syncedPortfolioSignature) return;
  try {
    const result = await backendRequest("/api/portfolios", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    backendState.portfolioId = result.portfolio.id;
    backendState.portfolioStatus = result.portfolio.status || "Submitted";
    backendState.syncedPortfolioSignature = signature;
    updateBackendStatus(`portfolio synced as ${backendState.portfolioId}.`, true);
    logAudit("Backend portfolio synced", `Portfolio ${backendState.portfolioId} stored in backend`);
    updateBackendWorkflowStatus();
  } catch (error) {
    updateBackendStatus(`portfolio sync skipped. ${error.message}`, false);
  }
}

async function submitCurrentPortfolioToBackendForApproval(planLabel = "Selected portfolio") {
  if (!backendSyncAvailable()) {
    updateBackendWorkflowStatus("backend is unavailable; portfolio cannot be submitted for approval.", false);
    return false;
  }

  if (!backendState.sessionId || backendState.user?.group !== "Execution Team") {
    await loginBackendUserById("execution-1", { loadApprovedTarget: true, loadApprovedPortfolio: false });
  }
  if (!backendState.targetPackageId || backendState.targetStatus !== "Approved") {
    await loadLatestApprovedTargetFromBackend();
  }
  if (!backendState.targetPackageId || backendState.targetStatus !== "Approved") {
    updateBackendWorkflowStatus("portfolio submission blocked. Approved target package is required.", false);
    return false;
  }

  const payload = portfolioPayload();
  const signature = JSON.stringify(payload);
  if (backendState.portfolioId && signature === backendState.syncedPortfolioSignature) {
    return true;
  }
  if (backendState.portfolioSubmissionInFlightSignature === signature && backendState.portfolioSubmissionInFlightPromise) {
    await backendState.portfolioSubmissionInFlightPromise;
    return Boolean(backendState.portfolioId);
  }

  const submission = (async () => {
    const result = await backendRequest("/api/portfolios", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    backendState.portfolioId = result.portfolio.id;
    backendState.portfolioStatus = result.portfolio.status || "Submitted";
    backendState.portfolioApprovals = {};
    backendState.approvedPortfolioPackage = null;
    backendState.syncedPortfolioSignature = signature;
    updateBackendStatus(`portfolio submitted as ${backendState.portfolioId}.`, true);
    updateBackendWorkflowStatus(`portfolio submitted to backend for committee approval (${planLabel}).`, true);
    logAudit("Backend portfolio submitted", `Portfolio ${backendState.portfolioId} stored from ${planLabel}`);
    return true;
  })();

  backendState.portfolioSubmissionInFlightSignature = signature;
  backendState.portfolioSubmissionInFlightPromise = submission;

  try {
    return await submission;
  } catch (error) {
    updateBackendWorkflowStatus(`portfolio submission failed. ${error.message}`, false);
    return false;
  } finally {
    if (backendState.portfolioSubmissionInFlightSignature === signature) {
      backendState.portfolioSubmissionInFlightSignature = "";
      backendState.portfolioSubmissionInFlightPromise = null;
    }
  }
}

async function syncPortfolioApprovalToBackend() {
  if (!backendSyncAvailable()) return false;
  if (!backendState.portfolioId) {
    updateBackendWorkflowStatus("portfolio approval blocked. Submit the selected portfolio to backend first.", false);
    return false;
  }
  if (backendState.portfolioStatus === "Approved") return true;
  if (backendState.portfolioApprovalInFlightId === backendState.portfolioId && backendState.portfolioApprovalInFlightPromise) {
    await backendState.portfolioApprovalInFlightPromise;
    return backendState.portfolioStatus === "Approved";
  }

  const portfolioId = backendState.portfolioId;
  const approval = (async () => {
    if (!backendState.sessionId || backendState.user?.group !== "Decision Committee") {
      await loginBackendUserById("committee-1", { loadApprovedTarget: false, loadApprovedPortfolio: false });
    }
    const result = await backendRequest("/api/portfolios/approve", {
      method: "POST",
      body: JSON.stringify({
        portfolioId,
        decision: "Approve",
        note: "Decision Committee approved the submitted proposed equity portfolio",
      }),
    });
    backendState.portfolioStatus = result.portfolio.status || backendState.portfolioStatus;
    backendState.portfolioApprovals["committee-1"] = "Approve";
    if (backendState.portfolioStatus === "Approved") {
      backendState.approvedPortfolioPackage = result.portfolio;
    }
    logAudit("Backend portfolio approval", `Decision Committee approved portfolio ${portfolioId}`);
    updateBackendWorkflowStatus(`portfolio approval recorded for ${portfolioId.slice(0, 8)}.`, true);
    return backendState.portfolioStatus === "Approved";
  })();

  backendState.portfolioApprovalInFlightId = portfolioId;
  backendState.portfolioApprovalInFlightPromise = approval;

  try {
    return await approval;
  } catch (error) {
    updateBackendWorkflowStatus(`portfolio approval failed. ${error.message}`, false);
    return false;
  } finally {
    if (backendState.portfolioApprovalInFlightId === portfolioId) {
      backendState.portfolioApprovalInFlightId = "";
      backendState.portfolioApprovalInFlightPromise = null;
    }
  }
}

function backendApprovalCount(approvalMap) {
  return Object.values(approvalMap).filter((decision) => decision === "Approve").length;
}

function updateBackendWorkflowStatus(message = "", ok = true) {
  const targetRecord = el("backendTargetRecordStatus");
  const targetApproval = el("backendTargetApprovalStatus");
  const portfolioRecord = el("backendPortfolioRecordStatus");
  const portfolioApproval = el("backendPortfolioApprovalStatus");
  const workflowStatus = el("backendWorkflowStatus");
  if (!targetRecord || !targetApproval || !portfolioRecord || !portfolioApproval || !workflowStatus) return;

  const targetCount = backendApprovalCount(backendState.targetApprovals);
  const portfolioCount = backendApprovalCount(backendState.portfolioApprovals);
  targetRecord.textContent = backendState.targetPackageId ? `${backendState.targetStatus} / ${backendState.targetPackageId.slice(0, 8)}` : "Not submitted";
  targetApproval.textContent = `${targetCount} / ${requiredDecisionApprovals}`;
  portfolioRecord.textContent = backendState.portfolioId ? `${backendState.portfolioStatus} / ${backendState.portfolioId.slice(0, 8)}` : "Not submitted";
  portfolioApproval.textContent = `${portfolioCount} / ${requiredDecisionApprovals}`;
  if (message) {
    workflowStatus.textContent = `Approval records: ${message}`;
    workflowStatus.className = ok ? "validation-message is-valid" : "validation-message is-invalid";
    updateWorkflowOverview();
    return;
  }
  workflowStatus.textContent = "Approval records: connect a role, then submit and approve records in sequence.";
  workflowStatus.className = "validation-message";
  updateWorkflowOverview();
}

function qualityShortStatus(quality, fallback = "Missing") {
  if (!quality?.status) return fallback;
  if (quality.status === "Pass") return "Pass";
  if (quality.status === "Warning") return "Warning";
  if (quality.status === "Fail") return "Fail";
  return quality.status;
}

function setOverviewStatus(id, text, tone = "") {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
  node.className = tone;
}

function updateWorkflowOverview() {
  if (!el("workflowStatusOverview")) return;

  const targetText = currentTargetReturnApproved ? "Approved" : "Pending";
  const betaText = currentTargetBeta !== null && currentTargetDrawdownBand !== null
    ? "Ready"
    : "Pending";
  const backtestText = currentPortfolioBacktestPass
    ? "Pass"
    : (priceHistory.length ? "Review" : "No data");
  const backendTargetApproved = backendApprovalCount(backendState.targetApprovals) >= requiredDecisionApprovals || backendState.targetStatus === "Approved";
  const backendPortfolioApproved = backendApprovalCount(backendState.portfolioApprovals) >= requiredDecisionApprovals || backendState.portfolioStatus === "Approved";
  const backendText = backendTargetApproved && backendPortfolioApproved
    ? "Approved"
    : (backendState.sessionId ? "Connected" : "Not connected");
  const importFailures = [dataQuality.price, dataQuality.tickerUniverse, dataQuality.proposedPortfolio, dataQuality.actualHoldings, dataQuality.actualTrades, dataQuality.cashFlows]
    .some((quality) => quality?.status === "Fail");
  const requiredImportsReady = dataQuality.price?.ok && dataQuality.tickerUniverse?.ok && dataQuality.proposedPortfolio?.ok;
  const importsText = importFailures
    ? "Review"
    : (requiredImportsReady ? "Ready" : "Missing");
  const reportText = el("reportDistributionStatus")?.value || state.reportDistributionStatus || "Draft";

  setOverviewStatus("overviewTargetStatus", targetText, currentTargetReturnApproved ? "is-good" : "is-pending");
  setOverviewStatus("overviewBetaStatus", betaText, betaText === "Ready" ? "is-good" : "is-pending");
  setOverviewStatus("overviewPublicDataStatus", qualityShortStatus(dataQuality.publicData), dataQuality.publicData?.status === "Pass" ? "is-good" : (dataQuality.publicData?.status === "Warning" ? "is-warning" : "is-pending"));
  setOverviewStatus("overviewBacktestStatus", backtestText, backtestText === "Pass" ? "is-good" : (backtestText === "Review" ? "is-warning" : "is-pending"));
  setOverviewStatus("overviewBackendStatus", backendText, backendText === "Approved" ? "is-good" : (backendText === "Connected" ? "is-warning" : "is-pending"));
  setOverviewStatus("overviewImportsStatus", importsText, importsText === "Ready" ? "is-good" : (importsText === "Review" ? "is-warning" : "is-pending"));
  setOverviewStatus("overviewReportStatus", reportText, reportText === "Sent to Committee" ? "is-good" : "is-pending");

  setOverviewStatus("overviewPriceImportStatus", qualityShortStatus(dataQuality.price), dataQuality.price?.status === "Pass" ? "is-good" : "is-pending");
  setOverviewStatus("overviewTickerImportStatus", qualityShortStatus(dataQuality.tickerUniverse, "Default loaded"), dataQuality.tickerUniverse?.status === "Pass" ? "is-good" : "is-pending");
  setOverviewStatus("overviewProposedPortfolioStatus", qualityShortStatus(dataQuality.proposedPortfolio), dataQuality.proposedPortfolio?.status === "Pass" ? "is-good" : (dataQuality.proposedPortfolio?.status === "Warning" ? "is-warning" : "is-pending"));
  setOverviewStatus("overviewHoldingsImportStatus", actualHoldings.length ? qualityShortStatus(dataQuality.actualHoldings) : "Missing", actualHoldings.length && dataQuality.actualHoldings?.status === "Pass" ? "is-good" : "is-pending");
  setOverviewStatus("overviewTradesImportStatus", actualTrades.length ? qualityShortStatus(dataQuality.actualTrades) : "Missing", actualTrades.length && dataQuality.actualTrades?.status === "Pass" ? "is-good" : "is-pending");
  setOverviewStatus("overviewCashFlowImportStatus", cashFlows.length ? qualityShortStatus(dataQuality.cashFlows) : "Optional", cashFlows.length && dataQuality.cashFlows?.status === "Pass" ? "is-good" : "is-pending");

  const blockers = [];
  if (!currentTargetReturnApproved) blockers.push("target approval");
  if (!dataQuality.publicData?.ok) blockers.push("annual public-data package");
  if (!currentPortfolioBacktestPass) blockers.push("backtest pass");
  if (!requiredImportsReady) blockers.push("required data loads");
  if (!backendPortfolioApproved) blockers.push("backend portfolio approval");
  const overall = el("workflowOverallStatus");
  overall.textContent = blockers.length
    ? `Overall status: waiting for ${blockers.join(", ")}.`
    : "Overall status: core workflow is ready for reporting.";
  updateWorkflowStageControl();
}

function portfolioApprovedForWorkflow() {
  return currentPortfolioBacktestPass
    && state.committee.length > 0
    && state.committee.every((member) => member.status === "Approve");
}

function tradesApprovedForWorkflow() {
  return state.tradeOrders.length > 0
    && state.tradeOrders.every((order) => String(tradeFinalStatus(order)).startsWith("Approved"));
}

function annualReviewStartedForWorkflow() {
  const period = el("reportPeriod")?.value;
  const hasReport = el("reportReturn")?.textContent && el("reportReturn").textContent !== "No data";
  return Boolean(hasReport && (period === "yearly" || period === "custom" || el("reportDistributionStatus")?.value === "Sent to Committee"));
}

function workflowStageModel() {
  const stages = ["Draft", "Submitted", "Approved", "Implemented", "Monitoring", "Annual Review"];
  let current = "Draft";
  let next = "Next control: approve annual target return and load required market data.";

  if (currentTargetReturnApproved || state.proposal.proposalStatus !== "Draft" || dataQuality.price.ok) {
    current = "Submitted";
    next = "Next control: complete backtest/optimization and obtain portfolio implementation approval.";
  }
  if (portfolioApprovedForWorkflow()) {
    current = "Approved";
    next = "Next control: approve trade orders and execute implementation.";
  }
  if (tradesApprovedForWorkflow()) {
    current = "Implemented";
    next = "Next control: load actual execution data from broker-normalizer files.";
  }
  if (actualHoldings.length || actualTrades.length) {
    current = "Monitoring";
    next = "Next control: monitor rebalance, drawdown, and reporting alerts.";
  }
  if (annualReviewStartedForWorkflow()) {
    current = "Annual Review";
    next = "Next control: review attribution verdict and distribute the annual review pack.";
  }

  return { stages, current, next, currentIndex: stages.indexOf(current) };
}

function setStageStatus(id, text, tone) {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
  node.className = tone;
}

function updateWorkflowStageControl() {
  if (!el("workflowStageCurrent")) return;
  const model = workflowStageModel();
  el("workflowStageCurrent").textContent = model.current;
  el("workflowStageNextControl").textContent = model.next;
  [
    ["stageDraftStatus", 0],
    ["stageSubmittedStatus", 1],
    ["stageApprovedStatus", 2],
    ["stageImplementedStatus", 3],
    ["stageMonitoringStatus", 4],
    ["stageReviewStatus", 5],
  ].forEach(([id, index]) => {
    if (index < model.currentIndex) setStageStatus(id, "Complete", "is-good");
    else if (index === model.currentIndex) setStageStatus(id, "Current", "is-warning");
    else setStageStatus(id, "Pending", "is-pending");
  });
}

async function submitTargetPackageFromConsole() {
  if (!requirePermission("decision", "submit target package")) return;
  if (backendState.targetPackageId) {
    updateBackendWorkflowStatus("target package is already submitted.", true);
    return;
  }
  try {
    await loginBackendUserById("committee-1", { loadApprovedTarget: false, loadApprovedPortfolio: false });
    const result = await backendRequest("/api/targets", {
      method: "POST",
      body: JSON.stringify(targetPackagePayload()),
    });
    backendState.targetPackageId = result.targetPackage.id;
    backendState.targetStatus = result.targetPackage.status || "Submitted";
    backendState.targetApprovals = {};
    backendState.syncedTargetSignature = JSON.stringify(targetPackagePayload());
    logAudit("Backend target submitted", `Target package ${backendState.targetPackageId} submitted by ${state.userCredentials.decision.username}`);
    updateBackendWorkflowStatus("target package submitted to backend.", true);
  } catch (error) {
    updateBackendWorkflowStatus(`target submission failed. ${error.message}`, false);
  }
}

async function approveTargetFromConsole(userId, label) {
  if (!requirePermission("decision", "approve target package")) return;
  if (!backendState.targetPackageId) {
    updateBackendWorkflowStatus("submit a target package before committee approval.", false);
    return;
  }
  try {
    await loginBackendUserById(userId, { loadApprovedTarget: false, loadApprovedPortfolio: false });
    const result = await backendRequest("/api/targets/approve", {
      method: "POST",
      body: JSON.stringify({
        targetPackageId: backendState.targetPackageId,
        decision: "Approve",
        note: `${label} approved from backend workflow console`,
      }),
    });
    backendState.targetStatus = result.target.status || backendState.targetStatus;
    backendState.targetApprovals[userId] = "Approve";
    logAudit("Backend target approval", `${label} approved target package ${backendState.targetPackageId}`);
    updateBackendWorkflowStatus(`target approval recorded for ${label}.`, true);
  } catch (error) {
    updateBackendWorkflowStatus(`target approval failed. ${error.message}`, false);
  }
}

async function submitPortfolioFromConsole() {
  if (!requirePermission("execution", "submit portfolio package")) return;
  if (backendState.portfolioId) {
    updateBackendWorkflowStatus("portfolio is already submitted.", true);
    return;
  }
  if (!backendState.targetPackageId) {
    updateBackendWorkflowStatus("submit and approve the target package before portfolio submission.", false);
    return;
  }
  try {
    await loginBackendUserById("execution-1");
    const result = await backendRequest("/api/portfolios", {
      method: "POST",
      body: JSON.stringify(portfolioPayload()),
    });
    backendState.portfolioId = result.portfolio.id;
    backendState.portfolioStatus = result.portfolio.status || "Submitted";
    backendState.portfolioApprovals = {};
    backendState.syncedPortfolioSignature = JSON.stringify(portfolioPayload());
    logAudit("Backend portfolio submitted", `Portfolio ${backendState.portfolioId} submitted by ${state.userCredentials.execution.username}`);
    updateBackendWorkflowStatus("portfolio submitted to backend.", true);
  } catch (error) {
    updateBackendWorkflowStatus(`portfolio submission failed. ${error.message}`, false);
  }
}

async function approvePortfolioFromConsole(userId, label) {
  if (!requirePermission("decision", "approve portfolio package")) return;
  if (!backendState.portfolioId) {
    updateBackendWorkflowStatus("submit a portfolio before committee approval.", false);
    return;
  }
  try {
    await loginBackendUserById(userId);
    const result = await backendRequest("/api/portfolios/approve", {
      method: "POST",
      body: JSON.stringify({
        portfolioId: backendState.portfolioId,
        decision: "Approve",
        note: `${label} approved from backend workflow console`,
      }),
    });
    backendState.portfolioStatus = result.portfolio.status || backendState.portfolioStatus;
    backendState.portfolioApprovals[userId] = "Approve";
    logAudit("Backend portfolio approval", `${label} approved portfolio ${backendState.portfolioId}`);
    updateBackendWorkflowStatus(`portfolio approval recorded for ${label}.`, true);
  } catch (error) {
    updateBackendWorkflowStatus(`portfolio approval failed. ${error.message}`, false);
  }
}

async function ensureBackendImportSession(options = {}) {
  const allowedGroups = options.allowedGroups || ["System Administrator", "Execution Team"];
  const fallbackRole = options.fallbackRole || "execution";
  if (backendState.sessionId && allowedGroups.includes(backendState.user?.group)) return true;
  try {
    const userId = backendUserIdForRole(fallbackRole) || "execution-1";
    const result = await backendRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    backendState.sessionId = result.session.id;
    backendState.user = result.user;
    backendState.baseUrl = backendBaseUrl();
    saveBackendSession();
    updateBackendStatus(`auto-connected as ${result.user.name} for backend workflow storage.`, true);
    return true;
  } catch (error) {
    updateBackendStatus(`backend workflow storage unavailable. ${error.message}`, false);
    return false;
  }
}

async function syncImportToBackend(type, fileName, text) {
  const connected = await ensureBackendImportSession();
  if (!connected) return;
  try {
    const result = await backendRequest("/api/imports", {
      method: "POST",
      body: JSON.stringify({ type, fileName, text }),
    });
    updateBackendStatus(`${type} data load stored with ${result.importRecord.rows} row(s), hash ${String(result.importRecord.contentHash || "").slice(0, 10)}.`, true);
    logAudit("Backend data load stored", `${type} ${fileName} saved in backend data load registry`);
  } catch (error) {
    updateBackendStatus(`${type} data load sync skipped. ${error.message}`, false);
  }
}

async function pullBackendAuditLog() {
  if (!backendState.sessionId) {
    updateBackendStatus("login required before pulling backend audit.", false);
    return;
  }
  try {
    const result = await backendRequest("/api/audit-log");
    state.auditLog = result.auditLog.map((entry) => ({
      time: entry.time,
      actor: entry.actorName,
      action: entry.action,
      detail: `${entry.result}${entry.detail ? ` - ${entry.detail}` : ""}`,
    })).reverse().slice(0, 200);
    renderAuditLog();
    updateBackendStatus(`pulled ${result.auditLog.length} backend audit record(s).`, true);
  } catch (error) {
    updateBackendStatus(`audit pull failed. ${error.message}`, false);
  }
}

function currentAuditActor() {
  return String(state.currentUser || state.systemAdmin || "System").trim() || "System";
}

function renderAuditLog() {
  const body = el("auditLogRows");
  if (!body) return;
  body.replaceChildren();
  state.auditLog.slice(0, 50).forEach((entry) => {
    const row = document.createElement("tr");
    [
      new Date(entry.time).toLocaleString(),
      entry.actor,
      entry.action,
      entry.detail,
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value || "-";
      row.append(cell);
    });
    body.append(row);
  });
}

function logAudit(action, detail = "") {
  state.auditLog.unshift({
    time: new Date().toISOString(),
    actor: currentAuditActor(),
    action,
    detail,
  });
  state.auditLog = state.auditLog.slice(0, 200);
  renderAuditLog();
}

function dataSetLabel(type) {
  return {
    historical_prices: "Market prices",
    public_data_cache_historical_prices: "Market prices (cached)",
    sample_historical_prices: "Market prices",
    assumed_test_historical_prices: "Market prices",
    ticker_universe: "Ticker universe",
    public_data_cache_ticker_universe: "Ticker universe (cached)",
    sample_ticker_universe: "Ticker universe",
    assumed_ticker_universe: "Ticker universe",
    market_statistics: "Market statistics",
    public_data_cache_market_statistics: "Market statistics (cached)",
    proposed_portfolio: "Proposed portfolio",
    assumed_test_portfolio: "Assumed test portfolio",
    actual_holdings: "Actual holdings",
    sample_actual_holdings: "Actual holdings",
    actual_trades: "Actual trades",
    sample_actual_trades: "Actual trades",
    cash_flows: "Cash flows",
    sample_cash_flows: "Cash flows",
  }[type] || type.replaceAll("_", " ");
}

function dataLoadBatchId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `DL-${stamp}-${String(dataLoadRecords.length + 1).padStart(3, "0")}`;
}

function csvRowCount(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return Math.max(0, lines.length - 1);
}

function dateOnlyFromValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function localDateFromIsoValue(value) {
  const normalized = normalizedIsoDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function latestDateLabel(values) {
  const dates = values
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  return dates.length ? dates[dates.length - 1].toISOString().slice(0, 10) : "";
}

function inferDataLoadDate(type, rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  if (type.includes("historical_prices")) return latestDateLabel(rows.map((row) => row.date));
  if (type.includes("actual_holdings")) return latestDateLabel(rows.map((row) => row.asOfDate));
  if (type.includes("actual_trades")) return latestDateLabel(rows.map((row) => row.tradeDate));
  if (type.includes("cash_flows")) return latestDateLabel(rows.map((row) => row.cashFlowDate));
  return "";
}

function renderDataLoadRegistry() {
  const body = el("dataLoadRegistryRows");
  if (!body) return;
  body.replaceChildren();

  if (!dataLoadRecords.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "Load market data or actual execution data to create batch records.";
    row.append(cell);
    body.append(row);
    const status = el("dataLoadRegistryStatus");
    if (status) status.textContent = "No data load batches yet.";
    return;
  }

  dataLoadRecords.slice(0, 8).forEach((record) => {
    const row = document.createElement("tr");
    [
      record.batchId,
      record.label,
      record.fileName,
      record.dataDate || "-",
      record.rows,
      `${record.status}: ${record.message}`,
      record.loadedBy,
      new Date(record.loadedAt).toLocaleString(),
    ].forEach((value, index) => {
      const cell = document.createElement(index === 5 ? "th" : "td");
      cell.textContent = value || "-";
      if (index === 5) cell.className = record.status === "Pass" ? "is-close" : (record.status === "Warning" || record.status === "Missing" ? "is-warning" : "is-off");
      row.append(cell);
    });
    body.append(row);
  });

  const latest = dataLoadRecords[0];
  const status = el("dataLoadRegistryStatus");
  if (status) status.textContent = `${dataLoadRecords.length} batch(es). Latest: ${latest.batchId} / ${latest.label}.`;
}

function normalizedLoadType(type) {
  return String(type || "").replace(/^sample_/, "").replace(/_failed$/, "");
}

function csvRecordsForValidation(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], records: [], lineCount: lines.length };
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, ""));
  const records = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const record = {};
    headers.forEach((header, headerIndex) => { record[header] = values[headerIndex] || ""; });
    return { lineNumber: index + 2, record };
  });
  return { headers, records, lineCount: lines.length };
}

function addValidationIssue(issues, row, field, issue, suggestion = "Correct the value in the CSV file, then reload the same data set.") {
  issues.push({ row, field, issue, suggestion });
}

function validateDataLoadRows(type, text, rows, quality) {
  const normalized = normalizedLoadType(type);
  const { headers, records, lineCount } = csvRecordsForValidation(text);
  const issues = [];

  if (!String(text || "").trim()) {
    addValidationIssue(issues, "file", "file", "File is empty.", "Select a populated CSV file with the required headers.");
    return issues;
  }
  if (lineCount < 2) {
    addValidationIssue(issues, "file", "header", "CSV must include a header row and at least one data row.", "Keep the first row as column names and include at least one data row.");
    return issues;
  }
  if (quality?.status === "Fail" && (!Array.isArray(rows) || !rows.length)) {
    addValidationIssue(issues, "file", "rows", quality.message || "No valid rows were loaded.", "Check the template, remove blank rows, and reload the corrected CSV.");
  }

  records.slice(0, 25).forEach(({ lineNumber, record }) => {
    if (normalized === "historical_prices") {
      const date = new Date(record.date || record.asofdate || "");
      if (Number.isNaN(date.getTime())) addValidationIssue(issues, lineNumber, "Date", "Missing or invalid price date.", "Add a valid Date column value, preferably in YYYY-MM-DD format.");
      const numericFields = Object.entries(record).filter(([key, value]) => key !== "date" && Number.isFinite(Number.parseFloat(value)));
      if (!numericFields.length) addValidationIssue(issues, lineNumber, "price columns", "At least one numeric price column is required.", "Add numeric price values for the benchmark or ticker columns.");
    }
    if (normalized === "ticker_universe" && !record.ticker) {
      addValidationIssue(issues, lineNumber, "Ticker", "Ticker is required.", "Fill the Ticker column with the investable symbol.");
    }
    if (normalized === "market_statistics") {
      if (!["bull", "balanced", "bear"].includes(String(record.scenario || "").toLowerCase())) addValidationIssue(issues, lineNumber, "Scenario", "Scenario must be bull, balanced, or bear.", "Use one of bull, balanced, or bear in the Scenario column.");
      if (!record.rowtype && !record.type) addValidationIssue(issues, lineNumber, "RowType", "Row type is required.", "Add RowType or Type so the system can identify asset or region statistics.");
      if (!record.sleevekey && !record.key) addValidationIssue(issues, lineNumber, "SleeveKey", "Sleeve key is required.", "Add SleeveKey or Key matching the asset class or region code.");
    }
    if (normalized === "proposed_portfolio") {
      if (!record.ticker && !record.symbol) addValidationIssue(issues, lineNumber, "Ticker", "Ticker or Symbol is required.", "Fill either Ticker or Symbol for each proposed equity holding.");
      if (!Number.isFinite(Number.parseFloat(record.weight || record.portfolioweight || ""))) addValidationIssue(issues, lineNumber, "Weight", "Portfolio weight must be numeric.", "Fill Weight or PortfolioWeight as a numeric percentage.");
      const assetClass = String(record.assetclass || "Equity").trim().toLowerCase();
      if (assetClass && assetClass !== "equity") addValidationIssue(issues, lineNumber, "AssetClass", "Proposed portfolio accepts equity holdings only.", "Remove bonds, alternatives, cash, and other non-equity rows.");
    }
    if (normalized === "actual_holdings") {
      if (!record.ticker && !record.symbol) addValidationIssue(issues, lineNumber, "Ticker", "Ticker or Symbol is required.", "Fill either Ticker or Symbol for each holding row.");
      if (!Number.isFinite(Number.parseFloat(record.marketvalue || record.value || "")) && !Number.isFinite(Number.parseFloat(record.weight || ""))) {
        addValidationIssue(issues, lineNumber, "MarketValue/Weight", "Market value or weight must be numeric.", "Provide MarketValue, Value, or Weight as a numeric value.");
      }
    }
    if (normalized === "actual_trades") {
      if (!record.ticker && !record.symbol) addValidationIssue(issues, lineNumber, "Ticker", "Ticker or Symbol is required.", "Fill either Ticker or Symbol for each trade row.");
      if (record.action && !["buy", "sell"].includes(String(record.action).toLowerCase())) addValidationIssue(issues, lineNumber, "Action", "Action should be Buy or Sell.", "Use Buy or Sell as the trade action.");
      if (!Number.isFinite(Number.parseFloat(record.quantity || record.shares || ""))) addValidationIssue(issues, lineNumber, "Quantity", "Quantity must be numeric.", "Fill Quantity or Shares with a numeric value.");
      if (!Number.isFinite(Number.parseFloat(record.price || record.executionprice || record.avgprice || ""))) addValidationIssue(issues, lineNumber, "Price", "Price must be numeric.", "Fill Price, ExecutionPrice, or AvgPrice with a numeric value.");
    }
    if (normalized === "cash_flows") {
      const date = new Date(record.cashflowdate || record.date || "");
      if (Number.isNaN(date.getTime())) addValidationIssue(issues, lineNumber, "CashFlowDate", "Cash flow date is missing or invalid.", "Add a valid CashFlowDate or Date value, preferably in YYYY-MM-DD format.");
      if (!Number.isFinite(Number.parseFloat(record.amount || ""))) addValidationIssue(issues, lineNumber, "Amount", "Amount must be numeric.", "Fill Amount with a positive or negative numeric cash-flow value.");
    }
  });

  if (!headers.length) addValidationIssue(issues, "file", "header", "CSV header could not be parsed.", "Use a comma-separated header row from the provided template.");
  return issues.slice(0, 50);
}

function renderDataLoadErrorReport() {
  const body = el("dataLoadErrorRows");
  if (!body) return;
  body.replaceChildren();

  if (!dataLoadErrors.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No validation issues have been recorded.";
    row.append(cell);
    body.append(row);
    const status = el("dataLoadErrorStatus");
    if (status) status.textContent = "No data load errors.";
    return;
  }

  dataLoadErrors.slice(0, 20).forEach((issue) => {
    const row = document.createElement("tr");
    [
      issue.batchId,
      issue.label,
      issue.row,
      issue.field,
      issue.issue,
      issue.suggestion,
    ].forEach((value, index) => {
      const cell = document.createElement(index === 4 ? "th" : "td");
      cell.textContent = value || "-";
      if (index === 4) cell.className = "is-off";
      row.append(cell);
    });
    body.append(row);
  });

  const status = el("dataLoadErrorStatus");
  if (status) status.textContent = `${dataLoadErrors.length} validation issue(s) recorded.`;
}

function recordDataLoad(type, fileName, text, rows, quality, dataDate = "", validationIssues = null) {
  const record = {
    batchId: dataLoadBatchId(),
    type,
    label: dataSetLabel(type),
    fileName: fileName || "manual or generated data",
    rows: Array.isArray(rows) ? rows.length : csvRowCount(text),
    status: quality?.status || "Pass",
    message: quality?.message || "Loaded.",
    dataDate: dataDate || inferDataLoadDate(type, rows),
    loadedBy: currentAuditActor(),
    loadedAt: new Date().toISOString(),
    byteLength: new Blob([String(text || "")]).size,
  };
  dataLoadRecords.unshift(record);
  dataLoadRecords = dataLoadRecords.slice(0, 50);
  const issues = Array.isArray(validationIssues)
    ? validationIssues
    : validateDataLoadRows(type, text, rows, quality);
  if (issues.length) {
    const enriched = issues.map((issue) => ({
      ...issue,
      batchId: record.batchId,
      type,
      label: record.label,
      fileName: record.fileName,
      loadedAt: record.loadedAt,
    }));
    dataLoadErrors = [...enriched, ...dataLoadErrors].slice(0, 100);
    logAudit("Data load validation issues", `${record.batchId} recorded ${issues.length} issue(s) for ${record.label}`);
  }
  renderDataLoadRegistry();
  renderDataLoadErrorReport();
  return record;
}

function actorIsSystemAdmin() {
  return currentAuditActor().toLowerCase() === String(state.systemAdmin || "").trim().toLowerCase();
}

function actorInGroup(group) {
  return isActiveUserInGroup(currentAuditActor(), group);
}

function actorCan(permission) {
  if (permission === "admin") return actorIsSystemAdmin();
  if (permission === "decision") return actorInGroup("Decision Committee");
  if (permission === "execution") return actorInGroup("Execution Team");
  if (permission === "annualData") return actorIsSystemAdmin() || actorInGroup("Decision Committee");
  if (permission === "publicDataRead") return actorIsSystemAdmin() || actorInGroup("Decision Committee") || actorInGroup("Execution Team");
  if (permission === "data") return actorIsSystemAdmin() || actorInGroup("Execution Team");
  if (permission === "report") return actorIsSystemAdmin() || actorInGroup("Execution Team") || actorInGroup("Decision Committee");
  return false;
}

function denyPermission(permission, action) {
  logAudit("Permission denied", `${currentAuditActor()} tried to ${action}; required permission: ${permission}`);
  updatePermissionStatus(`Permission denied: ${action} requires ${permission} permission.`, false);
}

function requirePermission(permission, action) {
  if (actorCan(permission)) {
    updatePermissionStatus(`${currentAuditActor()} has ${permission} permission for this action.`, true);
    updatePermissionVisibility();
    return true;
  }
  denyPermission(permission, action);
  return false;
}

function updatePermissionStatus(message, ok = true) {
  const status = el("permissionStatus");
  if (!status) return;
  status.textContent = message;
  status.className = ok ? "validation-message is-valid" : "validation-message is-invalid";
}

const permissionCards = [
  { permission: "admin", label: "System admin", detail: "Maintain users, export audit, reset system." },
  { permission: "decision", label: "Decision committee", detail: "Approve annual data, target, market style, allocation, portfolio, and exceptions." },
  { permission: "execution", label: "Execution team", detail: "Use approved annual data for sleeve work, portfolio construction, optimizer work, trades, and rebalance follow-up." },
  { permission: "data", label: "Data loading", detail: "Load ticker universe, holdings, trades, cash flows, and operating data after annual setup." },
  { permission: "report", label: "Reporting", detail: "Export reports and committee review packs." },
];

const permissionButtonRules = [
  { id: "addUserButton", permission: "admin", action: "add users" },
  { id: "addCpiConfigSourceButton", permission: "admin", action: "add trusted CPI source" },
  { id: "saveSystemConfigButton", permission: "admin", action: "save system configuration" },
  { id: "activateSystemConfigButton", permission: "admin", action: "submit and activate system parameters" },
  { id: "exportAuditLogButton", permission: "admin", action: "export audit log" },
  { id: "findPublicSourcesButton", permission: "decision", action: "find latest public target-setting sources" },
  { id: "activatePrincipalButton", permission: "decision", action: "submit initial principal" },
  { id: "addManualCpiSourceButton", permission: "decision", action: "add manual CPI source" },
  { id: "approveTargetReturnButton", permission: "decision", action: "approve target return" },
  { id: "rejectTargetReturnButton", permission: "decision", action: "reject target return" },
  { id: "backendSubmitTargetButton", permission: "decision", action: "submit target package" },
  { id: "backendApproveTargetDecisionButton", permission: "decision", action: "approve target package" },
  { id: "backendSubmitPortfolioButton", permission: "execution", action: "submit portfolio package" },
  { id: "backendApprovePortfolioDecisionButton", permission: "decision", action: "approve portfolio package" },
  { id: "applyAllocationRecommendationButton", permission: "annualData", action: "accept annual allocation recommendation from public data" },
  { id: "addHoldingButton", permission: "execution", action: "add proposed holdings" },
  { id: "newVersionButton", permission: "execution", action: "create a new portfolio version" },
  { id: "optimizeWeightsButton", permission: "execution", action: "run optimizer" },
  { id: "acceptTickerReplacementPlanButton", permission: "execution", action: "accept ticker replacement plan" },
  { id: "submitOptimizationOptionButton", permission: "execution", action: "submit optimization plan" },
  { id: "rebalancePlanChoice", permission: "execution", action: "choose rebalance plan" },
  { id: "acceptRebalancePlanButton", permission: "execution", action: "accept rebalance plan" },
  { id: "addRebalanceFollowUpButton", permission: "execution", action: "record rebalance follow-up" },
  { id: "addTradeOrderButton", permission: "execution", action: "add trade orders" },
  { id: "uploadMarketStatsButton", permission: "annualData", action: "upload annual market statistics CSV" },
  { id: "runPublicDataEngineButton", permission: "annualData", action: "run annual public data engine" },
  { id: "loadSamplePricesButton", permission: "data", action: "load prices" },
  { id: "loadSampleTickerUniverseButton", permission: "data", action: "load ticker universe" },
  { id: "loadSampleHoldingsButton", permission: "data", action: "load actual holdings" },
  { id: "loadSampleTradesButton", permission: "data", action: "load actual trades" },
  { id: "loadSampleCashFlowsButton", permission: "data", action: "load cash flows" },
  { id: "submitNonEquityNavButton", permission: "execution", action: "submit non-equity NAV review" },
  { id: "approveNonEquityNavButton", permission: "decision", action: "approve non-equity NAV" },
  { id: "rejectNonEquityNavButton", permission: "decision", action: "reject non-equity NAV" },
  { id: "exportReportButton", permission: "report", action: "export report" },
  { id: "exportCommitteePackButton", permission: "report", action: "export committee review pack" },
];

function permissionReason(permission, action) {
  return `${currentAuditActor()} cannot ${action}; required permission: ${permission}.`;
}

function permissionControlContainer(control) {
  if (!control) return null;
  if (control.tagName === "BUTTON") return control;
  return control.closest("label.field, .import-actions, .report-action-row, .optimizer-selection-buttons") || control;
}

function renderPermissionCards() {
  const grid = el("permissionVisibilityGrid");
  if (!grid) return;
  grid.replaceChildren();
  permissionCards.forEach((item) => {
    const card = document.createElement("div");
    card.className = "permission-card";
    const label = document.createElement("span");
    const value = document.createElement("strong");
    const detail = document.createElement("small");
    label.textContent = item.label;
    const allowed = actorCan(item.permission);
    value.textContent = allowed ? "Can act" : "Blocked";
    value.className = allowed ? "is-close" : "is-off";
    detail.textContent = allowed ? item.detail : `Requires ${item.permission} permission.`;
    card.append(label, value, detail);
    grid.append(card);
  });
}

function updatePermissionVisibility() {
  renderPermissionCards();
  restoreWorkflowReadOnlyControls();
  permissionButtonRules.forEach((rule) => {
    const button = el(rule.id);
    if (!button) return;
    const allowed = actorCan(rule.permission);
    const container = permissionControlContainer(button);
    const keepVisibleWhenBlocked = rule.id === "optimizeWeightsButton";
    if (container) container.hidden = !allowed && !keepVisibleWhenBlocked;
    if (keepVisibleWhenBlocked) {
      button.textContent = allowed
        ? "Generate Three Optimization Options"
        : "Switch to Execution Team to Generate Optimization Options";
    }
    if (!allowed) {
      button.disabled = true;
      button.title = permissionReason(rule.permission, rule.action);
      button.setAttribute("aria-disabled", "true");
      button.dataset.permissionBlocked = "true";
    } else {
      if (button.dataset.permissionBlocked === "true") button.disabled = false;
      button.title = "";
      button.setAttribute("aria-disabled", "false");
      delete button.dataset.permissionBlocked;
    }
  });
  updateWorkflowReadOnlyControls(document.body.dataset.workflowPage || "step-user-management", { restore: false });
  updateReportRoleControls();
}

function updateReportRoleControls() {
  const navInputIds = [
    "nonEquityNavAsOfDate",
    "nonEquityBondNav",
    "nonEquityAlternativeNav",
    "nonEquityCashNav",
  ];
  const executionCanEdit = actorCan("execution");
  navInputIds.forEach((id) => {
    const control = el(id);
    if (!control) return;
    control.disabled = !executionCanEdit;
    control.classList.toggle("is-readonly-control", !executionCanEdit);
    control.title = executionCanEdit ? "" : "Read-only for review. NAV inputs are maintained by the Execution Team.";
  });
  const principal = el("reportBeginningValue");
  if (principal) {
    principal.readOnly = true;
    principal.classList.add("is-readonly-control");
    principal.title = "Initial principal is maintained on the Decision Committee target-return page.";
  }
  const distributionControls = [
    "reportDistributionStatus",
    "reportDistributionDate",
    "reportRecipientGroup",
  ];
  distributionControls.forEach((id) => {
    const control = el(id);
    if (!control) return;
    control.disabled = !executionCanEdit || state.reportDistributionStatus === "Sent to Committee";
    control.classList.toggle("is-readonly-control", control.disabled);
    control.title = executionCanEdit
      ? (state.reportDistributionStatus === "Sent to Committee" ? "Distribution is recorded. Start a new reporting cycle for a new distribution." : "")
      : "Read-only for review. Formal report distribution is submitted by the Execution Team.";
  });
}

function protectField(id, permission, action) {
  const field = el(id);
  if (!field) return;
  field.dataset.lastAllowedValue = field.value;
  field.addEventListener("focus", () => {
    field.dataset.lastAllowedValue = field.value;
  });
  ["input", "change"].forEach((eventName) => {
    field.addEventListener(eventName, (event) => {
      if (actorCan(permission)) {
        field.dataset.lastAllowedValue = field.value;
        return;
      }
      denyPermission(permission, action);
      field.value = field.dataset.lastAllowedValue ?? field.defaultValue ?? "";
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
}

function protectRadioGroup(name, permission, action) {
  const radios = Array.from(document.querySelectorAll(`input[name='${name}']`));
  let lastAllowed = radios.find((radio) => radio.checked)?.value || "";
  radios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      if (actorCan(permission)) {
        lastAllowed = radio.value;
        return;
      }
      denyPermission(permission, action);
      const restore = radios.find((item) => item.value === lastAllowed);
      if (restore) restore.checked = true;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
}

function workflowStepById(pageId) {
  return workflowStepLabels.find((step) => step.id === normalizeWorkflowPage(pageId)) || workflowStepLabels[0];
}

function workflowPageAllowsAction(step) {
  if (!step) return false;
  return step.permission === "report" ? actorCan("report") : actorCan(step.permission);
}

function workflowPageContainers(pageId) {
  const activeId = normalizeWorkflowPage(pageId);
  const containers = [];
  if (activeId === "step-public-data" || activeId === "step-sleeve") {
    containers.push(el("step-target"));
  } else if (activeId === "step-beta") {
    containers.push(el("step-target"));
    const betaPanel = document.querySelector(".beta-engine-panel");
    if (betaPanel) containers.push(betaPanel);
  } else if (activeId === "step-user-management") {
    containers.push(el("step-user-management"));
    if (currentRoleKey() === "admin") containers.push(el("systemAdminConfigPanel"));
  } else {
    containers.push(el(activeId));
  }
  return containers.filter(Boolean);
}

function restoreWorkflowReadOnlyControls() {
  document.querySelectorAll("[data-workflow-readonly-lock='true']").forEach((control) => {
    if (control.dataset.workflowWasDisabled === "false") control.disabled = false;
    if (control.dataset.workflowWasHidden === "false") control.hidden = false;
    control.classList.remove("is-readonly-control");
    delete control.dataset.workflowReadonlyLock;
    delete control.dataset.workflowWasDisabled;
    delete control.dataset.workflowWasHidden;
  });
}

function updateWorkflowReadOnlyControls(pageId, options = {}) {
  if (options.restore !== false) restoreWorkflowReadOnlyControls();
  const step = workflowStepById(pageId);
  if (workflowPageAllowsAction(step)) return;
  workflowPageContainers(pageId).forEach((container) => {
    container.querySelectorAll("input, select, textarea, button").forEach((control) => {
      if (control.type === "hidden") return;
      if (control.id === "switchRoleButton" || control.id === "previousWorkflowButton" || control.id === "nextWorkflowButton") return;
      const isDecisionCommitteeExceptionAction = pageId === "step-monitoring"
        && actorCan("decision")
        && control.matches("#exceptionCommitteeRows [data-committee-decision]");
      if (isDecisionCommitteeExceptionAction) return;
      control.dataset.workflowReadonlyLock = "true";
      control.dataset.workflowWasDisabled = control.disabled ? "true" : "false";
      control.dataset.workflowWasHidden = control.hidden ? "true" : "false";
      control.disabled = true;
      control.classList.add("is-readonly-control");
      if (control.tagName === "BUTTON") {
        control.hidden = true;
        control.title = "Read-only view for the current role.";
      }
    });
  });
}

function exportAuditLog() {
  if (!requirePermission("admin", "export audit log")) return;
  logAudit("Audit log exported", `${state.auditLog.length + 1} audit record(s) exported`);
  const rows = [
    ["Time", "Actor", "Action", "Detail"],
    ...state.auditLog.map((entry) => [entry.time, entry.actor, entry.action, entry.detail]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `system_audit_log_${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function readNumber(input) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : 0;
}

function normalizeRange(low, high) {
  return low <= high ? { low, high } : { low: high, high: low };
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function formatBand(band) {
  if (band.type === "atLeast") return `${percent(band.threshold)}+`;
  if (band.type === "atMost") return `${percent(band.threshold)} or deeper`;
  return `${percent(band.low)} - ${percent(band.high)}`;
}

function formatDrawdownBand(band) {
  if (!band) return "No data";
  return `${percent(band.low)} - ${percent(band.high)}`;
}

function addToBand(base, band) {
  if (band.type === "atLeast") return { type: "atLeast", threshold: base + band.threshold };
  if (band.type === "atMost") return { type: "atMost", threshold: base + band.threshold };
  return { type: "range", low: base + band.low, high: base + band.high };
}

function defaultTargetFromBand(band) {
  if (band.type === "atLeast") return band.threshold;
  if (band.type === "atMost") return band.threshold;
  return (band.low + band.high) / 2;
}

function selectedOutlookRateFromBand(band) {
  return defaultTargetFromBand(band);
}

function isTargetInsideBand(value, band) {
  if (band.type === "atLeast") return value >= band.threshold;
  if (band.type === "atMost") return value <= band.threshold;
  return value >= band.low && value <= band.high;
}

function formatBandRequirement(band) {
  if (band.type === "atLeast") return `Must be at least ${percent(band.threshold)}.`;
  if (band.type === "atMost") return `Must be ${percent(band.threshold)} or lower.`;
  return `Must be between ${percent(band.low)} and ${percent(band.high)}.`;
}

function applyFinalTargetConstraints(band) {
  const input = el("finalTargetRate");
  input.removeAttribute("min");
  input.removeAttribute("max");

  if (band.type === "atLeast") input.min = band.threshold.toFixed(2);
  if (band.type === "atMost") input.max = band.threshold.toFixed(2);
  if (band.type === "range") {
    input.min = band.low.toFixed(2);
    input.max = band.high.toFixed(2);
  }
}

function applySelectedOutlookConstraints(band) {
  const input = el("selectedOutlookRate");
  input.removeAttribute("min");
  input.removeAttribute("max");

  if (band.type === "atLeast") input.min = band.threshold.toFixed(2);
  if (band.type === "atMost") input.max = band.threshold.toFixed(2);
  if (band.type === "range") {
    input.min = band.low.toFixed(2);
    input.max = band.high.toFixed(2);
  }
}

function selectedRiskFreeRate() {
  const source = el("riskFreeRateSource").value;
  const manualInput = el("manualRiskFreeRate");
  manualInput.classList.toggle("is-hidden", source !== "manual");
  const configuredRates = normalizeRiskFreeRates(state.systemConfig?.businessParameters?.riskFreeRates);

  const presetRates = {
    fed12m: configuredRates.us,
    treasury12m: 4.25,
    cash: 5,
  };

  return source === "manual" ? readNumber(manualInput) : presetRates[source];
}

function configuredRiskFreeRates() {
  return normalizeRiskFreeRates(state.systemConfig?.businessParameters?.riskFreeRates);
}

function sleeveRiskFreeRate(key) {
  const approvedRate = Number(approvedSleeveSnapshot(key)?.riskFreeRate);
  if (Number.isFinite(approvedRate)) return approvedRate;
  const rates = configuredRiskFreeRates();
  if (key === "us") return selectedRiskFreeRate();
  if (key === "developed") return rates.developed;
  if (key === "emerging") return (rates.hongkong * 0.6) + (rates.chinaa * 0.4);
  return selectedRiskFreeRate();
}

function sleeveRiskFreeRateLabel(key) {
  if (key === "us") return `${marketRiskFreeRateLabels.us} ${percent(sleeveRiskFreeRate(key))}`;
  if (key === "developed") return `${marketRiskFreeRateLabels.developed} ${percent(sleeveRiskFreeRate(key))}`;
  if (key === "emerging") {
    const rates = configuredRiskFreeRates();
    return `HKD/CNY blend ${percent(sleeveRiskFreeRate(key))} (${percent(rates.hongkong)} / ${percent(rates.chinaa)})`;
  }
  return percent(sleeveRiskFreeRate(key));
}

function selectedMarketReturn() {
  const benchmark = el("marketBenchmark");
  const selected = benchmark.options[benchmark.selectedIndex];
  const manualInput = el("manualMarketReturn");
  manualInput.classList.toggle("is-hidden", benchmark.value !== "manual");

  return benchmark.value === "manual" ? readNumber(manualInput) : Number(selected.dataset.return);
}

function marketCmaForSleeve(key) {
  const approvedCma = Number(approvedSleeveSnapshot(key)?.cma);
  if (Number.isFinite(approvedCma)) return approvedCma;
  if (key === "us") return selectedMarketReturn();
  const config = equityMarketInputConfig[key];
  return config?.cmaId ? readNumber(el(config.cmaId)) : selectedMarketReturn();
}

function selectedDrawdownRatioRange() {
  return normalizeRange(readNumber(el("drawdownRatioLow")), readNumber(el("drawdownRatioHigh")));
}

function selectedBenchmarkLabel() {
  const benchmark = el("marketBenchmark");
  return benchmark.value === "manual" ? "Manual benchmark" : benchmark.value;
}

function approvedAnnualDecisionSnapshot() {
  const snapshot = backendState.approvedTargetPackage?.annualDecisionSnapshot;
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

function approvedSleeveSnapshot(key) {
  return approvedAnnualDecisionSnapshot()?.equitySleeveTargets?.[key] || null;
}

function benchmarkProxy() {
  return el("marketBenchmark").value;
}

function betaBenchmarkProxyForRegion(region) {
  const key = regionKey(region);
  if (key === "us") return benchmarkProxy();
  return marketBetaBenchmarkConfig[key]?.symbol || "";
}

function betaBenchmarkLabelForRegion(region) {
  const key = regionKey(region);
  if (key === "us") return selectedBenchmarkLabel();
  return marketBetaBenchmarkConfig[key]?.label || "No market benchmark";
}

function betaBenchmarkProxyForRecord(record, fallbackRegion = "") {
  const region = record?.region || fallbackRegion;
  const key = regionKey(region);
  const market = String(record?.market || "").trim().toLowerCase();
  if (key === "us") return benchmarkProxy();
  if (market === "us etf") {
    if (key === "japan") return "EWJ";
    if (key === "hongkong") return "EWH";
    if (key === "chinaa") return "ASHR";
  }
  return betaBenchmarkProxyForRegion(region);
}

function betaBenchmarkLabelForRecord(record, fallbackRegion = "") {
  const region = record?.region || fallbackRegion;
  const key = regionKey(region);
  const market = String(record?.market || "").trim().toLowerCase();
  if (key === "us") return selectedBenchmarkLabel();
  if (market === "us etf") {
    if (key === "japan") return "Japan ETF benchmark / EWJ";
    if (key === "hongkong") return "Hong Kong ETF benchmark / EWH";
    if (key === "chinaa") return "China A ETF benchmark / ASHR";
  }
  return betaBenchmarkLabelForRegion(region);
}

function betaBenchmarkProxyForHolding(holding) {
  return betaBenchmarkProxyForRecord(tickerBySymbol(holding?.symbol), holding?.region);
}

function betaBenchmarkLabelForHolding(holding) {
  return betaBenchmarkLabelForRecord(tickerBySymbol(holding?.symbol), holding?.region);
}

function benchmarkDrivenBeta(holding) {
  const benchmark = betaBenchmarkProxyForHolding(holding);
  const symbol = String(holding.symbol || "").trim().toUpperCase();
  if (!symbol) return null;
  if (benchmark !== "manual" && symbol === benchmark) return 1;
  if (betaEstimates[symbol] !== undefined) return betaEstimates[symbol];
  return Number(holding.beta || 0);
}

function betaIsEditable(holding) {
  if (holding.assetClass === "Equity") return holding.betaMethod === "Manual equity override";
  return holding.betaMethod === "Manual estimate" || holding.betaMethod === "Policy beta";
}

function applyBetaPolicy(holding) {
  if (holding.assetClass === "Equity" && holding.betaMethod !== "Manual equity override") {
    holding.betaMethod = "Auto from market benchmark";
    holding.beta = benchmarkDrivenBeta(holding);
  }

  if (holding.assetClass === "Cash & Cash-like") {
    holding.betaMethod = "Zero-beta assumption";
    holding.beta = 0;
  }
}

function impliedBeta(targetReturn, riskFreeRate, expectedMarketReturn) {
  const marketRiskPremium = expectedMarketReturn - riskFreeRate;
  if (marketRiskPremium === 0) return null;
  return (targetReturn - riskFreeRate) / marketRiskPremium;
}

function validateCapmInputs(targetReturn, riskFreeRate, expectedMarketReturn) {
  const marketRiskPremium = expectedMarketReturn - riskFreeRate;
  if (marketRiskPremium <= 0) {
    return {
      isValid: false,
      message: "Long-term capital market assumption must be higher than the relevant sleeve market/currency risk-free rate before target beta can be used.",
    };
  }
  if (marketRiskPremium < capmPolicy.minimumPositiveMarketRiskPremium) {
    return {
      isValid: false,
      message: `Market risk premium must be at least ${percent(capmPolicy.minimumPositiveMarketRiskPremium)} to avoid an unstable target beta.`,
    };
  }
  const beta = impliedBeta(targetReturn, riskFreeRate, expectedMarketReturn);
  if (beta === null) {
    return {
      isValid: false,
      message: "Long-term capital market assumption must be different from the relevant sleeve market/currency risk-free rate.",
    };
  }
  if (beta < capmPolicy.betaFloor) {
    return {
      isValid: false,
      message: `Target beta is below the policy floor of ${capmPolicy.betaFloor.toFixed(2)}. Revise assumptions or request a committee exception.`,
    };
  }
  if (beta > capmPolicy.betaCap) {
    return {
      isValid: false,
      message: `Target beta is above the policy cap of ${capmPolicy.betaCap.toFixed(2)}. Revise assumptions or request a committee exception.`,
    };
  }
  return { isValid: true, beta };
}

function updateTargetDrawdown(finalTarget, isTargetValid) {
  const ratio = selectedDrawdownRatioRange();
  if (!isTargetValid || finalTarget <= 0 || ratio.low <= 0 || ratio.high <= 0) {
    currentTargetDrawdownBand = null;
    equityMarketKeys.forEach((key) => {
      if (!currentEquitySleeveTargets[key]) currentEquitySleeveTargets[key] = {};
      currentEquitySleeveTargets[key].drawdownBand = null;
    });
    el("targetMaxDrawdown").textContent = "Invalid";
    el("drawdownValidation").textContent = "Final target return must be valid and the return/drawdown range must be above zero.";
    el("drawdownValidation").className = "validation-message is-invalid";
    return;
  }

  const tighterDrawdown = -(finalTarget / ratio.high);
  const deeperDrawdown = -(finalTarget / ratio.low);
  currentTargetDrawdownBand = { low: deeperDrawdown, high: tighterDrawdown };
  el("targetMaxDrawdown").textContent = `${percent(deeperDrawdown)} - ${percent(tighterDrawdown)}`;
  updateEquitySleeveDrawdownBudgets();
  el("drawdownValidation").textContent = "Base equity max drawdown band = -(equity target return / return-drawdown range). Sleeve budgets are adjusted by historical volatility and drawdown risk.";
  el("drawdownValidation").className = "validation-message is-valid";
}

function approvedEquityTargetReturn() {
  let weightedReturn = 0;
  let totalWeight = 0;
  equityMarketKeys.forEach((key) => {
    const weight = Math.max(0, equitySleeveTargetWeight(key));
    const targetReturn = Number(currentEquitySleeveTargets[key]?.targetReturn);
    if (weight > 0 && Number.isFinite(targetReturn)) {
      weightedReturn += weight * targetReturn;
      totalWeight += weight;
    }
  });
  return totalWeight > 0 ? weightedReturn / totalWeight : null;
}

function equitySleeveTargetWeight(key) {
  const config = equityMarketInputConfig[key];
  return config ? readNumber(el(config.targetWeightId)) : 0;
}

function equitySleeveDrawdownRiskInputs() {
  const recommendation = currentAllocationRecommendation();
  const totalEquityWeight = equityMarketKeys.reduce((sum, key) => sum + Math.max(0, equitySleeveTargetWeight(key)), 0);
  return equityMarketKeys.map((key) => {
    const region = recommendation.regions[key] || {};
    const weight = Math.max(0, equitySleeveTargetWeight(key));
    const share = totalEquityWeight > 0 ? weight / totalEquityWeight : (Number(region.share || 0) / 100);
    const volatility = Number.isFinite(Number(region.volatility)) && Number(region.volatility) > 0
      ? Number(region.volatility)
      : 15;
    const historicalDrawdown = Number.isFinite(Number(region.drawdown)) && Number(region.drawdown) < 0
      ? Math.abs(Number(region.drawdown))
      : volatility * 1.35;
    return {
      key,
      share: Math.max(0, share),
      volatility,
      historicalDrawdown,
    };
  });
}

function calculateSleeveDrawdownBudgetBands() {
  if (!currentTargetDrawdownBand) return {};
  const riskInputs = equitySleeveDrawdownRiskInputs();
  const totalShare = riskInputs.reduce((sum, item) => sum + item.share, 0) || 1;
  const averageVolatility = riskInputs.reduce((sum, item) => sum + (item.share / totalShare) * item.volatility, 0) || 1;
  const averageDrawdown = riskInputs.reduce((sum, item) => sum + (item.share / totalShare) * item.historicalDrawdown, 0) || 1;

  return Object.fromEntries(riskInputs.map((item) => {
    const volatilityRelative = item.volatility / averageVolatility;
    const drawdownRelative = item.historicalDrawdown / averageDrawdown;
    const riskFactor = clamp((volatilityRelative * 0.6) + (drawdownRelative * 0.4), 0.75, 1.35);
    return [item.key, {
      low: currentTargetDrawdownBand.low * riskFactor,
      high: currentTargetDrawdownBand.high * riskFactor,
      riskFactor,
      volatility: item.volatility,
      historicalDrawdown: item.historicalDrawdown,
    }];
  }));
}

function updateEquitySleeveDrawdownBudgets() {
  const bands = calculateSleeveDrawdownBudgetBands();
  equityMarketKeys.forEach((key) => {
    if (!currentEquitySleeveTargets[key]) currentEquitySleeveTargets[key] = {};
    currentEquitySleeveTargets[key].drawdownBand = bands[key] || null;
  });
}

function updateCpiValidation() {
  const included = includedCpiSourcesWithRates();
  const validation = el("cpiValidation");
  if (!validation) return;
  currentCpiSourcePass = included.length >= 2;
  if (currentCpiSourcePass) {
    validation.textContent = `CPI estimate uses the simple average of ${included.length} included numeric source(s).`;
    validation.className = "validation-message is-valid";
    return;
  }
  validation.textContent = "CPI estimate needs at least two included numeric sources. Fetch public sources or add manual CPI sources before approval.";
  validation.className = "validation-message is-invalid";
}

function sourceIsIncluded(source) {
  return source.status !== "Archived" && source.status !== "Excluded from calculation";
}

function sourceRateNumber(source) {
  if (source.rate == null || String(source.rate).trim() === "") return null;
  const value = Number.parseFloat(source.rate);
  return Number.isFinite(value) ? value : null;
}

function extractUrls(text) {
  return [...String(text || "").matchAll(/https?:\/\/[^\s;,]+/gi)]
    .map((match) => match[0].replace(/[)\].,]+$/, ""));
}

function extractFirstUrl(text) {
  return extractUrls(text)[0] || "";
}

function extractSourceUrl(source) {
  if (source.sourceUrl) return source.sourceUrl;
  const urls = extractUrls(source.note);
  if (String(source.name || "").includes("BLS")) {
    return urls.find((url) => url.includes("bls.gov/developers")) || urls[0] || "";
  }
  return urls[0] || "";
}

function updateSourceOpenLink(link, source) {
  const sourceUrl = extractSourceUrl(source);
  if (sourceUrl) {
    link.href = sourceUrl;
    link.textContent = "Open Source";
    link.title = sourceUrl;
    link.removeAttribute("aria-disabled");
    return;
  }
  link.removeAttribute("href");
  link.textContent = "No Link";
  link.title = "No source link available";
  link.setAttribute("aria-disabled", "true");
}

function includedCpiSourcesWithRates() {
  return state.cpi.filter((source) => sourceIsIncluded(source) && sourceRateNumber(source) !== null);
}

function chosenRate(type) {
  const sources = state[type].filter((source) => sourceIsIncluded(source) && sourceRateNumber(source) !== null);
  if (!sources.length) return 0;
  return sources.reduce((sum, source) => sum + sourceRateNumber(source), 0) / sources.length;
}

function selectedScenario() {
  return document.querySelector("input[name='marketScenario']:checked")?.value || "balanced";
}

function marketOutlookBand() {
  const scenario = selectedScenario();
  if (scenario === "bull") return { type: "range", ...normalizeRange(readNumber(el("bullLow")), readNumber(el("bullHigh"))) };
  if (scenario === "bear") return { type: "range", ...normalizeRange(readNumber(el("bearLow")), readNumber(el("bearHigh"))) };
  return { type: "range", ...normalizeRange(readNumber(el("balancedLow")), readNumber(el("balancedHigh"))) };
}

function setAuthGateStatus(message, ok = true) {
  const status = el("authGateStatus");
  if (!status) return;
  status.textContent = message;
  status.className = ok ? "validation-message is-valid" : "validation-message is-invalid";
}

function showAuthScreen(screenId) {
  ["systemLoginScreen", "adminLoginScreen", "roleSetupScreen", "roleLoginScreen", "decisionLoginScreen", "executionLoginScreen"].forEach((id) => {
    const screen = el(id);
    if (screen) screen.hidden = id !== screenId;
  });
}

function setUserSetupLocked(locked) {
  ["gateDecisionUser", "gateDecisionPassword", "gateExecutionUser", "gateExecutionPassword"].forEach((id) => {
    const input = el(id);
    if (input) input.disabled = locked;
  });
  [
    "continueToRoleLoginButton",
  ].forEach((id) => {
    const input = el(id);
    if (input) input.disabled = locked;
  });
  const continueButton = el("continueToRoleLoginButton");
  if (continueButton) continueButton.disabled = locked;
  const setupPanel = el("roleSetupPanel");
  if (setupPanel) setupPanel.classList.toggle("is-locked", locked);
}

function setRoleLoginLocked(locked) {
  [
    "openDecisionLoginButton",
    "openExecutionLoginButton",
    "gateDecisionLoginPassword",
    "gateExecutionLoginPassword",
    "enterDecisionSystemButton",
    "enterExecutionSystemButton",
  ].forEach((id) => {
    const input = el(id);
    if (input) input.disabled = locked;
  });
  const loginPanel = el("roleLoginPanel");
  if (loginPanel) loginPanel.classList.toggle("is-locked", locked);
}

function requiredUserNamesFromGate() {
  return {
    decision: String(el("gateDecisionUser")?.value || "").trim(),
    execution: String(el("gateExecutionUser")?.value || "").trim(),
  };
}

function updateGateLoginUserLabels() {
  const names = requiredUserNamesFromGate();
  if (el("gateDecisionLoginUser")) el("gateDecisionLoginUser").value = names.decision;
  if (el("gateExecutionLoginUser")) el("gateExecutionLoginUser").value = names.execution;
  if (el("backendUserId")) {
    const adminOption = el("backendUserId").querySelector("option[value='admin-1']");
    const decisionOption = el("backendUserId").querySelector("option[value='committee-1']");
    const executionOption = el("backendUserId").querySelector("option[value='execution-1']");
    if (adminOption) adminOption.textContent = state.userCredentials.admin.username;
    if (decisionOption) decisionOption.textContent = names.decision || "Decision Committee";
    if (executionOption) executionOption.textContent = names.execution || "Execution Team";
  }
}

function applyCredentialSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const next = {
    admin: {
      username: String(snapshot.admin?.username || state.userCredentials.admin.username || "").trim(),
      password: String(snapshot.admin?.password || state.userCredentials.admin.password || ""),
    },
    decision: {
      username: String(snapshot.decision?.username || "").trim(),
      password: String(snapshot.decision?.password || ""),
    },
    execution: {
      username: String(snapshot.execution?.username || "").trim(),
      password: String(snapshot.execution?.password || ""),
    },
  };
  if (!next.admin.username || !next.admin.password || !next.decision.username || !next.decision.password || !next.execution.username || !next.execution.password) {
    return false;
  }
  state.userCredentials = next;
  state.systemAdmin = next.admin.username;
  if (state.currentUser === defaults.currentUser || roleKeyForUserName(state.currentUser) === "admin") {
    state.currentUser = next.admin.username;
  }
  state.users = [
    { name: next.decision.username, group: "Decision Committee", role: "Decision Approver", active: true },
    { name: next.execution.username, group: "Execution Team", role: "Execution Authorizer", active: true },
  ];
  syncDecisionCommitteeMember(next.decision.username);
  state.proposal.executionManager = next.execution.username;
  state.rebalanceOwner = next.execution.username;
  state.tradeOrders.forEach((order) => { order.executionApprover = next.execution.username; });
  return true;
}

function saveUserCredentialSnapshot() {
  try {
    localStorage.setItem(userCredentialStorageKey, JSON.stringify({
      ...state.userCredentials,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    updateBackendStatus("user credentials saved in memory only; browser storage is unavailable.", false);
  }
}

function restoreUserCredentialSnapshot() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(userCredentialStorageKey) || "null");
    return applyCredentialSnapshot(snapshot);
  } catch {
    return false;
  }
}

async function hydrateRoleUsersFromBackend() {
  if (!backendSyncAvailable()) return false;
  try {
    await ensureBackendSessionForRole("admin", { loadApprovedTarget: false, loadApprovedPortfolio: false });
    const result = await backendRequest("/api/users");
    const decisionUser = result.users?.find((user) => user.id === "committee-1");
    const executionUser = result.users?.find((user) => user.id === "execution-1");
    if (!decisionUser?.name || !executionUser?.name) return false;

    state.userCredentials = {
      admin: state.userCredentials.admin,
      decision: {
        username: decisionUser.name,
        password: state.userCredentials.decision.password,
      },
      execution: {
        username: executionUser.name,
        password: state.userCredentials.execution.password,
      },
    };
    state.users = [
      { name: decisionUser.name, group: "Decision Committee", role: decisionUser.role || "Decision Approver", active: decisionUser.active !== false },
      { name: executionUser.name, group: "Execution Team", role: executionUser.role || "Execution Authorizer", active: executionUser.active !== false },
    ];
    syncDecisionCommitteeMember(decisionUser.name);
    // Role names can arrive after portfolio data. Reapply the source-of-truth
    // backend approval so this name refresh cannot turn approval back to pending.
    restoreCommitteeApprovalFromBackendPortfolio();
    state.proposal.executionManager = executionUser.name;
    state.rebalanceOwner = executionUser.name;
    state.tradeOrders.forEach((order) => { order.executionApprover = executionUser.name; });
    // Loading role records must not interrupt an in-progress role sign-in.
    initializeAuthGate({ preserveScreen: true });
    renderUsers();
    renderTargetCommittee();
    renderCommittee();
    renderExceptionCommittee();
    updateGateLoginUserLabels();
    updateBackendStatus("role users loaded from backend.", true);
    return true;
  } catch (error) {
    updateBackendStatus(`role users could not be loaded from backend: ${error.message}`, false);
    return false;
  }
}

function syncCommitteeListMember(list, memberName) {
  const name = String(memberName || "").trim();
  if (!name) return;
  const current = list[0];
  if (current && String(current.member || "").trim() === name) {
    current.role = current.role || "Decision Committee Approver";
    current.member = name;
    return;
  }
  list.splice(0, list.length, { role: "Decision Committee Approver", member: name, status: "Pending", note: "" });
}

function syncDecisionCommitteeMember(memberName) {
  syncCommitteeListMember(state.targetCommittee, memberName);
  syncCommitteeListMember(state.committee, memberName);
  syncCommitteeListMember(state.rebalanceExceptionCommittee, memberName);
}

function syncRequiredUsersFromGate() {
  const names = requiredUserNamesFromGate();
  const decisionPassword = String(el("gateDecisionPassword")?.value || "");
  const executionPassword = String(el("gateExecutionPassword")?.value || "");

  state.userCredentials = {
    admin: state.userCredentials.admin,
    decision: { username: names.decision, password: decisionPassword },
    execution: { username: names.execution, password: executionPassword },
  };
  state.users = [
    { name: names.decision, group: "Decision Committee", role: "Decision Approver", active: true },
    { name: names.execution, group: "Execution Team", role: "Execution Authorizer", active: true },
  ];
  syncDecisionCommitteeMember(names.decision);
  state.proposal.executionManager = names.execution;
  state.rebalanceOwner = names.execution;
  state.tradeOrders.forEach((order) => { order.executionApprover = names.execution; });

  const executionManager = el("executionManager");
  if (executionManager) executionManager.value = names.execution;
  const rebalanceOwner = el("rebalanceOwner");
  if (rebalanceOwner) rebalanceOwner.value = names.execution;
  const escalationRecipients = el("rebalanceEscalationRecipients");
  if (escalationRecipients) escalationRecipients.textContent = `${names.decision}; ${names.execution}`;
  updateGateLoginUserLabels();
  saveUserCredentialSnapshot();
}

function unlockUserSetup() {
  const admin = state.userCredentials.admin;
  const username = String(el("gateAdminUser")?.value || "").trim();
  const password = String(el("gateAdminPassword")?.value || "");
  if (username !== admin.username || password !== admin.password) {
    setAuthGateStatus("System user name or password is incorrect.", false);
    return;
  }
  setUserSetupLocked(false);
  syncRequiredUsersFromGate();
  showAuthScreen("roleSetupScreen");
  setAuthGateStatus("System user verified. Manage role users, then open the role login page.", true);
  logAudit("System user verified", `${admin.username} unlocked user setup`);
}

async function continueToRoleLogin() {
  const names = requiredUserNamesFromGate();
  const decisionPassword = String(el("gateDecisionPassword")?.value || "");
  const executionPassword = String(el("gateExecutionPassword")?.value || "");
  if (!names.decision || !names.execution) {
    setAuthGateStatus("Decision committee and execution team usernames are required before role login opens.", false);
    return;
  }
  if (!decisionPassword || !executionPassword) {
    setAuthGateStatus("Both operating users must have initial passwords before role login opens.", false);
    return;
  }
  syncRequiredUsersFromGate();
  try {
    await syncConfiguredUsersToBackend();
  } catch (error) {
    setAuthGateStatus(`User setup could not be saved to backend: ${error.message}`, false);
    updateBackendStatus(`user setup sync failed. ${error.message}`, false);
    return;
  }
  enterWorkspaceForUser(state.userCredentials.admin.username, "step-user-management");
  setAuthGateStatus("Users saved. System administrator workspace opened for parameter maintenance.", true);
  logAudit("Role users saved", `${names.decision} and ${names.execution} were configured by system user`);
}

function openDecisionLogin() {
  el("gateDecisionLoginPassword").value = "";
  showAuthScreen("decisionLoginScreen");
  setAuthGateStatus("Decision Committee login page opened.", true);
}

function openExecutionLogin() {
  el("gateExecutionLoginPassword").value = "";
  showAuthScreen("executionLoginScreen");
  setAuthGateStatus("Execution Team login page opened.", true);
}

function backToRoleSelection() {
  showAuthScreen("systemLoginScreen");
  setAuthGateStatus("System login page opened.", true);
}

function backToAdminLogin() {
  setUserSetupLocked(true);
  showAuthScreen("systemLoginScreen");
  setAuthGateStatus("System login page opened.", true);
}

function switchRoleLogin() {
  pendingAuthReturnPage = document.body.dataset.workflowPage || "step-user-management";
  setRoleLoginLocked(false);
  showAuthScreen("systemLoginScreen");
  el("authGate").hidden = false;
  el("appShell").classList.add("is-locked");
  setAuthGateStatus("Select the next role. Current workflow state is preserved.", true);
}

function openAdminLogin() {
  showAuthScreen("adminLoginScreen");
  setAuthGateStatus("System administrator login is required before user administration.", true);
}

function handleAuthGateClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.id === "openSystemAdminLoginButton") openAdminLogin();
  if (button.id === "openSystemDecisionLoginButton") openDecisionLogin();
  if (button.id === "openSystemExecutionLoginButton") openExecutionLogin();
}

function enterWorkspaceForUser(userName, returnPage = "step-user-management") {
  setActingUser(userName);
  renderUsers();
  renderTargetCommittee();
  renderCommittee();
  renderExceptionCommittee();
  renderTradeOrders();
  refreshGovernanceAfterUserChange();
  el("authGate").hidden = true;
  el("appShell").classList.remove("is-locked");
  pendingAuthReturnPage = null;
  setActiveWorkflowPage(returnPage, { pushHash: false });
  refreshSelfProfileForm();
}

async function enterControlCenter(role) {
  const names = requiredUserNamesFromGate();
  const decisionPassword = String(el("gateDecisionPassword")?.value || "");
  const executionPassword = String(el("gateExecutionPassword")?.value || "");
  if (!names.decision || !names.execution) {
    setAuthGateStatus("Decision committee and execution team usernames are required.", false);
    return;
  }
  if (!decisionPassword || !executionPassword) {
    setAuthGateStatus("Both required users must have passwords.", false);
    return;
  }

  const enteredPassword = role === "decision"
    ? String(el("gateDecisionLoginPassword")?.value || "")
    : String(el("gateExecutionLoginPassword")?.value || "");
  if (!enteredPassword) {
    setAuthGateStatus("Password is required for this role.", false);
    return;
  }
  if (backendSyncAvailable()) {
    try {
      const preserveSubmittedPortfolio = Boolean(backendState.portfolioId)
        && backendState.portfolioStatus === "Submitted";
      const result = await loginBackendUserById(backendUserIdForRole(role), {
        password: enteredPassword,
        loadApprovedTarget: true,
        // A committee reviewer must see the proposal just submitted by execution,
        // not a previously approved portfolio loaded over the live review state.
        loadApprovedPortfolio: !preserveSubmittedPortfolio,
      });
      const currentUser = result.user.name;
      state.userCredentials[role].username = currentUser;
      state.userCredentials[role].password = enteredPassword;
      updateGateLoginUserLabels();
      const returnPage = pendingAuthReturnPage || "step-user-management";
      enterWorkspaceForUser(currentUser, returnPage);
      logAudit("User login completed", `${currentUser} entered the control center through backend password validation`);
      setAuthGateStatus("User login completed.", true);
      return;
    } catch (error) {
      setAuthGateStatus(error.message, false);
      return;
    }
  }
  const expectedPassword = role === "decision" ? decisionPassword : executionPassword;
  if (enteredPassword !== expectedPassword) {
    setAuthGateStatus("Password does not match this login page.", false);
    return;
  }

  syncRequiredUsersFromGate();
  const currentUser = role === "decision" ? names.decision : names.execution;
  const returnPage = pendingAuthReturnPage || "step-user-management";
  enterWorkspaceForUser(currentUser, returnPage);
  logAudit("User login completed", `${currentUser} entered the control center`);
  setAuthGateStatus("User login completed.", true);
}

function initializeAuthGate({ preserveScreen = false } = {}) {
  const admin = state.userCredentials.admin;
  const decision = state.userCredentials.decision;
  const execution = state.userCredentials.execution;
  el("gateAdminUser").value = admin.username;
  el("gateAdminPassword").value = admin.password;
  el("gateDecisionUser").value = decision.username;
  el("gateDecisionPassword").value = decision.password;
  el("gateExecutionUser").value = execution.username;
  el("gateExecutionPassword").value = execution.password;
  updateGateLoginUserLabels();
  setUserSetupLocked(true);
  setRoleLoginLocked(false);
  if (!preserveScreen) showAuthScreen("systemLoginScreen");
}

function updateEstimationPeriod() {
  const today = effectiveTodayDate();
  const end = new Date(today.getFullYear(), 11, 31);
  const label = el("estimationPeriodLabel");
  if (label) label.textContent = `${dateOnlyLabel(today)} to ${dateOnlyLabel(end)}`;
}

const workflowStepLabels = [
  { id: "step-user-management", label: "User Management", owner: "Current logged-in user", permission: "report" },
  { id: "step-public-data", label: "Annual Public Data", owner: "Decision Committee", permission: "annualData", skipForExecutionFlow: true },
  { id: "step-target", label: "Target Return", owner: "Decision Committee", permission: "decision", skipForExecutionFlow: true },
  { id: "step-sleeve", label: "Sleeve Allocation", owner: "Execution Team", permission: "execution" },
  { id: "step-beta", label: "Beta & Drawdown", owner: "Execution Team", permission: "execution" },
  { id: "step-portfolio", label: "Portfolio Construction", owner: "Execution Team", permission: "execution" },
  { id: "step-optimize", label: "Proposed Portfolio Backtest", owner: "Execution Team", permission: "execution" },
  { id: "step-approval", label: "Implementation Approval", owner: "Decision Committee", permission: "decision" },
  { id: "step-monitoring", label: "Monitoring & Rebalance", owner: "Execution Team", permission: "execution" },
  { id: "step-execution", label: "Execution", owner: "Execution Team", permission: "execution" },
  { id: "step-report", label: "Reports", owner: "Execution Team / Decision Committee", permission: "report" },
];

function updateCurrentWorkflowStep(label) {
  const current = el("currentWorkflowStep");
  if (current) current.textContent = label;
}

function currentRoleKey() {
  return roleKeyForUserName(currentAuditActor());
}

function activeWorkflowSequence() {
  const role = currentRoleKey();
  if (role === "execution") return workflowStepLabels.filter((step) => !step.skipForExecutionFlow);
  return workflowStepLabels;
}

function profileNextWorkflowPage() {
  return currentRoleKey() === "execution" ? "step-sleeve" : "step-public-data";
}

function updateProfileNextButton() {
  const button = el("nextTargetReturnButton");
  if (!button) return;
  const nextId = profileNextWorkflowPage();
  const nextStep = workflowStepLabels.find((step) => step.id === nextId) || workflowStepLabels[1];
  button.textContent = `Next: ${nextStep.label}`;
}

function updateWorkflowOwnerHint(step) {
  const hint = el("currentWorkflowOwnerHint");
  if (!hint || !step) return;
  const canAct = step.permission === "report" ? actorCan("report") : actorCan(step.permission);
  const role = roleLabelForKey(currentRoleKey());
  document.body.dataset.workflowAccess = canAct ? "active" : "readonly";
  hint.textContent = canAct
    ? `Responsible role: ${step.owner}. Logged in as ${role}.`
    : `Read-only view. Responsible role: ${step.owner}. Logged in as ${role}; action controls are hidden for this role.`;
}

function setUiMode(mode) {
  const normalized = mode === "detail" ? "detail" : "clean";
  state.uiMode = normalized;
  document.body.dataset.uiMode = normalized;
  const cleanButton = el("cleanViewButton");
  const detailButton = el("detailViewButton");
  if (cleanButton) {
    cleanButton.classList.toggle("is-active", normalized === "clean");
    cleanButton.setAttribute("aria-pressed", normalized === "clean" ? "true" : "false");
  }
  if (detailButton) {
    detailButton.classList.toggle("is-active", normalized === "detail");
    detailButton.setAttribute("aria-pressed", normalized === "detail" ? "true" : "false");
  }
}

function updateWorkflowStepButtons(activeId) {
  let sequence = activeId === "step-user-management" ? activeWorkflowSequence() : workflowStepLabels;
  let index = sequence.findIndex((step) => step.id === activeId);
  if (index < 0) {
    sequence = workflowStepLabels;
    index = sequence.findIndex((step) => step.id === activeId);
  }
  const previous = sequence[index - 1] || null;
  const next = sequence[index + 1] || null;
  const previousButton = el("previousWorkflowButton");
  const nextButton = el("nextWorkflowButton");
  if (previousButton) {
    previousButton.disabled = !previous;
    previousButton.textContent = previous ? `Previous: ${previous.label}` : "Previous";
  }
  if (nextButton) {
    nextButton.disabled = !next;
    nextButton.textContent = next ? `Next: ${next.label}` : "Next";
  }
}

function normalizeWorkflowPage(pageId) {
  const valid = new Set(workflowStepLabels.map((step) => step.id));
  if (pageId === "step-governance") return "step-user-management";
  return valid.has(pageId) ? pageId : "step-user-management";
}

function setActiveWorkflowPage(pageId, options = {}) {
  const activeId = normalizeWorkflowPage(pageId);
  const step = workflowStepLabels.find((item) => item.id === activeId) || workflowStepLabels[0];
  document.body.classList.add("workflow-page-mode");
  document.body.dataset.workflowPage = activeId;
  updateCurrentWorkflowStep(step.label);
  updateWorkflowOwnerHint(step);
  updateWorkflowStepButtons(activeId);
  updateProfileNextButton();
  updatePermissionVisibility();

  document.querySelectorAll("#workflowNav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    link.classList.toggle("is-active", href === `#${activeId}`);
  });

  if (options.pushHash !== false && window.location.hash !== `#${activeId}`) {
    window.history.replaceState(null, "", `#${activeId}`);
  }
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "auto" });
  if (activeId === "step-beta") {
    ensureBenchmarkReferenceData();
  }
  if (["step-public-data", "step-sleeve"].includes(activeId) && (!priceHistory.length || !marketStatisticsRecommendations)) {
    loadLatestPublicDataCache();
  }
}

function moveWorkflowStep(direction) {
  const currentId = document.body.dataset.workflowPage || workflowStepLabels[0].id;
  let sequence = activeWorkflowSequence();
  let index = sequence.findIndex((step) => step.id === currentId);
  if (index < 0) {
    sequence = workflowStepLabels;
    index = sequence.findIndex((step) => step.id === currentId);
  }
  if (index < 0) return;
  const next = sequence[index + direction];
  if (next) setActiveWorkflowPage(next.id);
}

function initializeCurrentWorkflowTracker() {
  document.querySelectorAll("#workflowNav a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveWorkflowPage((link.getAttribute("href") || "#step-target").replace("#", ""));
    });
  });
  setActiveWorkflowPage(window.location.hash.replace("#", "") || "step-user-management", { pushHash: false, scroll: false });
}

const hoverRevealTextSelector = [
  ".login-heading p:last-child",
  ".role-login-card p",
  ".block-title p",
  ".section-note",
  ".validation-message",
  ".beta-engine-status small",
  ".target-period small",
  ".workflow-current-card small",
  ".data-load-registry small",
  ".risk-control-box p",
  ".note-box p",
  ".governance-scope-grid p",
  ".source-note",
  ".source-status",
].join(", ");

function compactUiText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function updateHoverRevealTextNode(node) {
  if (!(node instanceof HTMLElement)) return;
  if (!node.matches(hoverRevealTextSelector)) {
    node.classList.remove("hover-reveal-text");
    node.removeAttribute("data-full-text");
    if (node.dataset.hoverRevealManaged === "true") node.removeAttribute("tabindex");
    delete node.dataset.hoverRevealManaged;
    return;
  }
  const text = compactUiText(node.textContent);
  if (!text || text.length < 58) {
    node.classList.remove("hover-reveal-text");
    node.removeAttribute("data-full-text");
    if (node.dataset.hoverRevealManaged === "true") node.removeAttribute("tabindex");
    delete node.dataset.hoverRevealManaged;
    return;
  }
  node.classList.add("hover-reveal-text");
  node.dataset.fullText = text;
  if (!node.hasAttribute("tabindex")) {
    node.setAttribute("tabindex", "0");
    node.dataset.hoverRevealManaged = "true";
  }
}

function applyHoverRevealToTree(root = document) {
  if (!(root instanceof Element || root instanceof Document)) return;
  if (root instanceof Element && root.matches(hoverRevealTextSelector)) updateHoverRevealTextNode(root);
  root.querySelectorAll(hoverRevealTextSelector).forEach(updateHoverRevealTextNode);
  setupHoverDisclosurePanels(root);
}

function setupHoverDisclosurePanels(root = document) {
  const panels = root instanceof Element && root.matches("details.disclosure-panel")
    ? [root]
    : Array.from(root.querySelectorAll?.("details.disclosure-panel") || []);
  panels.forEach((panel) => {
    if (panel.dataset.hoverDisclosureReady === "true") return;
    panel.dataset.hoverDisclosureReady = "true";
    panel.addEventListener("mouseenter", () => {
      if (!panel.open) {
        panel.dataset.hoverOpened = "true";
        panel.open = true;
      }
    });
    panel.addEventListener("mouseleave", () => {
      if (panel.dataset.hoverOpened === "true") {
        panel.open = false;
        delete panel.dataset.hoverOpened;
      }
    });
    panel.addEventListener("focusin", () => {
      if (!panel.open) {
        panel.dataset.hoverOpened = "true";
        panel.open = true;
      }
    });
    panel.addEventListener("focusout", (event) => {
      if (panel.dataset.hoverOpened === "true" && !panel.contains(event.relatedTarget)) {
        panel.open = false;
        delete panel.dataset.hoverOpened;
      }
    });
  });
}

function setupHoverRevealUi() {
  applyHoverRevealToTree(document);
  if (typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "characterData") {
        const parent = record.target.parentElement;
        if (parent?.matches(hoverRevealTextSelector)) updateHoverRevealTextNode(parent);
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) applyHoverRevealToTree(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function renderSources(type) {
  const list = el(`${type}Sources`);
  const template = el("sourceTemplate");
  list.replaceChildren();

  state[type].forEach((source, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const name = row.querySelector(".source-name");
    const rate = row.querySelector(".source-rate");
    const sourceDate = row.querySelector(".source-date");
    const note = row.querySelector(".source-note");
    const openSource = row.querySelector(".source-open");
    const status = row.querySelector(".source-status");
    const selected = row.querySelector(".source-selected");
    const remove = row.querySelector(".icon-button");
    const normalizedStatus = source.status === "Active"
      ? "Included in calculation"
      : (source.status === "Archived" ? "Excluded from calculation" : (source.status || "Included in calculation"));
    source.status = normalizedStatus;

    name.value = source.name;
    name.placeholder = "CPI source";
    rate.value = sourceRateNumber(source) === null ? "" : source.rate;
    rate.setAttribute("aria-label", "Forecast percentage");
    sourceDate.value = source.sourceDate || "";
    sourceDate.setAttribute("aria-label", "Source date");
    note.value = source.note || "";
    note.placeholder = "Public source link or note";
    updateSourceOpenLink(openSource, source);
    status.value = normalizedStatus;
    selected.name = `${type}Selected`;
    selected.checked = source.selected;
    selected.title = "Use this included source";

    name.addEventListener("input", () => {
      if (!actorCan("decision")) { denyPermission("decision", "edit forecast source name"); name.value = source.name; return; }
      source.name = name.value;
      resetTargetApproval();
    });
    rate.addEventListener("input", () => {
      if (!actorCan("decision")) { denyPermission("decision", "edit forecast source rate"); rate.value = source.rate; return; }
      const value = Number.parseFloat(rate.value);
      source.rate = Number.isFinite(value) ? value : null;
      resetTargetApproval();
      calculate();
    });
    sourceDate.addEventListener("input", () => {
      if (!actorCan("decision")) { denyPermission("decision", "edit forecast source date"); sourceDate.value = source.sourceDate || ""; return; }
      source.sourceDate = sourceDate.value;
      resetTargetApproval();
    });
    note.addEventListener("input", () => {
      if (!actorCan("decision")) { denyPermission("decision", "edit forecast source note"); note.value = source.note || ""; return; }
      source.note = note.value;
      source.sourceUrl = extractFirstUrl(note.value) || source.sourceUrl || "";
      updateSourceOpenLink(openSource, source);
      resetTargetApproval();
    });
    status.addEventListener("change", () => {
      if (!requirePermission("decision", "edit forecast source inclusion")) { status.value = source.status || "Included in calculation"; return; }
      source.status = status.value;
      resetTargetApproval();
      calculate();
    });
    selected.addEventListener("change", () => {
      if (!requirePermission("decision", "select forecast source")) { selected.checked = source.selected; return; }
      state[type].forEach((item) => { item.selected = false; });
      source.selected = true;
      resetTargetApproval();
      calculate();
    });
    remove.addEventListener("click", () => {
      if (!requirePermission("decision", "remove forecast source")) return;
      state[type].splice(index, 1);
      if (state[type].length && !state[type].some((item) => item.selected)) state[type][0].selected = true;
      renderSources(type);
      resetTargetApproval();
      calculate();
    });

    list.append(row);
  });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toUpperCase());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = { date: new Date(values[0]) };
    headers.slice(1).forEach((header, index) => {
      const value = Number.parseFloat(values[index + 1]);
      if (Number.isFinite(value)) row[header] = value;
    });
    return row;
  }).filter((row) => !Number.isNaN(row.date.getTime()))
    .sort((a, b) => a.date - b.date);
}

function parseTickerUniverse(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const record = {};
    headers.forEach((header, index) => { record[header] = values[index] || ""; });
    return {
      ticker: String(record.ticker || "").toUpperCase(),
      name: record.name || "",
      market: record.market || "",
      region: record.region || record.returnbetasleeve || "United States",
      geographicRegion: record.geographicregion || record.georegion || "",
      assetClass: record.assetclass || "Equity",
      styleFactor: record.stylefactor || "Core",
      theme: record.theme || "Core",
    };
	  }).filter((record) => record.ticker);
}

function parseCsvBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "yes", "y", "1", "locked"].includes(normalized);
}

function normalizeProposedRegion(value, tickerRecord = null) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ");
  if (!normalized) return tickerRecord?.region || "United States";
  if (["us", "usa", "u s", "u s equity", "united states", "united states equity"].includes(normalized)) return "United States";
  if (normalized.includes("japan") || normalized === "jp" || normalized.includes("developed")) return "Japan";
  if (normalized.includes("hong kong") || normalized === "hk") return "Hong Kong";
  if (normalized.includes("china a") || normalized.includes("a share") || normalized.includes("ashare") || normalized === "chinaa") return "China A";
  if (normalized.includes("emerging")) return tickerRecord?.region || "Hong Kong";
  return tickerRecord?.region || raw;
}

function normalizeProposedStyle(value, tickerRecord = null) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (["cyclical", "growth", "active"].includes(normalized)) return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (tickerRecord?.styleFactor) return tickerRecord.styleFactor;
  return "Active";
}

function parseProposedPortfolio(text) {
  const records = parseFlatCsvRows(text);
  const rows = [];
  const issues = [];
  const warnings = [];
  const seen = new Set();

  if (!records.length) {
    addValidationIssue(issues, "file", "rows", "No proposed portfolio rows were found.", "Build the proposed portfolio in the system with at least one equity holding.");
    return { rows, issues, warnings };
  }

  records.forEach((record, index) => {
    const lineNumber = index + 2;
    const symbol = String(record.ticker || record.symbol || "").trim().toUpperCase();
    if (!symbol) {
      addValidationIssue(issues, lineNumber, "Ticker", "Ticker is required.", "Fill the Ticker or Symbol column.");
      return;
    }
    if (seen.has(symbol)) {
      addValidationIssue(issues, lineNumber, "Ticker", `Duplicate ticker ${symbol}.`, "Keep one row per proposed equity ticker.");
      return;
    }
    seen.add(symbol);

    const tickerRecord = tickerBySymbol(symbol);
    if (!tickerRecord) {
      addValidationIssue(issues, lineNumber, "Ticker", `${symbol} is not in the approved ticker universe.`, "Load an updated ticker universe first, then upload the proposed portfolio again.");
      return;
    }
    const sourceAssetClass = String(record.assetclass || tickerRecord.assetClass || "Equity").trim();
    if (sourceAssetClass.toLowerCase() !== "equity") {
      addValidationIssue(issues, lineNumber, "AssetClass", `${symbol} is ${sourceAssetClass}, not Equity.`, "Remove non-equity rows from proposed portfolio import. Use actual holdings import after implementation.");
      return;
    }

    const weight = Number.parseFloat(record.weight || record.portfolioweight || record.proposedweight || "");
    if (!Number.isFinite(weight) || weight <= 0) {
      addValidationIssue(issues, lineNumber, "Weight", "Weight must be a positive numeric percentage.", "Enter Weight as a number, such as 4.5 for 4.5%.");
      return;
    }

    const region = normalizeProposedRegion(record.region || record.sleeve || record.returnbetasleeve, tickerRecord);
    const allowedRegion = ["United States", "Japan", "Hong Kong", "China A"].includes(region);
    if (!allowedRegion) {
      addValidationIssue(issues, lineNumber, "Region", `${region || "Region"} is outside the approved equity markets.`, "Use United States, Japan, Hong Kong, or China A.");
      return;
    }

    const holding = {
      region,
      assetClass: "Equity",
      styleFactor: normalizeProposedStyle(record.stylefactor || record.style || record.factor, tickerRecord),
      theme: record.theme || tickerRecord.theme || "Core",
      symbol,
      weight,
      beta: Number.parseFloat(record.beta || "") || 1,
      betaMethod: String(record.betamethod || "").trim() || "Auto from market benchmark",
      lockedWeight: parseCsvBoolean(record.lockedweight || record.locked || record.lock),
    };
    applyBetaPolicy(holding);
    rows.push(holding);
  });

  const expectedTotal = readNumber(el("usEquityTargetWeight"))
    + readNumber(el("developedEquityTargetWeight"))
    + readNumber(el("emergingEquityTargetWeight"));
  const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  if (rows.length && expectedTotal > 0 && Math.abs(totalWeight - expectedTotal) > 1) {
    warnings.push(`Weight total ${percent(totalWeight)} differs from approved equity sleeve total ${percent(expectedTotal)}.`);
  }

  return { rows, issues, warnings };
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseFlatCsvRows(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const record = {};
    headers.forEach((header, index) => { record[header] = values[index] || ""; });
    return record;
  });
}

function parseMarketStatistics(text) {
  const records = parseFlatCsvRows(text);
  const recommendations = {};

  records.forEach((record) => {
    const scenario = String(record.scenario || "").trim().toLowerCase();
    const rowType = String(record.rowtype || record.type || "").trim().toLowerCase();
    const key = String(record.sleevekey || record.key || "").trim().toLowerCase();
    if (!["bull", "balanced", "bear"].includes(scenario) || !key) return;
    if (!recommendations[scenario]) recommendations[scenario] = { note: "", assets: {}, regions: {} };
    const target = recommendations[scenario];
    if (record.scenarionote) target.note = record.scenarionote;

    if (rowType === "asset") {
      target.assets[key] = {
        label: record.sleevelabel || record.label || key,
        range: [
          Number.parseFloat(record.suggestedlow || "0"),
          Number.parseFloat(record.suggestedhigh || "0"),
        ],
        weight: Number.parseFloat(record.suggestedweight || "0"),
        return: Number.parseFloat(record.historicalreturn || "0"),
        volatility: Number.parseFloat(record.volatility || "0"),
        drawdown: Number.parseFloat(record.maxdrawdown || "0"),
      };
    }

    if (rowType === "region") {
      target.regions[key] = {
        label: record.sleevelabel || record.label || key,
        share: Number.parseFloat(record.equityshare || record.suggestedweight || "0"),
        return: Number.parseFloat(record.historicalreturn || "0"),
        volatility: Number.parseFloat(record.volatility || "0"),
        drawdown: Number.parseFloat(record.maxdrawdown || "0"),
        correlation: record.correlationnote || record.note || "Historical regional allocation reference",
      };
    }
  });

  return Object.fromEntries(Object.entries(recommendations).filter(([, recommendation]) => {
    return Object.keys(recommendation.assets).length || Object.keys(recommendation.regions).length;
  }));
}

function parseActualHoldings(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const record = {};
    headers.forEach((header, index) => { record[header] = values[index] || ""; });
    const ticker = String(record.ticker || record.symbol || "").toUpperCase();
    const marketValue = Number.parseFloat(record.marketvalue || record.value || "0");
    const quantity = Number.parseFloat(record.quantity || record.shares || "0");
    const price = Number.parseFloat(record.price || record.lastprice || "0");
    const weight = Number.parseFloat(record.weight || "");
    return {
      asOfDate: record.asofdate || record.date || "",
      account: record.account || "",
      broker: record.broker || record.custodian || "",
      ticker,
      name: record.name || "",
      assetClass: record.assetclass || "",
      region: record.region || "",
      currency: record.currency || "",
      quantity: Number.isFinite(quantity) ? quantity : 0,
      price: Number.isFinite(price) ? price : 0,
      marketValue: Number.isFinite(marketValue) ? marketValue : 0,
      weight: Number.isFinite(weight) ? weight : null,
    };
  }).filter((record) => record.ticker);

  const totalMarketValue = rows.reduce((sum, holding) => sum + holding.marketValue, 0);
  return rows.map((holding) => ({
    ...holding,
    weight: holding.weight !== null
      ? holding.weight
      : (totalMarketValue > 0 ? holding.marketValue / totalMarketValue * 100 : 0),
  }));
}

function actualHoldingMarketValue(holding) {
  const directValue = Number(holding.marketValue || 0);
  if (directValue > 0) return directValue;
  const quantity = Number(holding.quantity || 0);
  const price = Number(holding.price || 0);
  return quantity > 0 && price > 0 ? quantity * price : 0;
}

function isEquityActualHolding(holding) {
  const assetClass = holding.assetClass || approvedAssetClassByTicker(holding.ticker);
  return assetClassKey(assetClass) === "equity";
}

function equityValuePointsFromHoldings(holdings) {
  const byDate = new Map();
  holdings
    .filter(isEquityActualHolding)
    .forEach((holding) => {
      const rawDate = holding.asOfDate || todayIso();
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) || 0) + actualHoldingMarketValue(holding));
    });
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .filter((point) => point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeEquityValueHistory(holdings) {
  const points = equityValuePointsFromHoldings(holdings);
  if (!points.length) return;
  const byDate = new Map(actualEquityValueHistory.map((point) => [point.date, point.value]));
  points.forEach((point) => byDate.set(point.date, point.value));
  actualEquityValueHistory = Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-500);
}

function compactMoney(value) {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  if (abs >= 1_000_000_000) return `CNY ${(number / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `CNY ${(number / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `CNY ${(number / 1_000).toFixed(0)}k`;
  return `CNY ${number.toFixed(0)}`;
}

function svgElement(name, attrs = {}, text = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text) node.textContent = text;
  return node;
}

function renderEquityValueLine(svgId, rows, options = {}) {
  const svg = el(svgId);
  if (!svg) return;
  const compact = Boolean(options.compact);
  const width = compact ? 420 : 720;
  const height = compact ? 120 : 220;
  const pad = compact ? 14 : 34;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();

  if (!rows.length) {
    svg.append(svgElement("text", {
      x: width / 2,
      y: height / 2,
      "text-anchor": "middle",
      class: "equity-value-label",
    }, "No equity value history"));
    return;
  }

  const values = rows.map((row) => Number(row.value || 0));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || Math.max(1, maxValue * 0.05);
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const yMin = minValue - range * 0.08;
  const yMax = maxValue + range * 0.08;
  const yRange = yMax - yMin || 1;
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : pad + (index / (rows.length - 1)) * innerWidth;
    const y = pad + ((yMax - row.value) / yRange) * innerHeight;
    return { x, y, ...row };
  });

  [0, 0.5, 1].forEach((ratio) => {
    const y = pad + ratio * innerHeight;
    svg.append(svgElement("line", { x1: pad, y1: y, x2: width - pad, y2: y, class: "equity-value-grid" }));
  });

  if (!compact) {
    svg.append(svgElement("text", { x: pad, y: pad - 10, class: "equity-value-label" }, compactMoney(maxValue)));
    svg.append(svgElement("text", { x: pad, y: height - 8, class: "equity-value-label" }, compactMoney(minValue)));
    svg.append(svgElement("text", { x: width - pad, y: height - 8, "text-anchor": "end", class: "equity-value-label" }, rows[rows.length - 1].date));
  }

  const linePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const baseY = height - pad;
  const areaPath = `M ${points[0].x.toFixed(1)} ${baseY.toFixed(1)} L ${linePoints.replaceAll(",", " ")} L ${points[points.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
  svg.append(svgElement("path", { d: areaPath, class: "equity-value-area" }));
  svg.append(svgElement("polyline", { points: linePoints, class: "equity-value-line" }));
  svg.append(svgElement("circle", {
    cx: points[points.length - 1].x.toFixed(1),
    cy: points[points.length - 1].y.toFixed(1),
    r: compact ? 3 : 4,
    class: "equity-value-dot",
  }));
}

function equityValueStatus(rows) {
  if (!rows.length) return { latest: "No data", status: "Load daily actual holdings to start the equity value curve.", className: "" };
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const change = first.value > 0 ? ((latest.value - first.value) / first.value) * 100 : 0;
  const direction = change >= 0 ? "+" : "";
  return {
    latest: currency.format(latest.value),
    status: `${rows.length} point(s), ${first.date} to ${latest.date}; change ${direction}${change.toFixed(2)}%.`,
    className: change >= 0 ? "is-close" : "is-off",
  };
}

function equityValueRowsForReportPeriod() {
  if (!actualEquityValueHistory.length) return [];
  const period = el("reportPeriod")?.value || defaults.reportPeriod;
  const rows = [...actualEquityValueHistory].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = new Date(rows[rows.length - 1].date);
  let startDate = new Date(latestDate);
  let endDate = latestDate;

  if (period === "daily") startDate.setDate(startDate.getDate() - 7);
  if (period === "weekly") startDate.setDate(startDate.getDate() - 14);
  if (period === "quarterly") startDate.setMonth(startDate.getMonth() - 3);
  if (period === "yearly") startDate.setFullYear(startDate.getFullYear() - 1);
  if (period === "custom") {
    const customStart = new Date(el("reportStartDate").value);
    const customEnd = new Date(el("reportEndDate").value);
    if (Number.isNaN(customStart.getTime()) || Number.isNaN(customEnd.getTime())) return [];
    startDate = customStart;
    endDate = customEnd;
  }

  return rows.filter((row) => {
    const date = new Date(row.date);
    return !Number.isNaN(date.getTime()) && date >= startDate && date <= endDate;
  });
}

function renderEquityValuePanels() {
  const fullRows = [...actualEquityValueHistory].sort((a, b) => a.date.localeCompare(b.date));
  const miniRows = fullRows.slice(-30);
  const reportRows = equityValueRowsForReportPeriod();

  renderEquityValueLine("overviewEquityValueSparkline", miniRows, { compact: true });
  renderEquityValueLine("monitoringEquityValueChart", fullRows);
  renderEquityValueLine("reportEquityValueChart", reportRows);

  const miniStatus = equityValueStatus(miniRows);
  const monitoringStatus = equityValueStatus(fullRows);
  const reportStatus = equityValueStatus(reportRows);

  if (el("overviewEquityValueLatest")) el("overviewEquityValueLatest").textContent = miniStatus.latest;
  if (el("overviewEquityValueStatus")) {
    el("overviewEquityValueStatus").textContent = miniRows.length ? `30-day view: ${miniStatus.status}` : miniStatus.status;
    el("overviewEquityValueStatus").className = miniStatus.className;
  }
  if (el("monitoringEquityValueLatest")) el("monitoringEquityValueLatest").textContent = monitoringStatus.latest;
  if (el("monitoringEquityValueStatus")) {
    el("monitoringEquityValueStatus").textContent = fullRows.length
      ? `Equity-only market value from imported actual holdings. ${monitoringStatus.status}`
      : monitoringStatus.status;
    el("monitoringEquityValueStatus").className = monitoringStatus.className;
  }
  if (el("reportEquityValueLatest")) el("reportEquityValueLatest").textContent = reportStatus.latest;
  if (el("reportEquityValueStatus")) {
    el("reportEquityValueStatus").textContent = reportRows.length
      ? `Report-period equity market value. ${reportStatus.status}`
      : "No equity value history in the selected report period.";
    el("reportEquityValueStatus").className = reportStatus.className;
  }
  renderReportNavPanel();
}

function actualEquityMarketValueLatest() {
  const reportRows = equityValueRowsForReportPeriod();
  if (reportRows.length) return reportRows[reportRows.length - 1].value;
  const fullRows = [...actualEquityValueHistory].sort((a, b) => a.date.localeCompare(b.date));
  if (fullRows.length) return fullRows[fullRows.length - 1].value;
  if (actualHoldings.length) {
    return actualHoldings
      .filter(isEquityActualHolding)
      .reduce((sum, holding) => sum + actualHoldingMarketValue(holding), 0);
  }
  return 0;
}

function reportNavRowsForPeriod() {
  const equityRows = equityValueRowsForReportPeriod();
  const nonEquityTotal = approvedNonEquityNavTotal();
  if (equityRows.length) {
    return equityRows.map((point) => ({
      date: point.date,
      value: Number(point.value || 0) + nonEquityTotal,
    }));
  }
  const nav = approvedNonEquityNav();
  if (nav && nonEquityTotal > 0) {
    return [{ date: nav.asOfDate || todayIso(), value: nonEquityTotal }];
  }
  return [];
}

function reportInitialPrincipal() {
  const stateValue = Number(state.initialPrincipal || 0);
  if (Number.isFinite(stateValue) && stateValue > 0) return stateValue;
  return el("capital") ? readNumber(el("capital")) : 0;
}

function syncPrincipalDisplay(message = "", ok = true) {
  const value = reportInitialPrincipal();
  if (el("capital") && value > 0) el("capital").value = String(value);
  if (el("reportBeginningValue")) el("reportBeginningValue").value = value > 0 ? String(value) : "";
  const status = el("principalStatus");
  if (status) {
    status.textContent = message || (value > 0
      ? `Initial principal active: ${currency.format(value)}.`
      : "Decision Committee confirms the initial principal before target approval.");
    status.className = ok ? "validation-message is-valid" : "validation-message is-warning";
  }
}

function handlePrincipalInput() {
  const inputValue = readNumber(el("capital"));
  const activeValue = reportInitialPrincipal();
  const status = el("principalStatus");
  if (status) {
    if (inputValue > 0 && Math.abs(inputValue - activeValue) > 0.001) {
      status.textContent = `Principal changed to ${currency.format(inputValue)}. Click Submit Principal to make it active.`;
      status.className = "validation-message is-warning";
    } else {
      status.textContent = activeValue > 0
        ? `Initial principal active: ${currency.format(activeValue)}.`
        : "Decision Committee confirms the initial principal before target approval.";
      status.className = activeValue > 0 ? "validation-message is-valid" : "validation-message";
    }
  }
  calculate();
}

function activatePrincipal() {
  if (!requirePermission("decision", "submit initial principal")) return;
  const principal = readNumber(el("capital"));
  if (!Number.isFinite(principal) || principal <= 0) {
    syncPrincipalDisplay("Initial principal must be greater than zero.", false);
    return;
  }
  state.initialPrincipal = principal;
  syncPrincipalDisplay(`Initial principal submitted: ${currency.format(principal)}.`, true);
  logAudit("Initial principal submitted", `${currency.format(principal)} submitted by ${currentAuditActor()}`);
  calculate();
  updatePerformanceReport();
}

function valueChangeSummary(rows, beginningValue = 0) {
  if (!rows.length) return { text: "No data", className: "" };
  if (beginningValue <= 0) return { text: "Enter principal", className: "is-warning" };
  const latest = rows[rows.length - 1];
  const change = ((latest.value - beginningValue) / beginningValue) * 100;
  return {
    text: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
    className: change >= 0 ? "is-close" : "is-off",
  };
}

function renderReportNavPanel() {
  const rows = reportNavRowsForPeriod();
  const latest = rows.length ? rows[rows.length - 1].value : 0;
  const beginningValue = reportInitialPrincipal();
  const change = valueChangeSummary(rows, beginningValue);
  const nonEquityApproved = Boolean(approvedNonEquityNav());

  renderEquityValueLine("reportNavChart", rows);
  if (el("reportNavLatest")) {
    el("reportNavLatest").textContent = rows.length ? currency.format(latest) : "No data";
  }
  if (el("reportNavApprovedStatus")) {
    el("reportNavApprovedStatus").textContent = rows.length ? currency.format(latest) : "No data";
  }
  if (el("reportNavChangeStatus")) {
    el("reportNavChangeStatus").textContent = change.text;
    el("reportNavChangeStatus").className = change.className;
  }
  if (el("reportNavStatus")) {
    if (!rows.length) {
      el("reportNavStatus").textContent = "Load actual equity holdings and approve non-equity NAV before issuing the report.";
      el("reportNavStatus").className = "";
    } else if (beginningValue <= 0) {
      el("reportNavStatus").textContent = "Enter initial principal before calculating NAV change, reported return, and target status.";
      el("reportNavStatus").className = "is-warning";
    } else if (!nonEquityApproved) {
      const baseText = beginningValue > 0 ? ` Return baseline uses initial principal ${currency.format(beginningValue)}.` : "";
      el("reportNavStatus").textContent = `NAV trend currently uses equity value only; non-equity NAV is not approved yet.${baseText}`;
      el("reportNavStatus").className = "is-warning";
    } else {
      const baseText = beginningValue > 0 ? ` Return baseline uses initial principal ${currency.format(beginningValue)}.` : "";
      el("reportNavStatus").textContent = `NAV trend includes daily equity value plus approved non-equity NAV. ${rows[0].date} to ${rows[rows.length - 1].date}.${baseText}`;
      el("reportNavStatus").className = "is-close";
    }
  }
  renderAssetContributionPie();
}

function pieSlicePath(cx, cy, radius, startAngle, endAngle) {
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)} Z`;
}

function assetContributionItems() {
  const nav = approvedNonEquityNav();
  return [
    { label: "Equity", value: actualEquityMarketValueLatest(), color: "#00c805" },
    { label: "Bond", value: nav ? Number(nav.bond || 0) : 0, color: "#2478ff" },
    { label: "Alternative", value: nav ? Number(nav.alternative || 0) : 0, color: "#f59f00" },
    { label: "Cash", value: nav ? Number(nav.cash || 0) : 0, color: "#6b7280" },
  ].filter((item) => item.value > 0);
}

function renderAssetContributionPie() {
  const svg = el("assetContributionPie");
  const legend = el("assetContributionLegend");
  if (!svg || !legend) return;
  const items = assetContributionItems();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const width = 240;
  const height = 200;
  const cx = 100;
  const cy = 100;
  const radius = 78;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  legend.replaceChildren();

  if (!items.length || total <= 0) {
    svg.append(svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "equity-value-label" }, "No approved NAV"));
    const empty = document.createElement("small");
    empty.textContent = "Approve non-equity NAV and load actual equity holdings.";
    legend.append(empty);
    return;
  }

  let angle = -Math.PI / 2;
  items.forEach((item) => {
    const share = item.value / total;
    const nextAngle = angle + share * Math.PI * 2;
    svg.append(svgElement("path", {
      d: pieSlicePath(cx, cy, radius, angle, nextAngle),
      fill: item.color,
      class: "asset-contribution-slice",
    }));
    angle = nextAngle;

    const row = document.createElement("div");
    row.className = "asset-contribution-row";
    const marker = document.createElement("span");
    marker.className = "asset-contribution-marker";
    marker.style.background = item.color;
    const label = document.createElement("strong");
    label.textContent = item.label;
    const value = document.createElement("span");
    value.textContent = `${currency.format(item.value)} / ${(share * 100).toFixed(1)}%`;
    row.append(marker, label, value);
    legend.append(row);
  });
}

function parseActualTrades(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const record = {};
    headers.forEach((header, index) => { record[header] = values[index] || ""; });
    const action = String(record.action || record.side || "").trim();
    const quantity = Number.parseFloat(record.quantity || record.shares || "0");
    const price = Number.parseFloat(record.price || record.executionprice || record.avgprice || "0");
    const fees = Number.parseFloat(record.fees || record.commission || "0");
    const grossValue = Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0;
    const netValue = Number.parseFloat(record.netvalue || record.amount || "");
    return {
      tradeDate: record.tradedate || record.date || "",
      settlementDate: record.settlementdate || record.settledate || "",
      account: record.account || "",
      broker: record.broker || record.custodian || "",
      action: action.toLowerCase() === "sell" ? "Sell" : "Buy",
      ticker: String(record.ticker || record.symbol || "").toUpperCase(),
      currency: record.currency || "",
      quantity: Number.isFinite(quantity) ? quantity : 0,
      price: Number.isFinite(price) ? price : 0,
      fees: Number.isFinite(fees) ? fees : 0,
      netValue: Number.isFinite(netValue) ? netValue : grossValue + (Number.isFinite(fees) ? fees : 0),
      externalTradeId: record.externaltradeid || record.tradeid || "",
    };
  }).filter((record) => record.ticker);
}

function parseCashFlows(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line).map((value) => value.trim());
    const record = {};
    headers.forEach((header, index) => { record[header] = values[index] || ""; });
    const type = String(record.type || record.cashflowtype || "").trim();
    const rawAmount = Number.parseFloat(record.amount || "0");
    const signedAmount = type.toLowerCase().includes("withdraw") || type.toLowerCase().includes("redemption")
      ? -Math.abs(rawAmount)
      : Math.abs(rawAmount);
    return {
      cashFlowDate: record.cashflowdate || record.date || "",
      account: record.account || "",
      type: type || (signedAmount < 0 ? "Withdrawal" : "Contribution"),
      currency: record.currency || "",
      amount: Number.isFinite(rawAmount) ? signedAmount : 0,
      note: record.note || record.memo || "",
    };
  }).filter((record) => record.cashFlowDate);
}

function qualityResult(status, message) {
  return { status, ok: status !== "Fail", message };
}

function duplicateDateCount(rows) {
  const seen = new Set();
  let duplicates = 0;
  rows.forEach((row) => {
    const key = row.date?.toISOString?.().slice(0, 10);
    if (!key) return;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  });
  return duplicates;
}

function validatePriceQuality(rows) {
  const benchmark = benchmarkProxy();
  if (!rows.length) return qualityResult("Fail", "Price CSV has no valid dated rows.");
  if (benchmark === "manual") return qualityResult("Warning", "Manual benchmark selected. Automatic beta checks require a benchmark proxy column.");
  const duplicateCount = duplicateDateCount(rows);
  if (duplicateCount > 0) return qualityResult("Fail", `Price CSV contains ${duplicateCount} duplicate date row(s).`);
  const benchmarkRows = rows.filter((row) => row[benchmark] > 0);
  if (benchmarkRows.length < 24) return qualityResult("Fail", `Benchmark column ${benchmark} needs at least 24 valid price observations.`);
  const sampledRows = resampleRows(filterLookback(rows, readNumber(el("betaLookback"))), el("betaFrequency").value);
  if (sampledRows.length < 24) return qualityResult("Fail", `Selected lookback/frequency has only ${sampledRows.length} sampled observations; at least 24 are required.`);
  const years = new Set(benchmarkRows.map((row) => row.date.getFullYear()));
  if (years.size < 5) return qualityResult("Warning", `Only ${years.size} calendar year(s) available for 10-year benchmark reference.`);
  const latest = benchmarkRows[benchmarkRows.length - 1].date;
  const oneYearAgo = new Date(latest);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twelveMonthRows = benchmarkRows.filter((row) => row.date >= oneYearAgo);
  if (twelveMonthRows.length < 12) return qualityResult("Warning", "Less than 12 months of benchmark observations are available.");
  return qualityResult("Pass", `Price data passed quality checks with ${sampledRows.length} sampled observations for ${benchmark}.`);
}

function validateTickerUniverseQuality(rows) {
  if (!rows.length) return qualityResult("Fail", "Ticker universe has no valid ticker rows.");
  const tickers = rows.map((row) => row.ticker).filter(Boolean);
  const duplicates = tickers.filter((ticker, index) => tickers.indexOf(ticker) !== index);
  if (duplicates.length) return qualityResult("Fail", `Ticker universe has duplicate ticker(s): ${Array.from(new Set(duplicates)).join(", ")}.`);
  const missingCore = rows.filter((row) => !row.ticker || !row.assetClass || !row.region);
  if (missingCore.length) return qualityResult("Fail", `${missingCore.length} ticker row(s) are missing ticker, asset class, or region.`);
  return qualityResult("Pass", `${rows.length} tickers passed universe quality checks.`);
}

function latestRowsByAsOfDate(rows) {
  if (!rows.length) return rows;
  const datedRows = rows
    .map((row) => ({ row, dateKey: normalizedIsoDate(row.asOfDate || row.date || "") }))
    .filter((item) => item.dateKey);
  if (!datedRows.length) return rows;
  const latestKey = datedRows.map((item) => item.dateKey).sort().at(-1);
  return datedRows
    .filter((item) => item.dateKey === latestKey)
    .map((item) => item.row);
}

function validateActualHoldingsQuality(rows) {
  if (!rows.length) return qualityResult("Missing", "Actual holdings are not required before implementation.");
  const missingTicker = rows.filter((row) => !row.ticker).length;
  if (missingTicker) return qualityResult("Fail", `${missingTicker} holding row(s) are missing ticker.`);
  const snapshotRows = latestRowsByAsOfDate(rows);
  const totalWeight = snapshotRows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  const invalidValueRows = rows.filter((row) => Number(row.marketValue || 0) < 0 || Number(row.quantity || 0) < 0).length;
  if (invalidValueRows) return qualityResult("Fail", `${invalidValueRows} holding row(s) have negative quantity or market value.`);
  if (Math.abs(totalWeight - 100) > 1) return qualityResult("Warning", `Actual holding weights total ${percent(totalWeight)}, outside the 99%-101% tolerance.`);
  return qualityResult("Pass", `Latest actual holdings passed quality checks. Weight total ${percent(totalWeight)}.`);
}

function validateProposedPortfolioQuality(rows, warnings = []) {
  if (!rows.length) return qualityResult("Fail", "Proposed portfolio does not contain valid equity rows.");
  const missingTicker = rows.filter((row) => !row.symbol).length;
  if (missingTicker) return qualityResult("Fail", `${missingTicker} proposed holding row(s) are missing ticker.`);
  const invalidWeights = rows.filter((row) => !Number.isFinite(Number(row.weight)) || Number(row.weight) <= 0).length;
  if (invalidWeights) return qualityResult("Fail", `${invalidWeights} proposed holding row(s) have invalid positive weights.`);
  const duplicateSymbols = rows
    .map((row) => row.symbol)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) !== index);
  if (duplicateSymbols.length) return qualityResult("Fail", `Proposed portfolio has duplicate ticker(s): ${Array.from(new Set(duplicateSymbols)).join(", ")}.`);
  const nonEquityRows = rows.filter((row) => row.assetClass !== "Equity").length;
  if (nonEquityRows) return qualityResult("Fail", `${nonEquityRows} proposed row(s) are not equity holdings.`);
  const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  if (totalWeight <= 0 || totalWeight > 100) return qualityResult("Fail", `Proposed portfolio weight total ${percent(totalWeight)} is outside 0%-100%.`);
  if (warnings.length) return qualityResult("Warning", `${rows.length} proposed equity holding row(s) prepared. ${warnings[0]}`);
  return qualityResult("Pass", `${rows.length} proposed equity holding row(s) prepared in system. Weight total ${percent(totalWeight)}.`);
}

function refreshProposedPortfolioQualityFromHoldings() {
  if (!state.holdings.length) {
    dataQuality.proposedPortfolio = qualityResult("Missing", "No proposed portfolio has been built in the system.");
  } else {
    dataQuality.proposedPortfolio = validateProposedPortfolioQuality(state.holdings);
  }
  updateWorkflowOverview();
}

function validateActualTradesQuality(rows) {
  if (!rows.length) return qualityResult("Missing", "Actual trades are not required before execution.");
  const missingTicker = rows.filter((row) => !row.ticker).length;
  if (missingTicker) return qualityResult("Fail", `${missingTicker} trade row(s) are missing ticker.`);
  const invalidRows = rows.filter((row) => Number(row.quantity || 0) <= 0 || Number(row.price || 0) < 0).length;
  if (invalidRows) return qualityResult("Fail", `${invalidRows} trade row(s) have invalid quantity or price.`);
  const missingTradeDate = rows.filter((row) => !row.tradeDate).length;
  if (missingTradeDate) return qualityResult("Warning", `${missingTradeDate} trade row(s) are missing trade date.`);
  return qualityResult("Pass", `${rows.length} actual trade row(s) passed quality checks.`);
}

function validateCashFlowsQuality(rows) {
  if (!rows.length) return qualityResult("Missing", "External cash flows are optional.");
  const invalidRows = rows.filter((row) => !row.cashFlowDate || !Number.isFinite(Number(row.amount))).length;
  if (invalidRows) return qualityResult("Fail", `${invalidRows} cash flow row(s) have invalid date or amount.`);
  return qualityResult("Pass", `${rows.length} cash flow row(s) passed quality checks.`);
}

function applyQualityStatus(elementId, quality) {
  const elStatus = el(elementId);
  if (!elStatus) {
    updateWorkflowOverview();
    return;
  }
  elStatus.textContent = `${quality.status}: ${quality.message}`;
  elStatus.className = quality.status === "Pass"
    ? "validation-message is-valid"
    : (quality.status === "Warning" ? "validation-message is-warning" : "validation-message is-invalid");
  updateWorkflowOverview();
}

function tickerBySymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  return tickerUniverse.find((record) => record.ticker === normalized);
}

function tickerUniverseToCsv(rows = tickerUniverse) {
  const headers = ["Ticker", "Name", "Market", "Region", "GeographicRegion", "AssetClass", "StyleFactor", "Theme"];
  const values = rows.map((record) => [
    record.ticker,
    record.name,
    record.market,
    record.region,
    record.geographicRegion || "",
    record.assetClass,
    record.styleFactor,
    record.theme,
  ]);
  return `${[headers, ...values].map((row) => row.map((value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",")).join("\n")}\n`;
}

function csvSafe(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function holdingsToCsv(rows = state.holdings) {
  const headers = ["Ticker", "Region", "AssetClass", "StyleFactor", "Theme", "Weight", "Beta", "BetaMethod", "LockedWeight"];
  const values = rows.map((holding) => [
    holding.symbol,
    holding.region,
    holding.assetClass,
    holding.styleFactor,
    holding.theme,
    holding.weight,
    holding.beta,
    holding.betaMethod,
    holding.lockedWeight ? "TRUE" : "FALSE",
  ]);
  return `${[headers, ...values].map((row) => row.map(csvSafe).join(",")).join("\n")}\n`;
}

function mergeTickerUniverseRows(rows = []) {
  const byTicker = new Map(tickerUniverse.map((record) => [String(record.ticker || "").toUpperCase(), record]));
  rows.forEach((row) => {
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) return;
    byTicker.set(ticker, { ...byTicker.get(ticker), ...row, ticker });
  });
  tickerUniverse = Array.from(byTicker.values());
  updateTickerUniverseStatus();
}

function tickerSearchText(record) {
  return [
    record.ticker,
    record.name,
    record.market,
    record.region,
    record.geographicRegion,
    record.assetClass,
    record.styleFactor,
    record.theme,
  ].filter(Boolean).join(" ").toLowerCase();
}

function tickerMatchesQuery(query, limit = 8) {
  const normalized = String(query || "").trim().toLowerCase();
  const equityRows = tickerUniverse.filter((record) => record.assetClass === "Equity");
  const records = normalized
    ? equityRows.filter((record) => tickerSearchText(record).includes(normalized))
    : equityRows;
  return records
    .sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)))
    .slice(0, limit);
}

function renderTickerSuggestions() {
  const datalist = el("tickerSuggestionList");
  if (datalist) {
    datalist.replaceChildren();
    tickerUniverse.filter((record) => record.assetClass === "Equity").forEach((record) => {
      const option = document.createElement("option");
      option.value = record.ticker;
      option.label = `${record.name || record.ticker} | ${record.region || "Region n/a"} | ${record.styleFactor || "Style n/a"}`;
      datalist.append(option);
    });
  }
  renderTickerLookupResults();
}

function renderTickerLookupResults() {
  const container = el("tickerLookupResults");
  const input = el("tickerQuickSearch");
  const status = el("tickerQuickSearchStatus");
  if (!container) return;
  const query = input?.value || "";
  const matches = tickerMatchesQuery(query, query ? 8 : 5);
  container.replaceChildren();
  matches.forEach((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ticker-result-chip";
    button.textContent = `${record.ticker} ${record.name || ""}`;
    button.title = `${record.ticker} | ${record.name || ""} | ${record.region || ""} | ${record.styleFactor || ""}`;
    button.addEventListener("click", () => {
      if (input) input.value = record.ticker;
      renderTickerLookupResults();
      renderEquitySleeveBuilder();
    });
    container.append(button);
  });
  if (status) {
    const equityCount = tickerUniverse.filter((record) => record.assetClass === "Equity").length;
    status.textContent = query
      ? `${matches.length} equity ticker suggestion(s) for "${query}" from the imported/public ticker universe.`
      : `${equityCount} equity ticker row(s) available. Type a ticker, company, market, or style to filter.`;
  }
}

function updateTickerUniverseStatus() {
  dataQuality.tickerUniverse = validateTickerUniverseQuality(tickerUniverse);
  applyQualityStatus("tickerUniverseStatus", dataQuality.tickerUniverse);
  renderTickerSuggestions();
}

function approvedWeightByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  return state.holdings
    .filter((holding) => String(holding.symbol || "").trim().toUpperCase() === normalized)
    .reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
}

function approvedAssetClassByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  return state.holdings.find((holding) => String(holding.symbol || "").trim().toUpperCase() === normalized)?.assetClass || "";
}

function approvedMetaByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  const holding = state.holdings.find((item) => String(item.symbol || "").trim().toUpperCase() === normalized);
  const universeRecord = tickerBySymbol(normalized);
  return {
    assetClass: holding?.assetClass || universeRecord?.assetClass || "",
    region: holding?.region || universeRecord?.region || "",
    styleFactor: holding?.styleFactor || universeRecord?.styleFactor || "",
  };
}

function rebalanceLimits() {
  return {
    lower: readNumber(el("rebalanceLowerDrift")),
    upper: readNumber(el("rebalanceUpperDrift")),
    planChoice: el("rebalancePlanChoice")?.value || state.rebalancePlanChoice || "Minimum Trade Plan",
    actionStatus: el("rebalanceActionStatus").value,
    completionDays: Math.max(1, readNumber(el("rebalanceCompletionDays")) || 1),
  };
}

function styleKeyForRebalance(styleFactor) {
  const normalized = String(styleFactor || "").trim().toLowerCase();
  if (!normalized || normalized === "defensive") return "";
  if (normalized === "core") return "active";
  return normalized.replace(/[^a-z0-9]+/g, "-");
}

function styleLabelForRebalance(styleKey) {
  if (styleKey === "active") return "Active/Core";
  if (styleKey === "growth") return "Growth";
  if (styleKey === "cyclical") return "Cyclical";
  return styleKey
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Unclassified";
}

function equitySleeveLabelByKey(key) {
  return equityPortfolioSleeveDefinitions().find((definition) => definition.key === key)?.label || key;
}

function addRebalanceScopeWeight(rows, key, scope, label, weightField, weight, meta = {}) {
  if (!key) return;
  if (!rows.has(key)) {
    rows.set(key, {
      key,
      scope,
      label,
      sleeveKey: meta.sleeveKey || "",
      styleKey: meta.styleKey || "",
      actualWeight: 0,
      approvedWeight: 0,
    });
  }
  rows.get(key)[weightField] += Number(weight || 0);
}

function addHoldingToRebalanceScopes(rows, holding, weightField, source = "approved") {
  const ticker = source === "actual" ? holding.ticker : holding.symbol;
  const meta = source === "actual" ? approvedMetaByTicker(ticker) : {};
  if (source === "actual" && !state.holdings.some((item) => item.assetClass === "Equity")) return;
  const assetClass = holding.assetClass || meta.assetClass;
  if (assetClassKey(assetClass) !== "equity") return;

  const region = holding.region || meta.region;
  const sleeveKey = equitySleeveKey(region);
  if (!["us", "developed", "emerging"].includes(sleeveKey)) return;

  const weight = Number(holding.weight || 0);
  const sleeveLabel = equitySleeveLabelByKey(sleeveKey);
  addRebalanceScopeWeight(rows, `sleeve:${sleeveKey}`, "Sleeve", sleeveLabel, weightField, weight, { sleeveKey });

  const styleKey = styleKeyForRebalance(holding.styleFactor || meta.styleFactor);
  if (!styleKey) return;
  addRebalanceScopeWeight(
    rows,
    `style:${sleeveKey}:${styleKey}`,
    "Style bucket",
    `${sleeveLabel} / ${styleLabelForRebalance(styleKey)}`,
    weightField,
    weight,
    { sleeveKey, styleKey },
  );
}

function rebalanceCorridorBounds(approvedWeight, limits) {
  const approved = Math.max(0, Number(approvedWeight || 0));
  const lower = approved * (1 + Number(limits.lower || 0) / 100);
  const upper = approved * (1 + Number(limits.upper || 0) / 100);
  return {
    lower: Math.max(0, Math.min(lower, upper)),
    upper: Math.max(0, Math.max(lower, upper)),
  };
}

function rebalanceScopeStatus(scopeRow, limits) {
  const bounds = rebalanceCorridorBounds(scopeRow.approvedWeight, limits);
  const actual = Number(scopeRow.actualWeight || 0);
  if (actual > bounds.upper + 0.0001) return { breached: true, direction: "above", label: "Above corridor", bounds };
  if (actual < bounds.lower - 0.0001) return { breached: true, direction: "below", label: "Below corridor", bounds };
  return { breached: false, direction: "inside", label: "OK", bounds };
}

function rebalanceScopeRows() {
  const rows = new Map();
  state.holdings.forEach((holding) => addHoldingToRebalanceScopes(rows, holding, "approvedWeight", "approved"));
  latestActualHoldingsRows().forEach((holding) => addHoldingToRebalanceScopes(rows, holding, "actualWeight", "actual"));
  return Array.from(rows.values())
    .filter((row) => row.actualWeight || row.approvedWeight)
    .sort((a, b) => {
      const scopeRank = { Sleeve: 0, "Style bucket": 1 };
      return (scopeRank[a.scope] ?? 9) - (scopeRank[b.scope] ?? 9)
        || a.label.localeCompare(b.label);
    })
    .map((row) => ({
      ...row,
      drift: row.actualWeight - row.approvedWeight,
    }));
}

function renderRebalanceScopeMonitor(limits, formalCheckActive = true) {
  const body = el("rebalanceScopeRows");
  body.replaceChildren();

  return rebalanceScopeRows().reduce((count, scopeRow) => {
    const status = rebalanceScopeStatus(scopeRow, limits);
    const row = document.createElement("tr");
    [
      scopeRow.scope,
      scopeRow.label,
      percent(scopeRow.actualWeight),
      percent(scopeRow.approvedWeight),
      `${percent(status.bounds.lower)} - ${percent(status.bounds.upper)}`,
      percent(scopeRow.drift),
      status.breached ? (formalCheckActive ? "Rebalance" : "Observed") : "OK",
    ].forEach((value, index) => {
      const isStatusColumn = index === 6;
      const cell = document.createElement(isStatusColumn ? "th" : "td");
      cell.textContent = value;
      if (isStatusColumn) cell.className = status.breached ? (formalCheckActive ? "is-off" : "is-warning") : "is-close";
      row.append(cell);
    });
    body.append(row);
    return count + (status.breached ? 1 : 0);
  }, 0);
}

function latestActualHoldingsDate() {
  const latestKey = actualHoldings
    .map((holding) => normalizedIsoDate(holding.asOfDate))
    .filter(Boolean)
    .sort()
    .at(-1);
  return latestKey ? localDateFromIsoValue(latestKey) : null;
}

function latestActualHoldingsRows() {
  return latestRowsByAsOfDate(actualHoldings);
}

function rebalanceLastFormalCheckDate() {
  return localDateFromIsoValue(state.rebalanceFormalCheckDate || "");
}

function rebalanceAcceptedAtDate() {
  return localDateFromIsoValue(state.rebalanceAcceptedPlan?.acceptedAt || "");
}

function resetAcceptedRebalancePlan() {
  state.rebalanceAcceptedPlan = structuredClone(defaults.rebalanceAcceptedPlan);
  if (el("rebalanceAcceptedPlanStatus")) {
    el("rebalanceAcceptedPlanStatus").textContent = "No active rebalance plan. Latest holdings are within corridor or no monthly alert is open.";
    el("rebalanceAcceptedPlanStatus").className = "";
  }
}

function addTradingDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let added = 0;
  while (added < days) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return next;
}

function subtractTradingDays(date, days) {
  const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let removed = 0;
  while (removed < days) {
    previous.setDate(previous.getDate() - 1);
    const day = previous.getDay();
    if (day !== 0 && day !== 6) removed += 1;
  }
  return previous;
}

function escalationDue() {
  const triggerDate = rebalanceAcceptedAtDate();
  if (!triggerDate) return false;
  const limits = rebalanceLimits();
  const dueDate = addTradingDays(triggerDate, limits.completionDays);
  const today = effectiveTodayDate();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return today >= dueDate;
}

function escalationDueDateLabel() {
  const acceptedPlan = state.rebalanceAcceptedPlan || {};
  if (acceptedPlan.dueDate) return acceptedPlan.dueDate;
  const triggerDate = rebalanceAcceptedAtDate();
  if (!triggerDate) return "Plan not accepted";
  const limits = rebalanceLimits();
  const dueDate = addTradingDays(triggerDate, limits.completionDays);
  return dueDate.toISOString().slice(0, 10);
}

function escalationRecipients() {
  const committeeMembers = state.committee.map((member) => member.member || member.role).join(", ");
  const manager = state.rebalanceOwner || state.proposal.executionManager || state.userCredentials.execution.username;
  return `${committeeMembers}; ${manager}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function rebalanceFrequencyDays() {
  return 30;
}

function rebalanceNextFormalCheckDate(latestDate) {
  const lastCheck = rebalanceLastFormalCheckDate();
  if (lastCheck) return addDays(lastCheck, rebalanceFrequencyDays());
  return latestDate;
}

function monthlyRebalanceCheckDue(latestDate) {
  if (!latestDate) return false;
  const nextDate = rebalanceNextFormalCheckDate(latestDate);
  if (!nextDate) return false;
  return latestDate >= nextDate || isDateDue(nextDate);
}

function activeMonthlyRebalanceAlertCount(limits = rebalanceLimits()) {
  const latestDate = latestActualHoldingsDate();
  const formalCheckActive = monthlyRebalanceCheckDue(latestDate) || state.rebalanceFormalCheckOpen;
  if (!formalCheckActive) return 0;
  return rebalanceScopeRows().filter((scopeRow) => rebalanceScopeStatus(scopeRow, limits).breached).length;
}

function acceptedRebalancePlanSummary() {
  const acceptedPlan = state.rebalanceAcceptedPlan || {};
  if (!acceptedPlan.plan || !acceptedPlan.acceptedAt) return null;
  return {
    ...acceptedPlan,
    acceptedDate: dateOnlyLabel(new Date(acceptedPlan.acceptedAt)),
  };
}

function updateAcceptedRebalancePlanStatus() {
  const status = el("rebalanceAcceptedPlanStatus");
  if (!status) return;
  const acceptedPlan = acceptedRebalancePlanSummary();
  if (!acceptedPlan) {
    status.textContent = "No rebalance plan accepted. Select a plan and accept it after a monthly corridor alert.";
    status.className = "is-warning";
    return;
  }
  const executed = rebalanceLimits().actionStatus === "Executed";
  status.textContent = `${acceptedPlan.plan} accepted by ${acceptedPlan.acceptedBy} on ${acceptedPlan.acceptedDate}; due by ${acceptedPlan.dueDate}.${executed ? " Marked executed." : ""}`;
  status.className = executed ? "is-close" : (escalationDue() ? "is-off" : "is-warning");
}

function dateOnlyLabel(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateDue(date) {
  if (!date || Number.isNaN(date.getTime())) return false;
  const today = effectiveTodayDate();
  today.setHours(0, 0, 0, 0);
  const checkedDate = new Date(date);
  checkedDate.setHours(0, 0, 0, 0);
  return today >= checkedDate;
}

function updateRebalanceSchedulePanel(counts = {}) {
  const latestDate = latestActualHoldingsDate();
  const lastCheckDate = rebalanceLastFormalCheckDate();
  const nextDate = latestDate ? rebalanceNextFormalCheckDate(latestDate) : null;
  const owner = String(state.rebalanceOwner || "").trim() || state.userCredentials.execution.username;
  const totalRebalanceCount = counts.totalRebalanceCount || 0;
  const actionPlanCount = counts.actionPlanCount || 0;
  const escalationCount = counts.escalationCount || 0;
  const limits = rebalanceLimits();

  el("rebalanceLastCheckDate").textContent = lastCheckDate ? dateOnlyLabel(lastCheckDate) : (latestDate ? "Initial check due" : "No holdings load");
  el("rebalanceNextCheckDate").textContent = nextDate ? dateOnlyLabel(nextDate) : "After first load";
  el("rebalanceEscalationRecipients").textContent = escalationRecipients();

  const status = el("rebalanceScheduleStatus");
  if (!latestDate) {
    status.textContent = `Monthly corridor check: waiting for first actual holdings load. Owner: ${owner}.`;
    status.className = "approval-decision";
    return;
  }

  if (escalationCount) {
    status.textContent = `Monthly corridor check: escalation required. ${escalationCount} sleeve/style breach(es) were not marked executed within ${limits.completionDays} trading day(s). Auto-report to ${escalationRecipients()}.`;
    status.className = "approval-decision is-invalid";
    return;
  }

  if (totalRebalanceCount) {
    status.textContent = `Monthly corridor check: ${totalRebalanceCount} sleeve/style alert(s), with ${actionPlanCount} standard plan row(s). Owner ${owner} should complete the selected plan or escalate by ${escalationDueDateLabel()}.`;
    status.className = "approval-decision is-warning";
    return;
  }

  if (isDateDue(nextDate)) {
    status.textContent = "Monthly corridor check: review is due. Use the latest daily holdings file to run the formal corridor check.";
    status.className = "approval-decision is-warning";
    return;
  }

  status.textContent = `Monthly corridor check: clear. No trade is triggered. Daily imports continue as data updates; next formal check is ${dateOnlyLabel(nextDate)}.`;
  status.className = "approval-decision is-valid";
}

function setRebalanceDashboardValue(id, text, className = "") {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
  node.className = className;
}

function rebalanceExceptionDashboardText() {
  const ticker = exceptionTicker();
  if (!ticker) return { text: "No exception submitted", className: "" };
  if (!exceptionReasonProvided()) return { text: `${ticker}: reason required`, className: "is-warning" };
  const approvals = state.rebalanceExceptionCommittee.filter((member) => member.status === "Approve").length;
  const rejections = state.rebalanceExceptionCommittee.filter((member) => member.status === "Reject").length;
  if (rejections) return { text: `${ticker}: rejected`, className: "is-off" };
  if (exceptionApprovedForTicker(ticker)) return { text: `${ticker}: approved`, className: "is-close" };
  return { text: `${ticker}: pending ${approvals}/${state.rebalanceExceptionCommittee.length}`, className: "is-warning" };
}

function updateRebalanceDashboard(counts = {}) {
  const latestDate = latestActualHoldingsDate();
  const totalRebalanceCount = counts.totalRebalanceCount || 0;
  const actionPlanCount = counts.actionPlanCount || 0;
  const escalationCount = counts.escalationCount || 0;
  const limits = rebalanceLimits();

  if (!latestDate) {
    setRebalanceDashboardValue("rebalanceOpenAlerts", "No holdings load");
    setRebalanceDashboardValue("rebalanceDeadlineStatus", "No holdings load");
    setRebalanceDashboardValue("rebalanceEscalationStatus", "No holdings load");
  } else if (escalationCount) {
    setRebalanceDashboardValue("rebalanceOpenAlerts", `${totalRebalanceCount} sleeve/style alert(s), ${actionPlanCount} plan row(s)`, "is-off");
    setRebalanceDashboardValue("rebalanceDeadlineStatus", `Past due: ${escalationDueDateLabel()}`, "is-off");
    setRebalanceDashboardValue("rebalanceEscalationStatus", `Escalate to ${escalationRecipients()}`, "is-off");
  } else if (totalRebalanceCount) {
    const acceptedPlan = acceptedRebalancePlanSummary();
    setRebalanceDashboardValue("rebalanceOpenAlerts", `${totalRebalanceCount} sleeve/style alert(s), ${actionPlanCount} plan row(s)`, "is-warning");
    setRebalanceDashboardValue("rebalanceDeadlineStatus", acceptedPlan ? `Due by ${acceptedPlan.dueDate} (${limits.completionDays} trading day rule)` : "Plan not accepted", "is-warning");
    setRebalanceDashboardValue("rebalanceEscalationStatus", acceptedPlan ? "Execution follow-up before committee escalation" : "Accept a plan to start the deadline", "is-warning");
  } else {
    setRebalanceDashboardValue("rebalanceOpenAlerts", "No open drift alerts", "is-close");
    setRebalanceDashboardValue("rebalanceDeadlineStatus", "No rebalance action due", "is-close");
    setRebalanceDashboardValue("rebalanceEscalationStatus", "No escalation required", "is-close");
  }

  const exceptionStatus = rebalanceExceptionDashboardText();
  setRebalanceDashboardValue("rebalanceExceptionStatus", exceptionStatus.text, exceptionStatus.className);
  updateAcceptedRebalancePlanStatus();
}

function renderRebalanceFollowUps() {
  const body = el("rebalanceFollowUpRows");
  if (!body) return;
  body.replaceChildren();

  if (!rebalanceFollowUps.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No rebalance follow-up has been recorded.";
    row.append(cell);
    body.append(row);
    return;
  }

  rebalanceFollowUps.slice(0, 12).forEach((item) => {
    const row = document.createElement("tr");
    [
      new Date(item.time).toLocaleString(),
      item.status,
      item.openAlerts,
      item.owner,
      item.note || "-",
      item.actor,
    ].forEach((value, index) => {
      const cell = document.createElement(index === 1 ? "th" : "td");
      cell.textContent = value || "-";
      if (index === 1) {
        cell.className = item.status === "Handled" ? "is-close" : (item.status === "Escalated" ? "is-off" : "is-warning");
      }
      row.append(cell);
    });
    body.append(row);
  });
}

function addRebalanceFollowUp() {
  if (!requirePermission("execution", "record rebalance follow-up")) return;
  const status = el("rebalanceFollowUpStatus").value;
  const owner = el("rebalanceFollowUpOwner").value.trim() || state.rebalanceOwner || state.userCredentials.execution.username;
  const note = el("rebalanceFollowUpNote").value.trim();
  const openAlerts = el("rebalanceOpenAlerts").textContent || "No dashboard data";
  const record = {
    time: new Date().toISOString(),
    status,
    owner,
    note,
    openAlerts,
    actor: currentAuditActor(),
  };
  rebalanceFollowUps.unshift(record);
  rebalanceFollowUps = rebalanceFollowUps.slice(0, 50);
  el("rebalanceFollowUpNote").value = "";
  logAudit("Rebalance follow-up recorded", `${status}; ${openAlerts}; owner ${owner}`);
  renderRebalanceFollowUps();
  updateRebalanceDashboard();
  updateWorkflowOverview();
}

function acceptRebalancePlan() {
  if (!requirePermission("execution", "accept rebalance plan")) return;
  const limits = rebalanceLimits();
  const latestDate = latestActualHoldingsDate();
  const activeAlertCount = activeMonthlyRebalanceAlertCount(limits);
  const status = el("rebalanceAcceptedPlanStatus");

  if (!latestDate) {
    if (status) {
      status.textContent = "Cannot accept a rebalance plan before actual holdings are loaded.";
      status.className = "is-off";
    }
    return;
  }

  if (!activeAlertCount) {
    if (status) {
      status.textContent = "Cannot accept a rebalance plan because no monthly corridor alert is active.";
      status.className = "is-off";
    }
    return;
  }

  const acceptedAt = effectiveTodayDate();
  const dueDate = addTradingDays(acceptedAt, limits.completionDays);
  state.rebalanceAcceptedPlan = {
    plan: limits.planChoice,
    acceptedAt: acceptedAt.toISOString(),
    acceptedBy: currentAuditActor(),
    dueDate: dateOnlyLabel(dueDate),
  };
  state.rebalanceActionStatus = "Pending";
  if (el("rebalanceActionStatus")) el("rebalanceActionStatus").value = "Pending";
  state.rebalanceFormalCheckOpen = true;
  syncTradeOrdersFromAcceptedRebalancePlan(limits);
  logAudit("Rebalance plan accepted", `${limits.planChoice} accepted by ${currentAuditActor()}; due by ${dateOnlyLabel(dueDate)}`);
  renderActualHoldings();
}

function clearRebalanceGeneratedTradeOrders() {
  state.tradeOrders = state.tradeOrders.filter((order) => order.source !== "Rebalance Plan");
}

function latestActualPriceByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  const row = latestActualHoldingsRows().find((holding) => String(holding.ticker || "").trim().toUpperCase() === normalized);
  if (!row) return 0;
  const directPrice = Number(row.price || 0);
  if (directPrice > 0) return directPrice;
  const quantity = Number(row.quantity || 0);
  const marketValue = Number(row.marketValue || 0);
  return quantity > 0 ? marketValue / quantity : 0;
}

function latestHistoricalPriceByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  for (let index = priceHistory.length - 1; index >= 0; index -= 1) {
    const row = priceHistory[index];
    const value = Number(row?.[normalized] ?? row?.[normalized.toLowerCase()]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function tradePriceForRebalanceTicker(ticker) {
  return latestActualPriceByTicker(ticker) || latestHistoricalPriceByTicker(ticker) || 1;
}

function rebalanceGeneratedTradeOrders(limits) {
  const grouped = new Map();
  rebalanceActionPlanRows(limits)
    .filter((plan) => plan.plan === limits.planChoice)
    .filter((plan) => ["Buy", "Sell"].includes(plan.action))
    .filter((plan) => String(plan.ticker || "").trim() && plan.ticker !== "-")
    .filter((plan) => Number(plan.tradeAmount || 0) > 0)
    .forEach((plan) => {
      const ticker = String(plan.ticker || "").trim().toUpperCase();
      const key = `${plan.action}|${ticker}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          action: plan.action,
          ticker,
          amount: 0,
          segments: new Set(),
        });
      }
      const item = grouped.get(key);
      item.amount += Number(plan.tradeAmount || 0);
      if (plan.segment) item.segments.add(plan.segment);
    });

  return Array.from(grouped.values()).map((item) => {
    const price = tradePriceForRebalanceTicker(item.ticker);
    return {
      action: item.action,
      ticker: item.ticker,
      quantity: price > 0 ? item.amount / price : 0,
      price,
      reasonType: "Compliant",
      remark: `${limits.planChoice}; ${Array.from(item.segments).slice(0, 3).join("; ")}`,
      executionApprover: state.proposal.executionManager || state.userCredentials.execution.username,
      executionStatus: "Pending",
      committeeStatus: "Pending",
      authorizedAt: "",
      source: "Rebalance Plan",
    };
  });
}

function syncTradeOrdersFromAcceptedRebalancePlan(limits) {
  const generated = rebalanceGeneratedTradeOrders(limits);
  if (!generated.length) return;
  state.tradeOrders = generated;
  logAudit("Rebalance trade orders generated", `${generated.length} order(s) generated from ${limits.planChoice}`);
  renderTradeOrders();
  queueTradeAuthorizationSync();
}

function actualWeightByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  return latestActualHoldingsRows()
    .filter((holding) => String(holding.ticker || "").trim().toUpperCase() === normalized)
    .reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
}

function actualMarketValueByTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  return latestActualHoldingsRows()
    .filter((holding) => String(holding.ticker || "").trim().toUpperCase() === normalized)
    .reduce((sum, holding) => sum + Number(holding.marketValue || 0), 0);
}

function tickerMatchesRebalanceScope(ticker, scopeRow) {
  const meta = approvedMetaByTicker(ticker);
  if (assetClassKey(meta.assetClass) !== "equity") return false;
  if (equitySleeveKey(meta.region) !== scopeRow.sleeveKey) return false;
  if (scopeRow.scope === "Sleeve") return true;
  return styleKeyForRebalance(meta.styleFactor) === scopeRow.styleKey;
}

function rebalancePlanCandidates(scopeRow) {
  const tickers = new Set();
  state.holdings.forEach((holding) => tickers.add(String(holding.symbol || "").trim().toUpperCase()));
  actualHoldings.forEach((holding) => tickers.add(String(holding.ticker || "").trim().toUpperCase()));
  return Array.from(tickers)
    .filter(Boolean)
    .filter((ticker) => tickerMatchesRebalanceScope(ticker, scopeRow))
    .map((ticker) => ({
      ticker,
      actualWeight: actualWeightByTicker(ticker),
      approvedWeight: approvedWeightByTicker(ticker),
      actualMarketValue: actualMarketValueByTicker(ticker),
    }));
}

function allocateRebalancePlanRows(scopeRow, planName, limits, totalMarketValue) {
  const status = rebalanceScopeStatus(scopeRow, limits);
  if (!status.breached) return [];
  const targetWeight = planName === "Target Weight Plan"
    ? scopeRow.approvedWeight
    : (status.direction === "above" ? status.bounds.upper : status.bounds.lower);
  const delta = targetWeight - scopeRow.actualWeight;
  const action = delta >= 0 ? "Buy" : "Sell";
  let remaining = Math.abs(delta);
  if (remaining <= 0.0001) return [];

  const candidates = rebalancePlanCandidates(scopeRow)
    .map((candidate) => ({
      ...candidate,
      gap: action === "Sell"
        ? candidate.actualWeight - candidate.approvedWeight
        : candidate.approvedWeight - candidate.actualWeight,
    }))
    .sort((a, b) => Math.max(0, b.gap) - Math.max(0, a.gap)
      || b.approvedWeight - a.approvedWeight
      || b.actualWeight - a.actualWeight);

  const rows = [];
  candidates.forEach((candidate) => {
    if (remaining <= 0.0001) return;
    const preferredWeight = Math.max(0, candidate.gap);
    const fallbackWeight = action === "Sell" ? candidate.actualWeight : candidate.approvedWeight;
    const usableWeight = Math.max(preferredWeight, fallbackWeight);
    const tradeWeight = Math.min(remaining, usableWeight);
    if (tradeWeight <= 0.0001) return;
    rows.push({
      plan: planName,
      scope: scopeRow.scope,
      segment: scopeRow.label,
      ticker: candidate.ticker,
      trigger: status.label,
      actualWeight: scopeRow.actualWeight,
      targetWeight,
      action,
      tradeWeight,
      tradeAmount: totalMarketValue > 0 ? totalMarketValue * tradeWeight / 100 : 0,
      deadline: escalationDueDateLabel(),
      status: limits.planChoice === planName
        ? (limits.actionStatus === "Executed" ? "Accepted / executed" : (acceptedRebalancePlanSummary() ? "Accepted / pending execution" : "Selected / not accepted"))
        : "System option",
      escalated: limits.planChoice === planName && limits.actionStatus !== "Executed" && escalationDue(),
    });
    remaining -= tradeWeight;
  });

  if (!rows.length) {
    rows.push({
      plan: planName,
      scope: scopeRow.scope,
      segment: scopeRow.label,
      ticker: "-",
      trigger: status.label,
      actualWeight: scopeRow.actualWeight,
      targetWeight,
      action,
      tradeWeight: remaining,
      tradeAmount: totalMarketValue > 0 ? totalMarketValue * remaining / 100 : 0,
      deadline: escalationDueDateLabel(),
      status: acceptedRebalancePlanSummary() ? "Segment-level fallback / accepted" : "Segment-level fallback",
      escalated: limits.planChoice === planName && limits.actionStatus !== "Executed" && escalationDue(),
    });
  }

  return rows;
}

function exceptionPlanRowsForScope(scopeRow, limits) {
  const status = rebalanceScopeStatus(scopeRow, limits);
  if (!status.breached) return [];
  const approved = rebalanceExceptionApproved();
  return [{
    plan: "Exception Plan",
    scope: scopeRow.scope,
    segment: scopeRow.label,
    ticker: "-",
    trigger: status.label,
    actualWeight: scopeRow.actualWeight,
    targetWeight: scopeRow.actualWeight,
    action: "Hold current breach",
    tradeWeight: 0,
    tradeAmount: 0,
    deadline: escalationDueDateLabel(),
    status: approved ? (acceptedRebalancePlanSummary() ? "Exception approved / accepted" : "Exception approved") : "Committee approval required",
    escalated: limits.planChoice === "Exception Plan" && !approved && escalationDue(),
    exceptionApproved: approved,
  }];
}

function rebalanceActionPlanRows(limits) {
  const totalMarketValue = latestActualHoldingsRows().reduce((sum, holding) => sum + Number(holding.marketValue || 0), 0);
  const breachedScopeRows = rebalanceScopeRows().filter((scopeRow) => rebalanceScopeStatus(scopeRow, limits).breached);
  const styleRows = breachedScopeRows.filter((scopeRow) => scopeRow.scope === "Style bucket");
  const actionSourceRows = styleRows.length ? styleRows : breachedScopeRows;
  return actionSourceRows.flatMap((scopeRow) => [
    ...allocateRebalancePlanRows(scopeRow, "Minimum Trade Plan", limits, totalMarketValue),
    ...allocateRebalancePlanRows(scopeRow, "Target Weight Plan", limits, totalMarketValue),
    ...exceptionPlanRowsForScope(scopeRow, limits),
  ]);
}

function renderRebalanceActionPlan(limits, formalCheckActive = true) {
  const body = el("rebalanceActionRows");
  if (!body) return 0;
  body.replaceChildren();
  if (!formalCheckActive) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 11;
    cell.textContent = "No active rebalance trade plan. Daily holdings are loaded, but the formal monthly corridor check has not triggered a trade process.";
    row.append(cell);
    body.append(row);
    return 0;
  }
  const rows = rebalanceActionPlanRows(limits);

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 11;
    cell.textContent = "No sleeve/style rebalance action is required.";
    row.append(cell);
    body.append(row);
    return 0;
  }

  rows.forEach((plan) => {
    const row = document.createElement("tr");
    [
      plan.plan,
      plan.scope,
      plan.segment,
      plan.ticker,
      plan.trigger,
      percent(plan.actualWeight),
      percent(plan.targetWeight),
      `${plan.action} ${percent(plan.tradeWeight)}`,
      currency.format(plan.tradeAmount),
      plan.deadline,
      plan.status,
    ].forEach((value, index) => {
      const cell = document.createElement(index === 10 ? "th" : "td");
      cell.textContent = value;
      if (index === 10) {
        cell.className = plan.escalated ? "is-off" : (plan.exceptionApproved ? "is-close" : "is-warning");
      }
      row.append(cell);
    });
    body.append(row);
  });
  return rows.length;
}

function activeUsersByGroup(group) {
  return state.users.filter((user) => user.active && user.group === group && String(user.name || "").trim());
}

function isActiveUserInGroup(name, group) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return false;
  return activeUsersByGroup(group).some((user) => user.name.trim().toLowerCase() === normalized);
}

function invalidCommitteeApprovers(committee) {
  return committee
    .filter((member) => member.status !== "Pending")
    .filter((member) => !isActiveUserInGroup(member.member, "Decision Committee"));
}

function formatDecisionTimestamp(value) {
  if (!value) return "No decision recorded.";
  return `Decision recorded ${new Date(value).toLocaleString()}.`;
}

function validateUsers() {
  const names = state.users.map((user) => String(user.name || "").trim()).filter(Boolean);
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  const activeDecisionMembers = activeUsersByGroup("Decision Committee").length;
  const activeExecutionMembers = activeUsersByGroup("Execution Team").length;

  if (!String(state.systemAdmin || "").trim()) return { ok: false, message: "User administration: system administrator name is required." };
  if (duplicateNames.length) return { ok: false, message: `User administration: duplicate user name(s): ${Array.from(new Set(duplicateNames)).join(", ")}.` };
  if (activeDecisionMembers < 1) return { ok: false, message: "User administration: 1 active decision committee approver is required." };
  if (activeExecutionMembers < 1) return { ok: false, message: "User administration: at least 1 active execution team user is required." };
  return { ok: true, message: `User administration: ${activeDecisionMembers} active decision committee approver(s), ${activeExecutionMembers} active execution team approver(s).` };
}

function updateUserAdminStatus() {
  const status = validateUsers();
  el("userAdminStatus").textContent = status.message;
  el("userAdminStatus").className = status.ok ? "validation-message is-valid" : "validation-message is-invalid";
}

function refreshGovernanceAfterUserChange(options = {}) {
  updateUserAdminStatus();
  updatePermissionVisibility();
  updateTargetApprovalDecision();
  updateCommitteeDecision();
  updateExceptionApprovalDecision();
  renderTradeOrders();
  if (options.rerenderUsers) renderUsers();
}

function renderUsers() {
  const body = el("userRows");
  const template = el("userTemplate");
  if (!body || !template) return;
  body.replaceChildren();

  state.users.forEach((user, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const name = row.querySelector(".user-name");
    const group = row.querySelector(".user-group");
    const role = row.querySelector(".user-role");
    const active = row.querySelector(".user-active");
    const remove = row.querySelector(".user-remove");

    name.value = user.name;
    group.value = user.group;
    role.value = user.role;
    active.value = user.active ? "Active" : "Inactive";

    name.addEventListener("change", () => {
      if (!requirePermission("admin", "edit user name")) { name.value = user.name; return; }
      user.name = name.value;
      logAudit("User updated", `User name changed to ${user.name}`);
      refreshGovernanceAfterUserChange();
    });
    group.addEventListener("change", () => {
      if (!requirePermission("admin", "edit user group")) { group.value = user.group; return; }
      user.group = group.value;
      logAudit("User updated", `${user.name || "User"} group changed to ${user.group}`);
      refreshGovernanceAfterUserChange();
    });
    role.addEventListener("change", () => {
      if (!requirePermission("admin", "edit user role")) { role.value = user.role; return; }
      user.role = role.value;
      logAudit("User updated", `${user.name || "User"} role changed to ${user.role}`);
      refreshGovernanceAfterUserChange();
    });
    active.addEventListener("change", () => {
      if (!requirePermission("admin", "edit user status")) { active.value = user.active ? "Active" : "Inactive"; return; }
      user.active = active.value === "Active";
      logAudit("User updated", `${user.name || "User"} status changed to ${active.value}`);
      refreshGovernanceAfterUserChange();
    });
    remove.addEventListener("click", () => {
      if (!requirePermission("admin", "remove user")) return;
      logAudit("User removed", `${user.name || "Unnamed user"} removed from ${user.group}`);
      state.users.splice(index, 1);
      refreshGovernanceAfterUserChange({ rerenderUsers: true });
    });

    body.append(row);
  });

  updateUserAdminStatus();
}

function addUser() {
  if (!requirePermission("admin", "add user")) return;
  state.users.push({ name: "New User", group: "Execution Team", role: "Team Member", active: true });
  logAudit("User added", "New User added to Execution Team");
  renderUsers();
  refreshGovernanceAfterUserChange();
}

function exceptionTicker() {
  return String(state.rebalanceException.ticker || "").trim().toUpperCase();
}

function exceptionReasonProvided() {
  return Boolean(String(state.rebalanceException.reason || "").trim());
}

function rebalanceExceptionApproved() {
  const approvals = state.rebalanceExceptionCommittee.filter((member) => member.status === "Approve").length;
  const rejections = state.rebalanceExceptionCommittee.filter((member) => member.status === "Reject").length;
  return exceptionReasonProvided()
    && rejections === 0
    && invalidCommitteeApprovers(state.rebalanceExceptionCommittee).length === 0
    && approvals === state.rebalanceExceptionCommittee.length;
}

function exceptionApprovedForTicker(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  const approvals = state.rebalanceExceptionCommittee.filter((member) => member.status === "Approve").length;
  const rejections = state.rebalanceExceptionCommittee.filter((member) => member.status === "Reject").length;
  return normalized
    && normalized === exceptionTicker()
    && exceptionReasonProvided()
    && rejections === 0
    && invalidCommitteeApprovers(state.rebalanceExceptionCommittee).length === 0
    && approvals === state.rebalanceExceptionCommittee.length;
}

function updateExceptionApprovalDecision() {
  const approvals = state.rebalanceExceptionCommittee.filter((member) => member.status === "Approve").length;
  const rejections = state.rebalanceExceptionCommittee.filter((member) => member.status === "Reject").length;
  const ticker = exceptionTicker();
  const decision = el("exceptionApprovalDecision");
  const invalidApprovers = invalidCommitteeApprovers(state.rebalanceExceptionCommittee);

  if (!ticker || !exceptionReasonProvided()) {
    decision.textContent = "Exception approval: pending. Enter the exception scope/ticker and a required reason before committee approval.";
    decision.className = "approval-decision";
    renderActualHoldings();
    return;
  }

  if (invalidApprovers.length) {
    decision.textContent = `Exception approval: blocked. ${invalidApprovers.map((member) => member.member || member.role).join(", ")} must be active decision committee user(s).`;
    decision.className = "approval-decision is-invalid";
    renderActualHoldings();
    return;
  }

  if (rejections > 0) {
    decision.textContent = `Exception approval: rejected by the decision committee approver for ${ticker}.`;
    decision.className = "approval-decision is-invalid";
    renderActualHoldings();
    return;
  }

  if (approvals === state.rebalanceExceptionCommittee.length) {
    decision.textContent = `Exception approval: approved. ${ticker} may follow the standard Exception Plan for the submitted reason.`;
    decision.className = "approval-decision is-valid";
    renderActualHoldings();
    return;
  }

  decision.textContent = `Exception approval: pending. ${approvals} of ${state.rebalanceExceptionCommittee.length} decision approval received for ${ticker}.`;
  decision.className = "approval-decision";
  renderActualHoldings();
}

function renderActualHoldings() {
  const body = el("actualHoldingRows");
  body.replaceChildren();

  if (!actualHoldings.length) {
    dataQuality.actualHoldings = validateActualHoldingsQuality(actualHoldings);
    applyQualityStatus("actualHoldingsStatus", dataQuality.actualHoldings);
    el("rebalanceScopeRows").replaceChildren();
    el("rebalanceActionRows").replaceChildren();
    el("rebalanceAlert").textContent = "Rebalance alert: no actual holdings loaded yet.";
    el("rebalanceAlert").className = "rebalance-alert";
    updateAcceptedRebalancePlanStatus();
	    updateRebalanceSchedulePanel();
	    updateRebalanceDashboard();
	    renderEquityValuePanels();
	    renderTradeHoldingCompletion();
	    updateWorkflowOverview();
	    return;
	  }

  const latestHoldings = latestActualHoldingsRows();
  const totalMarketValue = latestHoldings.reduce((sum, holding) => sum + holding.marketValue, 0);
  let reviewCount = 0;
  let escalationCount = 0;
  const limits = rebalanceLimits();
  const shouldEscalate = limits.actionStatus !== "Executed" && escalationDue();

  latestHoldings.forEach((holding) => {
    const row = document.createElement("tr");
    const approvedWeight = approvedWeightByTicker(holding.ticker);
    const drift = holding.weight - approvedWeight;
    const assetClass = holding.assetClass || approvedAssetClassByTicker(holding.ticker);
    const isEquity = assetClassKey(assetClass) === "equity";
    const maxSingleSecurityWeight = singleSecurityMaxPortfolioWeight({ ...holding, symbol: holding.ticker, assetClass });
    const exceedsSingleSecurityLimit = isEquity && holding.weight > maxSingleSecurityWeight;
    const unapprovedEquityTicker = isEquity && approvedWeight <= 0;
    const needsReview = exceedsSingleSecurityLimit || unapprovedEquityTicker;
    if (needsReview) reviewCount += 1;

    [
      holding.asOfDate || "-",
      holding.account || "-",
      holding.broker || "-",
      holding.ticker,
      holding.name || "-",
      holding.currency || "-",
      Number(holding.quantity || 0).toFixed(2),
      holding.price ? Number(holding.price).toFixed(2) : "-",
      holding.marketValue ? currency.format(holding.marketValue) : "-",
      percent(holding.weight),
      percent(approvedWeight),
      percent(drift),
      unapprovedEquityTicker ? "Unapproved ticker" : (exceedsSingleSecurityLimit ? "Single limit" : "OK"),
    ].forEach((value, index) => {
      const isStatusColumn = index === 12;
      const cell = document.createElement(isStatusColumn ? "th" : "td");
      cell.textContent = value;
      if (isStatusColumn) cell.className = needsReview ? "is-off" : "is-close";
      row.append(cell);
    });

    body.append(row);
  });

  const monthlyCheckDue = monthlyRebalanceCheckDue(latestActualHoldingsDate());
  const formalCheckActive = monthlyCheckDue || state.rebalanceFormalCheckOpen;
  const observedScopeCount = renderRebalanceScopeMonitor(limits, formalCheckActive);
  const scopeRebalanceCount = formalCheckActive ? observedScopeCount : 0;
  const actionPlanCount = renderRebalanceActionPlan(limits, formalCheckActive);
  const totalRebalanceCount = scopeRebalanceCount;
  if (monthlyCheckDue) {
    state.rebalanceFormalCheckDate = dateOnlyLabel(latestActualHoldingsDate());
    state.rebalanceFormalCheckOpen = observedScopeCount > 0 && limits.actionStatus !== "Executed";
  } else if (limits.actionStatus === "Executed" || observedScopeCount === 0) {
    state.rebalanceFormalCheckOpen = false;
  }
  if (observedScopeCount === 0) resetAcceptedRebalancePlan();
  if (scopeRebalanceCount && shouldEscalate) escalationCount += scopeRebalanceCount;

  dataQuality.actualHoldings = validateActualHoldingsQuality(actualHoldings);
  el("actualHoldingsStatus").textContent = `${dataQuality.actualHoldings.status}: ${dataQuality.actualHoldings.message} Loaded ${actualHoldings.length} historical holding row(s). Latest snapshot market value ${currency.format(totalMarketValue)}. ${reviewCount} ticker risk flag(s), ${observedScopeCount} observed sleeve/style drift item(s), ${scopeRebalanceCount} active monthly rebalance alert(s), and ${actionPlanCount} standard plan row(s).`;
  el("actualHoldingsStatus").className = dataQuality.actualHoldings.status === "Fail"
    ? "validation-message is-invalid"
    : (reviewCount || observedScopeCount || dataQuality.actualHoldings.status === "Warning" ? "validation-message is-warning" : "validation-message is-valid");
  if (escalationCount) {
    el("rebalanceAlert").textContent = `Rebalance escalation: selected sleeve/style plan was not marked executed within ${limits.completionDays} trading day(s), deadline ${escalationDueDateLabel()}. Auto-report to committee level and execution lead: ${escalationRecipients()}.`;
    el("rebalanceAlert").className = "rebalance-alert is-invalid";
  } else if (totalRebalanceCount) {
    const acceptedPlan = acceptedRebalancePlanSummary();
    el("rebalanceAlert").textContent = `Monthly rebalance alert: ${scopeRebalanceCount} sleeve/style segment(s) breached the relative corridor ${percent(limits.lower)} to ${percent(limits.upper)} during the formal monthly check. Choose a standard plan and complete it within ${limits.completionDays} trading day(s), by ${escalationDueDateLabel()}.`;
    if (!acceptedPlan) {
      el("rebalanceAlert").textContent = `Monthly rebalance alert: ${scopeRebalanceCount} sleeve/style segment(s) breached the relative corridor ${percent(limits.lower)} to ${percent(limits.upper)}. Select and accept a standard plan to start the ${limits.completionDays} trading day deadline.`;
    }
    el("rebalanceAlert").className = "rebalance-alert is-warning";
  } else if (observedScopeCount) {
    el("rebalanceAlert").textContent = `Daily holdings imported: ${observedScopeCount} sleeve/style drift item(s) observed, but the formal monthly corridor check has not triggered a trade process.`;
    el("rebalanceAlert").className = "rebalance-alert is-warning";
  } else {
    el("rebalanceAlert").textContent = `Rebalance alert: no sleeve/style segment breached the approved relative corridor ${percent(limits.lower)} to ${percent(limits.upper)}. No trade process is triggered.`;
    el("rebalanceAlert").className = "rebalance-alert is-valid";
  }
  updateRebalanceSchedulePanel({ totalRebalanceCount, actionPlanCount, escalationCount });
	  updateRebalanceDashboard({ totalRebalanceCount, actionPlanCount, escalationCount });
	  updateAcceptedRebalancePlanStatus();
	  renderEquityValuePanels();
	  renderTradeHoldingCompletion();
	  updateWorkflowOverview();
	}

function loadActualHoldings(file) {
  if (!file) return;
  if (!requirePermission("data", "load actual holdings")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const importText = String(reader.result || "");
    const parsed = parseActualHoldings(importText);
    if (parsed.length) {
      actualHoldings = parsed;
      mergeEquityValueHistory(parsed);
      logAudit("Actual holdings loaded", `${parsed.length} holding row(s) loaded`);
      renderActualHoldings();
      recordDataLoad("actual_holdings", file.name, importText, parsed, dataQuality.actualHoldings);
      updatePerformanceReport();
      syncImportToBackend("actual_holdings", file.name, importText);
    } else {
      const failedQuality = qualityResult("Fail", "Standard holdings CSV export did not contain valid rows.");
      actualHoldings = [];
      dataQuality.actualHoldings = failedQuality;
      logAudit("Actual holdings load failed", "Standard holdings CSV export did not contain valid rows");
      renderActualHoldings();
      renderEquityValuePanels();
      updatePerformanceReport();
      dataQuality.actualHoldings = failedQuality;
      applyQualityStatus("actualHoldingsStatus", dataQuality.actualHoldings);
      recordDataLoad("actual_holdings_failed", file.name, importText, [], failedQuality);
      syncImportToBackend("actual_holdings_failed", file.name, importText);
    }
  });
  reader.readAsText(file);
}

function loadTickerUniverse(file) {
  if (!file) return;
  if (!requirePermission("data", "load ticker universe")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const importText = String(reader.result || "");
    applyTickerUniverseText(importText, file.name);
  });
  reader.readAsText(file);
}

function applyTickerUniverseText(importText, fileName, options = {}) {
  const parsed = parseTickerUniverse(importText);
  if (parsed.length) {
    tickerUniverse = parsed;
    logAudit(options.auditAction || "Ticker universe loaded", `${parsed.length} ticker row(s) loaded from ${fileName}`);
    updateTickerUniverseStatus();
    if (priceHistory.length) calculateBetaEstimates();
    if (options.record !== false) recordDataLoad(options.type || "ticker_universe", fileName, importText, parsed, dataQuality.tickerUniverse);
    renderHoldings();
    updatePortfolio();
    if (options.sync !== false) syncImportToBackend(options.type || "ticker_universe", fileName, importText);
    return parsed;
  }

  const failedQuality = qualityResult("Fail", "Ticker universe CSV did not contain valid ticker rows.");
  dataQuality.tickerUniverse = failedQuality;
  logAudit("Ticker universe load failed", "CSV did not contain valid ticker rows");
  applyQualityStatus("tickerUniverseStatus", dataQuality.tickerUniverse);
  if (options.record !== false) recordDataLoad(`${options.type || "ticker_universe"}_failed`, fileName, importText, [], failedQuality);
  if (options.sync !== false) syncImportToBackend(`${options.type || "ticker_universe"}_failed`, fileName, importText);
  return [];
}

function loadMarketStatistics(file) {
  if (!file) return;
  if (!requirePermission("annualData", "load annual market statistics")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const importText = String(reader.result || "");
    applyMarketStatisticsText(importText, file.name);
  });
  reader.readAsText(file);
}

function applyMarketStatisticsText(importText, fileName, options = {}) {
  const parsed = parseMarketStatistics(importText);
  const scenarioCount = Object.keys(parsed).length;
  if (scenarioCount) {
    marketStatisticsRecommendations = parsed;
    const completeScenarioCount = Object.values(parsed).filter((recommendation) => {
      return ["equity", "bond", "alternative", "cash"].every((key) => recommendation.assets[key])
        && allocationRegionKeys.every((key) => recommendation.regions[key]);
    }).length;
    dataQuality.marketStats = completeScenarioCount === scenarioCount
      ? qualityResult("Pass", `Loaded complete external market statistics for ${scenarioCount} scenario(s).`)
      : qualityResult("Warning", `Loaded partial external market statistics for ${scenarioCount} scenario(s). Missing values will use manual fallback fields.`);
    dataQuality.publicData = fileName.startsWith("auto_") || options.publicDataSource === "cache"
      ? qualityResult("Pass", options.publicDataMessage || "Public data engine generated market statistics and loaded them into the workflow.")
      : qualityResult("Pass", "Market statistics CSV loaded manually.");
    logAudit(options.auditAction || "Market statistics loaded", `${scenarioCount} scenario recommendation set(s) loaded from ${fileName}`);
    if (options.record !== false) recordDataLoad(options.type || "market_statistics", fileName, importText, Object.values(parsed), dataQuality.marketStats);
    calculate();
    if (options.sync !== false) syncImportToBackend(options.type || "market_statistics", fileName, importText);
    return parsed;
  }

  const failedQuality = qualityResult("Fail", "Market statistics CSV did not contain valid bull/balanced/bear asset or region rows.");
  dataQuality.marketStats = failedQuality;
  dataQuality.publicData = qualityResult("Fail", "Public data load did not produce usable market statistics.");
  logAudit("Market statistics load failed", dataQuality.marketStats.message);
  if (options.record !== false) recordDataLoad(`${options.type || "market_statistics"}_failed`, fileName, importText, [], failedQuality);
  calculate();
  if (options.sync !== false) syncImportToBackend(`${options.type || "market_statistics"}_failed`, fileName, importText);
  return {};
}

function markMarketStatsFileSelected(file) {
  const status = el("allocationRecommendationStatus");
  if (!status) return;
  if (!file) {
    status.textContent = "Select a market statistics CSV, then upload it before preparing the allocation suggestion.";
    status.className = "validation-message";
    return;
  }
  status.textContent = `Selected ${file.name}. Click Upload Market Stats CSV to import it into the workflow.`;
  status.className = "validation-message is-warning";
}

function uploadSelectedMarketStatistics() {
  const file = el("marketStatsInput")?.files?.[0] || null;
  if (!file) {
    const status = el("allocationRecommendationStatus");
    if (status) {
      status.textContent = "No market statistics CSV selected. Choose a CSV file first, then upload it.";
      status.className = "validation-message is-invalid";
    }
    return;
  }
  loadMarketStatistics(file);
}

function reportRowsForSelectedPeriod() {
  if (!priceHistory.length) return [];
  const period = el("reportPeriod").value;
  const endDate = priceHistory[priceHistory.length - 1].date;
  let startDate = new Date(endDate);

  if (period === "daily") startDate.setDate(startDate.getDate() - 7);
  if (period === "weekly") startDate.setDate(startDate.getDate() - 14);
  if (period === "quarterly") startDate.setMonth(startDate.getMonth() - 3);
  if (period === "yearly") startDate.setFullYear(startDate.getFullYear() - 1);
  if (period === "custom") {
    const customStart = new Date(el("reportStartDate").value);
    const customEnd = new Date(el("reportEndDate").value);
    if (Number.isNaN(customStart.getTime()) || Number.isNaN(customEnd.getTime())) return [];
    return priceHistory.filter((row) => row.date >= customStart && row.date <= customEnd);
  }

  return priceHistory.filter((row) => row.date >= startDate && row.date <= endDate);
}

function reportHoldings() {
  if (actualHoldings.length) {
    return latestRowsByAsOfDate(actualHoldings).map((holding) => ({
      symbol: holding.ticker,
      weight: holding.weight,
      assetClass: holding.assetClass,
      region: holding.region,
    }));
  }
  return state.holdings.map((holding) => ({
    symbol: holding.symbol,
    weight: holding.weight,
    assetClass: holding.assetClass,
    region: holding.region,
  }));
}

function clearReport(message = "Load historical price CSV and select a valid reporting period.") {
  [
    "reportNavLatest",
    "reportNavApprovedStatus",
    "reportNavChangeStatus",
    "reportReturn",
    "reportTargetReturn",
    "reportReturnStatus",
    "reportBenchmarkReturn",
    "reportActiveReturn",
    "reportVisibleMaxDrawdown",
    "reportBeta",
    "reportTargetBeta",
    "reportBetaStatus",
    "reportMaxDrawdown",
    "reportDrawdownStatus",
  ].forEach((id) => {
    el(id).textContent = "No data";
    el(id).className = "";
  });
  el("reportHeaderPeriod").textContent = "No data";
  el("reportHeaderAsOf").textContent = "No data";
  el("reportHeaderStatus").textContent = "Draft";
  el("reportReturnMethod").textContent = "No data";
  el("reportValuationBasis").textContent = "No data";
  el("reportBenchmarkBasis").textContent = "No data";
  el("reportDataQualityStatement").textContent = `Report unavailable: ${message}`;
  clearAnnualAttribution();
  renderReportSleeveRiskMetrics([]);
  renderAssetContributionPie();
  renderEquityValuePanels();
  el("reportDrawdownAlert").textContent = `Report drawdown alert: ${message}`;
  el("reportDrawdownAlert").className = "drawdown-risk-alert";
  updateReportDistributionSummary();
}

function clearAnnualAttribution() {
  [
    "attributionPrimaryDriver",
    "attributionVerdict",
    "attributionBenchmarkReturn",
    "committeeTimingContribution",
    "committeeAttributionShare",
    "managerSelectionContribution",
    "executionAttributionShare",
    "betaImplementationContribution",
    "annualReviewReadiness",
    "annualReviewCommitteeConclusion",
    "annualReviewExecutionConclusion",
    "annualReviewNextAction",
  ].forEach((id) => {
    el(id).textContent = "No data";
    el(id).className = "";
  });
  const rows = el("attributionRows");
  if (!rows) return;
  rows.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.textContent = "Load report-period return data to show performance attribution.";
  row.append(cell);
  rows.append(row);
}

function attributionDriverLabel(allocationContribution, selectionContribution, betaGapContribution) {
  const values = [
    { label: "Allocation attribution", value: allocationContribution },
    { label: "Selection attribution", value: selectionContribution },
    { label: "Beta / execution deviation", value: betaGapContribution },
  ].filter((item) => Number.isFinite(item.value));
  if (!values.length) return "No data";
  values.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return values[0].label;
}

function attributionVerdictLabel(reportReturn, targetReturn, activeReturn, primaryDriver) {
  if (!Number.isFinite(reportReturn) || !Number.isFinite(targetReturn)) return "No data";
  const targetStatus = reportReturn >= targetReturn ? "Target met" : "Below target";
  const activeStatus = Number.isFinite(activeReturn)
    ? (activeReturn >= 0 ? "outperformed policy benchmark" : "underperformed policy benchmark")
    : "policy benchmark comparison unavailable";
  return `${targetStatus}; ${activeStatus}; main driver: ${primaryDriver}.`;
}

function signedClassName(value) {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "is-close" : "is-off";
}

function setAnnualReviewValue(id, text, className = "") {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
  node.className = className;
}

function updateAnnualReviewControl({
  allocationContribution,
  selectionContribution,
  betaImplementationContribution,
  activeReturn,
  dayCount,
  verdict,
}) {
  const isAnnualLike = isAnnualAttributionPeriod(dayCount);
  setAnnualReviewValue(
    "annualReviewReadiness",
    isAnnualLike ? "Annual review ready" : "Period attribution only; data period is shorter than one year",
    isAnnualLike ? "is-close" : "is-warning",
  );
  setAnnualReviewValue(
    "annualReviewCommitteeConclusion",
    `Allocation attribution ${percentOrNoData(allocationContribution)}.`,
    signedClassName(allocationContribution),
  );
  setAnnualReviewValue(
    "annualReviewExecutionConclusion",
    `Selection ${percentOrNoData(selectionContribution)}; beta / execution deviation ${percentOrNoData(betaImplementationContribution)}.`,
    Number(selectionContribution || 0) + Number(betaImplementationContribution || 0) >= 0 ? "is-close" : "is-off",
  );

  if (Number.isFinite(activeReturn) && activeReturn < 0) {
    setAnnualReviewValue("annualReviewNextAction", "Review security selection and implementation discipline versus the policy benchmark.", "is-warning");
  } else {
    setAnnualReviewValue("annualReviewNextAction", verdict || "Review allocation and selection results together.", Number.isFinite(activeReturn) ? "is-close" : "is-warning");
  }
}

function renderAttributionRow(label, contribution, owner, interpretation) {
  const row = document.createElement("tr");
  [label, percentOrNoData(contribution), owner, interpretation].forEach((value, index) => {
    const cell = document.createElement(index === 1 ? "th" : "td");
    cell.textContent = value;
    if (index === 1) cell.className = signedClassName(contribution);
    row.append(cell);
  });
  return row;
}

function updateAnnualAttribution(reportReturn, reportBeta, benchmarkReturn, targetReturn, dayCount) {
  const rows = el("attributionRows");
  if (!rows) return;
  if (reportReturn === null || benchmarkReturn === null || targetReturn === null) {
    clearAnnualAttribution();
    return;
  }

  const allocationContribution = benchmarkReturn - targetReturn;
  const activeReturn = reportReturn - benchmarkReturn;
  const betaImplementationContribution = reportBeta !== null && currentTargetBeta !== null
    ? benchmarkReturn * (reportBeta - currentTargetBeta)
    : null;
  const selectionContribution = betaImplementationContribution === null
    ? activeReturn
    : activeReturn - betaImplementationContribution;
  const primaryDriver = attributionDriverLabel(allocationContribution, selectionContribution, betaImplementationContribution);
  const verdict = attributionVerdictLabel(reportReturn, targetReturn, activeReturn, primaryDriver);
  const attributionBasis = isAnnualAttributionPeriod(dayCount)
    ? "Annual attribution"
    : `Period attribution (${Math.max(1, Number(dayCount || 0))} days)`;

  el("attributionPrimaryDriver").textContent = attributionBasis;
  el("attributionVerdict").textContent = verdict;
  el("committeeTimingContribution").textContent = percent(targetReturn);
  el("committeeAttributionShare").textContent = percent(benchmarkReturn);
  el("managerSelectionContribution").textContent = percent(activeReturn);
  el("executionAttributionShare").textContent = percent(allocationContribution);
  el("attributionBenchmarkReturn").textContent = percent(selectionContribution);
  el("betaImplementationContribution").textContent = betaImplementationContribution === null ? "No data" : percent(betaImplementationContribution);
  el("committeeTimingContribution").className = targetReturn >= 0 ? "is-close" : "is-warning";
  el("committeeAttributionShare").className = signedClassName(benchmarkReturn);
  el("managerSelectionContribution").className = signedClassName(activeReturn);
  el("executionAttributionShare").className = signedClassName(allocationContribution);
  el("attributionBenchmarkReturn").className = signedClassName(selectionContribution);
  el("betaImplementationContribution").className = signedClassName(betaImplementationContribution);
  el("attributionVerdict").className = reportReturn >= targetReturn ? "is-close" : "is-warning";
  updateAnnualReviewControl({
    allocationContribution,
    selectionContribution,
    betaImplementationContribution,
    activeReturn,
    dayCount,
    verdict,
  });

  rows.replaceChildren();
  rows.append(
    renderAttributionRow(
      "Allocation attribution",
      allocationContribution,
      "Decision Committee focus",
      "Policy benchmark return minus target-period return; explains whether approved allocation helped or hurt versus the target path.",
    ),
    renderAttributionRow(
      "Selection attribution",
      selectionContribution,
      "Execution Team focus",
      "Actual portfolio return versus policy benchmark after isolating beta / execution deviation.",
    ),
    renderAttributionRow(
      "Beta / execution deviation",
      betaImplementationContribution,
      "Execution Team focus",
      "Return effect from actual beta differing from approved target beta; shown as No data when beta is unavailable.",
    ),
    renderAttributionRow(
      "Active return versus policy",
      activeReturn,
      "Performance bridge",
      "Actual portfolio return minus policy benchmark return.",
    ),
  );
}

function reportDateRangeLabel() {
  const priceRows = reportRowsForSelectedPeriod();
  const rows = priceRows.length ? priceRows : reportNavRowsForPeriod();
  if (!rows.length) return "No data";
  const dateLabel = (value) => value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value || "").slice(0, 10);
  const start = dateLabel(rows[0].date);
  const end = dateLabel(rows[rows.length - 1].date);
  if (!start || !end) return "No data";
  return `${start} to ${end}`;
}

function cashFlowsForReportPeriod(rows) {
  if (rows.length < 2) return [];
  const start = rows[0].date;
  const end = rows[rows.length - 1].date;
  return cashFlows.filter((flow) => {
    const date = new Date(flow.cashFlowDate);
    return !Number.isNaN(date.getTime()) && date >= start && date <= end;
  });
}

function modifiedDietzReturn(beginningValue, endingValue, flows, startDate, endDate) {
  const days = Math.max(1, (endDate - startDate) / (24 * 60 * 60 * 1000));
  const netFlow = flows.reduce((sum, flow) => sum + Number(flow.amount || 0), 0);
  const weightedFlow = flows.reduce((sum, flow) => {
    const flowDate = new Date(flow.cashFlowDate);
    if (Number.isNaN(flowDate.getTime())) return sum;
    const remainingDays = Math.max(0, (endDate - flowDate) / (24 * 60 * 60 * 1000));
    return sum + Number(flow.amount || 0) * (remainingDays / days);
  }, 0);
  const denominator = beginningValue + weightedFlow;
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return ((endingValue - beginningValue - netFlow) / denominator) * 100;
}

function cashFlowAdjustedReturn(priceReturn, rows) {
  if (priceReturn === null || rows.length < 2) return { value: priceReturn, flows: [], estimatedEnding: false };
  const flows = cashFlowsForReportPeriod(rows);
  const beginningValue = readNumber(el("reportBeginningValue"));
  const manualEndingValue = readNumber(el("reportEndingValue"));
  if (beginningValue <= 0) return { value: priceReturn, flows, estimatedEnding: false };

  const netFlow = flows.reduce((sum, flow) => sum + Number(flow.amount || 0), 0);
  const estimatedEndingValue = beginningValue * (1 + priceReturn / 100) + netFlow;
  const endingValue = manualEndingValue > 0 ? manualEndingValue : estimatedEndingValue;
  return {
    value: modifiedDietzReturn(beginningValue, endingValue, flows, rows[0].date, rows[rows.length - 1].date),
    flows,
    estimatedEnding: manualEndingValue <= 0,
  };
}

function renderCashFlows() {
  const body = el("cashFlowRows");
  body.replaceChildren();

  cashFlows.forEach((flow) => {
    const row = document.createElement("tr");
    [
      flow.cashFlowDate || "-",
      flow.account || "-",
      flow.type || "-",
      flow.currency || "-",
      currency.format(flow.amount),
      flow.note || "-",
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });

  dataQuality.cashFlows = validateCashFlowsQuality(cashFlows);
  applyQualityStatus("cashFlowStatus", dataQuality.cashFlows);
}

function loadCashFlows(file) {
  if (!file) return;
  if (!requirePermission("data", "load cash flows")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const importText = String(reader.result || "");
    try {
      cashFlows = parseCashFlows(importText);
      logAudit("Cash flows loaded", `${cashFlows.length} cash flow row(s) loaded`);
      renderCashFlows();
      recordDataLoad("cash_flows", file.name, importText, cashFlows, dataQuality.cashFlows);
      updatePerformanceReport();
      syncImportToBackend("cash_flows", file.name, importText);
    } catch (error) {
      const failedQuality = qualityResult("Fail", "Standard cash flow CSV export could not be parsed.");
      cashFlows = [];
      dataQuality.cashFlows = failedQuality;
      logAudit("Cash flows load failed", "Standard cash flow CSV export could not be parsed");
      renderCashFlows();
      dataQuality.cashFlows = failedQuality;
      applyQualityStatus("cashFlowStatus", dataQuality.cashFlows);
      recordDataLoad("cash_flows_failed", file.name, importText, [], failedQuality);
      updatePerformanceReport();
      syncImportToBackend("cash_flows_failed", file.name, importText);
    }
  });
  reader.readAsText(file);
}

function normalizeNonEquityNav(input = {}) {
  return {
    ...structuredClone(defaults.nonEquityNav),
    ...input,
    bond: Math.max(0, Number(input.bond || 0)),
    alternative: Math.max(0, Number(input.alternative || 0)),
    cash: Math.max(0, Number(input.cash || 0)),
    status: input.status || "Draft",
  };
}

function currentNonEquityNav() {
  state.nonEquityNav = normalizeNonEquityNav(state.nonEquityNav);
  return state.nonEquityNav;
}

function nonEquityNavTotal(nav = currentNonEquityNav()) {
  return Number(nav.bond || 0) + Number(nav.alternative || 0) + Number(nav.cash || 0);
}

function approvedNonEquityNav() {
  const nav = currentNonEquityNav();
  return nav.status === "Approved" ? nav : null;
}

function approvedNonEquityNavTotal() {
  const nav = approvedNonEquityNav();
  return nav ? nonEquityNavTotal(nav) : 0;
}

function readNonEquityNavInputs() {
  return normalizeNonEquityNav({
    ...currentNonEquityNav(),
    asOfDate: el("nonEquityNavAsOfDate")?.value || "",
    bond: readNumber(el("nonEquityBondNav")),
    alternative: readNumber(el("nonEquityAlternativeNav")),
    cash: readNumber(el("nonEquityCashNav")),
  });
}

function renderNonEquityNavReview() {
  const nav = currentNonEquityNav();
  if (el("nonEquityNavAsOfDate")) el("nonEquityNavAsOfDate").value = nav.asOfDate || "";
  if (el("nonEquityBondNav")) el("nonEquityBondNav").value = Number(nav.bond || 0).toFixed(0);
  if (el("nonEquityAlternativeNav")) el("nonEquityAlternativeNav").value = Number(nav.alternative || 0).toFixed(0);
  if (el("nonEquityCashNav")) el("nonEquityCashNav").value = Number(nav.cash || 0).toFixed(0);

  const status = el("nonEquityNavStatus");
  if (!status) return;
  const total = nonEquityNavTotal(nav);
  if (nav.status === "Approved") {
    status.textContent = `Non-equity NAV: approved ${currency.format(total)}${nav.asOfDate ? ` as of ${nav.asOfDate}` : ""} by ${nav.approvedBy || "Decision Committee"}.`;
    status.className = "approval-decision is-valid";
  } else if (nav.status === "Submitted") {
    status.textContent = `Non-equity NAV: submitted for Decision Committee review. Submitted value ${currency.format(total)}${nav.asOfDate ? ` as of ${nav.asOfDate}` : ""}.`;
    status.className = "approval-decision is-warning";
  } else if (nav.status === "Rejected") {
    status.textContent = `Non-equity NAV: rejected by ${nav.rejectedBy || "Decision Committee"}. Revise and resubmit before it can enter the report.`;
    status.className = "approval-decision is-invalid";
  } else {
    status.textContent = `Non-equity NAV: draft ${currency.format(total)}. Submit it before formal report generation.`;
    status.className = "approval-decision";
  }
}

function updateNonEquityNavDraftFromInputs() {
  if (!actorCan("execution")) {
    denyPermission("execution", "change non-equity NAV inputs");
    renderNonEquityNavReview();
    return;
  }
  const previousStatus = currentNonEquityNav().status;
  state.nonEquityNav = {
    ...readNonEquityNavInputs(),
    status: previousStatus === "Approved" ? "Draft" : previousStatus,
    approvedBy: previousStatus === "Approved" ? "" : currentNonEquityNav().approvedBy,
    approvedAt: previousStatus === "Approved" ? "" : currentNonEquityNav().approvedAt,
  };
  if (previousStatus === "Approved") {
    logAudit("Non-equity NAV revised", "Approved non-equity NAV was revised and returned to draft status");
  }
  renderNonEquityNavReview();
  updatePerformanceReport();
}

async function submitNonEquityNavReview() {
  if (!requirePermission("execution", "submit non-equity NAV review")) return;
  const nav = readNonEquityNavInputs();
  const total = nonEquityNavTotal(nav);
  if (total <= 0) {
    el("nonEquityNavStatus").textContent = "Non-equity NAV: enter at least one positive NAV value before submission.";
    el("nonEquityNavStatus").className = "approval-decision is-invalid";
    return;
  }
  const submittedNav = {
    ...nav,
    status: "Submitted",
    submittedBy: currentAuditActor(),
    submittedAt: new Date().toISOString(),
    approvedBy: "",
    approvedAt: "",
    rejectedBy: "",
    rejectedAt: "",
  };
  if (backendSyncAvailable()) {
    try {
      await ensureBackendSessionForRole("execution", {
        loadApprovedTarget: false,
        loadApprovedPortfolio: false,
        loadApprovedNonEquityNav: false,
        loadTradeAuthorizations: false,
        loadRuntimeImports: false,
      });
      const result = await backendRequest("/api/non-equity-nav", {
        method: "POST",
        body: JSON.stringify(submittedNav),
      });
      backendState.nonEquityNavPackageId = result.navPackage.id;
      backendState.nonEquityNavStatus = result.navPackage.status;
    } catch (error) {
      el("nonEquityNavStatus").textContent = `Non-equity NAV: backend submission failed. ${error.message}`;
      el("nonEquityNavStatus").className = "approval-decision is-invalid";
      return;
    }
  }
  state.nonEquityNav = submittedNav;
  logAudit("Non-equity NAV submitted", `${currency.format(total)} submitted for Decision Committee review`);
  renderNonEquityNavReview();
  updatePerformanceReport();
}

async function approveNonEquityNavReview() {
  if (!requirePermission("decision", "approve non-equity NAV")) return;
  const nav = currentNonEquityNav();
  const total = nonEquityNavTotal(nav);
  if (total <= 0 || !["Submitted", "Draft"].includes(nav.status)) {
    el("nonEquityNavStatus").textContent = "Non-equity NAV: approval blocked until a positive NAV value is submitted.";
    el("nonEquityNavStatus").className = "approval-decision is-invalid";
    return;
  }
  const approvedNav = {
    ...nav,
    status: "Approved",
    approvedBy: currentAuditActor(),
    approvedAt: new Date().toISOString(),
    rejectedBy: "",
    rejectedAt: "",
  };
  if (backendSyncAvailable()) {
    try {
      await ensureBackendSessionForRole("decision", {
        loadApprovedTarget: false,
        loadApprovedPortfolio: false,
        loadApprovedNonEquityNav: false,
        loadTradeAuthorizations: false,
        loadRuntimeImports: false,
      });
      if (!backendState.nonEquityNavPackageId) throw new Error("no submitted non-equity NAV package is available");
      const result = await backendRequest("/api/non-equity-nav/approve", {
        method: "POST",
        body: JSON.stringify({ packageId: backendState.nonEquityNavPackageId, decision: "Approve" }),
      });
      applyApprovedNonEquityNavPackage(result.navPackage);
    } catch (error) {
      el("nonEquityNavStatus").textContent = `Non-equity NAV: backend approval failed. ${error.message}`;
      el("nonEquityNavStatus").className = "approval-decision is-invalid";
      return;
    }
  } else {
    state.nonEquityNav = approvedNav;
  }
  logAudit("Non-equity NAV approved", `${currency.format(total)} approved by ${currentAuditActor()}`);
  renderNonEquityNavReview();
  updatePerformanceReport();
}

function rejectNonEquityNavReview() {
  if (!requirePermission("decision", "reject non-equity NAV")) return;
  const nav = currentNonEquityNav();
  state.nonEquityNav = {
    ...nav,
    status: "Rejected",
    rejectedBy: currentAuditActor(),
    rejectedAt: new Date().toISOString(),
    approvedBy: "",
    approvedAt: "",
  };
  logAudit("Non-equity NAV rejected", `Non-equity NAV rejected by ${currentAuditActor()}`);
  renderNonEquityNavReview();
  updatePerformanceReport();
}

function returnsFromValueRows(rows) {
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = Number(rows[index - 1].value || 0);
    const current = Number(rows[index].value || 0);
    if (previous > 0 && current > 0) returns.push(current / previous - 1);
  }
  return returns;
}

function reportPeriodNavReturn(rows = reportNavRowsForPeriod()) {
  const beginningValue = reportInitialPrincipal();
  if (beginningValue > 0 && rows.length) {
    const latest = Number(rows[rows.length - 1].value || 0);
    if (latest <= 0) return null;
    return (latest / beginningValue - 1) * 100;
  }
  return null;
}

function reportPeriodDayCount(priceRows = reportRowsForSelectedPeriod(), navRows = reportNavRowsForPeriod()) {
  const datedRows = priceRows.length >= 2
    ? priceRows.map((row) => row.date)
    : navRows.map((row) => new Date(row.date));
  const validDates = datedRows.filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
  if (validDates.length >= 2) {
    const start = validDates[0];
    const end = validDates[validDates.length - 1];
    return Math.max(1, Math.round((end - start) / 86400000));
  }
  const period = el("reportPeriod")?.value || defaults.reportPeriod;
  if (period === "daily") return 7;
  if (period === "weekly") return 14;
  if (period === "quarterly") return 91;
  if (period === "yearly") return 365;
  return 1;
}

function targetReturnForReportPeriod(annualTarget, dayCount) {
  if (!Number.isFinite(Number(annualTarget)) || !Number.isFinite(Number(dayCount)) || dayCount <= 0) return null;
  return ((1 + Number(annualTarget) / 100) ** (Number(dayCount) / 365) - 1) * 100;
}

function isAnnualAttributionPeriod(dayCount) {
  const period = el("reportPeriod")?.value || defaults.reportPeriod;
  return (period === "yearly" || period === "custom") && Number(dayCount) >= 300;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function annualizedVolatilityFromReturns(returns, frequency) {
  const deviation = standardDeviation(returns);
  return deviation === null ? null : deviation * Math.sqrt(periodsPerYear(frequency)) * 100;
}

function annualizedDownsideDeviationFromReturns(returns, frequency, minimumAnnualReturn = 0) {
  if (returns.length < 2) return null;
  const minimumPeriodReturn = (minimumAnnualReturn / 100) / periodsPerYear(frequency);
  const downside = returns.map((periodReturn) => Math.min(0, periodReturn - minimumPeriodReturn));
  const downsideVariance = downside.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, returns.length - 1);
  const downsideDeviation = Math.sqrt(downsideVariance);
  return downsideDeviation > 0 ? downsideDeviation * Math.sqrt(periodsPerYear(frequency)) * 100 : null;
}

function metricNumber(value, decimals = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : "No data";
}

function riskAdjustedRatio(annualizedReturn, riskFreeRate, denominator) {
  if (!Number.isFinite(Number(annualizedReturn)) || !Number.isFinite(Number(riskFreeRate)) || !Number.isFinite(Number(denominator)) || denominator <= 0) {
    return null;
  }
  return (Number(annualizedReturn) - Number(riskFreeRate)) / Number(denominator);
}

function reportSleeveRiskMetrics(rows = reportRowsForSelectedPeriod()) {
  const holdings = reportHoldings();
  const weights = holdings.map((holding) => Number(holding.weight || 0));
  return equitySleeveDefinitions().map((definition) => {
    const pairs = equitySleeveReturnPairsForWeights(rows, definition, weights, holdings);
    const returns = pairs.map((pair) => pair.asset);
    const frequency = "daily";
    const annualizedReturn = annualizedReturnFromReturns(returns, frequency);
    const volatility = annualizedVolatilityFromReturns(returns, frequency);
    const downsideDeviation = annualizedDownsideDeviationFromReturns(returns, frequency, 0);
    const riskFreeRate = sleeveRiskFreeRate(definition.key);
    return {
      definition,
      annualizedReturn,
      volatility,
      sharpe: riskAdjustedRatio(annualizedReturn, riskFreeRate, volatility),
      sortino: riskAdjustedRatio(annualizedReturn, riskFreeRate, downsideDeviation),
    };
  });
}

function renderReportSleeveRiskMetrics(rows = reportRowsForSelectedPeriod()) {
  const body = el("reportSleeveRiskRows");
  if (!body) return;
  body.replaceChildren();
  const metrics = reportSleeveRiskMetrics(rows);
  if (!rows.length || metrics.every((item) => item.annualizedReturn === null)) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "Load historical prices and proposed/actual equity holdings to show sleeve metrics.";
    row.append(cell);
    body.append(row);
    return;
  }
  metrics.forEach((item) => {
    const row = document.createElement("tr");
    [
      item.definition.label,
      item.annualizedReturn === null ? "No data" : percent(item.annualizedReturn),
      metricNumber(item.sharpe),
      metricNumber(item.sortino),
      item.volatility === null ? "No data" : percent(item.volatility),
    ].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function reportFormalReadiness() {
  const blockers = [];
  const latestActualEquityRows = latestRowsByAsOfDate(actualHoldings).filter(isEquityActualHolding);
  const actualHoldingsReady = actualHoldings.length > 0
    && latestActualEquityRows.length > 0
    && dataQuality.actualHoldings?.status !== "Fail";
  const nonEquityApproved = Boolean(approvedNonEquityNav());
  const backendPortfolioApproved = backendState.portfolioStatus === "Approved" || state.portfolioVersion.status === "Committee Approved";

  if (reportInitialPrincipal() <= 0) blockers.push("initial principal");
  if (!currentTargetReturnApproved) blockers.push("approved target return");
  if (!backendPortfolioApproved) blockers.push("approved implementation portfolio");
  if (!actualHoldingsReady) blockers.push("latest actual equity holdings");
  if (!nonEquityApproved) blockers.push("approved non-equity NAV");

  return {
    ready: blockers.length === 0,
    blockers,
    message: blockers.length ? `Missing: ${blockers.join(", ")}.` : "Ready for formal issue.",
  };
}

function applyFormalReportReadinessControls(readiness = reportFormalReadiness()) {
  document.body.dataset.reportReady = readiness.ready ? "ready" : "blocked";
  const status = el("formalReportReadinessStatus");
  if (status) {
    status.textContent = readiness.ready
      ? "Formal report status: ready for formal issue."
      : `Formal report status: pending approval. ${readiness.message} Detailed report metrics are hidden until the formal report is ready.`;
    status.className = readiness.ready ? "approval-decision is-valid" : "approval-decision is-invalid";
  }

  ["exportReportButton", "exportCommitteePackButton"].forEach((id) => {
    const button = el(id);
    if (!button) return;
    button.disabled = !readiness.ready;
    button.title = readiness.ready ? "" : readiness.message;
  });

  const distributionStatus = el("reportDistributionStatus");
  if (distributionStatus) {
    const sentOption = Array.from(distributionStatus.options).find((option) => option.value === "Sent to Committee");
    if (sentOption) sentOption.disabled = !readiness.ready;
    if (!readiness.ready && distributionStatus.value === "Sent to Committee") {
      distributionStatus.value = "Draft";
      state.reportDistributionStatus = "Draft";
    }
  }
  return readiness;
}

function updateReportDistributionSummary() {
  const readiness = applyFormalReportReadinessControls();
  const status = el("reportDistributionStatus").value;
  const date = el("reportDistributionDate").value;
  const recipient = el("reportRecipientGroup").value.trim() || "Decision Committee";
  const summary = el("reportDistributionSummary");

  if (!readiness.ready) {
    summary.textContent = `Formal report cannot be issued yet. ${readiness.message}`;
    summary.className = "approval-decision is-invalid";
    updateWorkflowOverview();
    return;
  }

  if (status === "Sent to Committee") {
    summary.textContent = `Report distribution: sent to ${recipient}${date ? ` on ${date}` : ""}.`;
    summary.className = "approval-decision is-valid";
    updateWorkflowOverview();
    return;
  }

  summary.textContent = `Report distribution: draft for ${recipient}. Download the report or mark it as sent when ready.`;
  summary.className = "approval-decision";
  updateWorkflowOverview();
}

function restoreReportDistributionInputs() {
  el("reportDistributionStatus").value = state.reportDistributionStatus;
  el("reportDistributionDate").value = state.reportDistributionDate;
  el("reportRecipientGroup").value = state.reportRecipientGroup;
}

function reportDistributionPayload() {
  return {
    portfolioId: backendState.portfolioId || backendState.approvedPortfolioPackage?.id || "",
    targetPackageId: backendState.targetPackageId || backendState.approvedTargetPackage?.id || "",
    status: el("reportDistributionStatus").value,
    distributionDate: el("reportDistributionDate").value,
    recipientGroup: el("reportRecipientGroup").value.trim() || "Decision Committee",
    reportPeriod: el("reportPeriod")?.value || "",
  };
}

function applyReportDistributionRecord(record) {
  if (!record || record.status !== "Sent to Committee") return false;
  const activePortfolioId = String(backendState.portfolioId || backendState.approvedPortfolioPackage?.id || "");
  if (activePortfolioId && record.portfolioId && record.portfolioId !== activePortfolioId) return false;
  state.reportDistributionStatus = "Sent to Committee";
  state.reportDistributionDate = record.distributionDate || String(record.distributedAt || "").slice(0, 10);
  state.reportRecipientGroup = record.recipientGroup || "Decision Committee";
  backendState.reportDistributionId = record.id || "";
  backendState.latestReportDistribution = record;
  restoreReportDistributionInputs();
  updateReportDistributionSummary();
  updateReportRoleControls();
  return true;
}

async function loadLatestReportDistributionFromBackend() {
  if (!backendSyncAvailable() || !backendState.sessionId) return null;
  try {
    const portfolioId = backendState.portfolioId || backendState.approvedPortfolioPackage?.id || "";
    const query = portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : "";
    const result = await backendRequest(`/api/report-distributions/latest${query}`);
    if (applyReportDistributionRecord(result.reportDistribution)) {
      logAudit("Backend report distribution loaded", `Loaded report distribution ${result.reportDistribution.id}`);
    }
    return result.reportDistribution || null;
  } catch (error) {
    updateBackendWorkflowStatus(`report distribution lookup failed. ${error.message}`, false);
    return null;
  }
}

function queueReportDistributionSync(payload) {
  if (!backendSyncAvailable()) return Promise.resolve(null);
  reportDistributionSyncQueue = reportDistributionSyncQueue
    .catch(() => null)
    .then(async () => {
      const connected = await ensureBackendSessionForRole("execution", {
        loadApprovedTarget: false,
        loadApprovedPortfolio: false,
        loadApprovedNonEquityNav: false,
        loadTradeAuthorizations: false,
        loadRuntimeImports: false,
        loadReportDistribution: false,
      });
      if (!connected) return null;
      const result = await backendRequest("/api/report-distributions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      applyReportDistributionRecord(result.reportDistribution);
      updateBackendWorkflowStatus("formal report distribution saved for Decision Committee review.", true);
      return result.reportDistribution;
    })
    .catch((error) => {
      updateBackendWorkflowStatus(`report distribution sync failed. ${error.message}`, false);
      return null;
    });
  return reportDistributionSyncQueue;
}

async function updateReportDistributionFromInputs() {
  if (!requirePermission("execution", "distribute formal report")) {
    restoreReportDistributionInputs();
    updateReportDistributionSummary();
    return;
  }
  const previous = {
    status: state.reportDistributionStatus,
    date: state.reportDistributionDate,
    recipient: state.reportRecipientGroup,
  };
  const requestedStatus = el("reportDistributionStatus").value;
  if (previous.status === "Sent to Committee") {
    restoreReportDistributionInputs();
    el("reportDistributionSummary").textContent = "Report distribution is recorded and read-only. Start a new reporting cycle for a new distribution.";
    el("reportDistributionSummary").className = "approval-decision is-valid";
    return;
  }
  const readiness = reportFormalReadiness();
  if (!readiness.ready && requestedStatus === "Sent to Committee") {
    el("reportDistributionStatus").value = "Draft";
  }
  if (el("reportDistributionStatus").value !== "Sent to Committee") {
    state.reportDistributionStatus = "Draft";
    state.reportDistributionDate = el("reportDistributionDate").value;
    state.reportRecipientGroup = el("reportRecipientGroup").value;
    updateReportDistributionSummary();
    return;
  }
  const payload = reportDistributionPayload();
  el("reportDistributionSummary").textContent = "Saving formal report distribution for Decision Committee review...";
  el("reportDistributionSummary").className = "approval-decision is-warning";
  const record = await queueReportDistributionSync(payload);
  if (record) return;
  state.reportDistributionStatus = previous.status;
  state.reportDistributionDate = previous.date;
  state.reportRecipientGroup = previous.recipient;
  restoreReportDistributionInputs();
  updateReportDistributionSummary();
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function htmlCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlRows(rows) {
  return rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlCell(cell)}</td>`).join("")}</tr>`).join("");
}

function summaryRowsForCommitteePack() {
  const rows = [
    ["Final target return", el("targetRateLarge").textContent],
    ["Target approval", el("targetApprovalDecision").textContent],
    ["Public data status", el("overviewPublicDataStatus").textContent],
    ["U.S. equity target beta", el("usEquityTargetBeta").textContent],
    ["U.S. equity sleeve beta", el("usEquitySleeveBeta").textContent],
    ["Backtest beta status", el("backtestBetaStatus").textContent],
    ["Backtest drawdown status", el("backtestDrawdownStatus").textContent],
    ["Optimization result", el("optimizerStatus").textContent],
    ["Selected optimization option", el("optimizerSelectionStatus").textContent],
    ["Implementation approval", el("approvalDecision").textContent],
    ["Rebalance status", el("rebalanceEscalationStatus").textContent],
    ["Initial principal", reportInitialPrincipal() > 0 ? currency.format(reportInitialPrincipal()) : "Required / not entered"],
    ["Report period", el("reportHeaderPeriod").textContent],
    ["Valuation date", el("reportHeaderAsOf").textContent],
    ["Base currency", el("reportHeaderCurrency").textContent],
    ["Reported return", el("reportReturn").textContent],
    ["Policy benchmark return", el("reportBenchmarkReturn").textContent],
    ["Active return", el("reportActiveReturn").textContent],
    ["Maximum drawdown", el("reportVisibleMaxDrawdown").textContent],
    ["Report return status", el("reportReturnStatus").textContent],
    ["Return method", el("reportReturnMethod").textContent],
    ["Valuation basis", el("reportValuationBasis").textContent],
    ["Benchmark basis", el("reportBenchmarkBasis").textContent],
    ["Data quality statement", el("reportDataQualityStatement").textContent],
    ["Management attribution conclusion", el("attributionVerdict").textContent],
  ];
  return rows;
}

function holdingsRowsForCommitteePack() {
  return state.holdings.map((holding) => [
    holding.region,
    holding.assetClass,
    holding.styleFactor,
    holding.symbol,
    percent(Number(holding.weight || 0)),
    Number(holding.beta || 0).toFixed(2),
    holding.lockedWeight ? "Locked" : "Open",
  ]);
}

function dataLoadRowsForCommitteePack() {
  return dataLoadRecords.slice(0, 10).map((record) => [
    record.batchId,
    record.label,
    record.fileName,
    record.dataDate || "-",
    record.rows,
    `${record.status}: ${record.message}`,
  ]);
}

function rebalanceFollowUpRowsForCommitteePack() {
  return rebalanceFollowUps.slice(0, 10).map((record) => [
    new Date(record.time).toLocaleString(),
    record.status,
    record.openAlerts,
    record.owner,
    record.note || "-",
    record.actor,
  ]);
}

function committeePackSection(title, headers, rows) {
  const bodyRows = rows.length ? rows : [["No data"]];
  const headerHtml = headers.length
    ? `<thead><tr>${headers.map((header) => `<th>${htmlCell(header)}</th>`).join("")}</tr></thead>`
    : "";
  const colspan = headers.length || bodyRows[0].length;
  const rowHtml = rows.length
    ? htmlRows(bodyRows)
    : `<tr><td colspan="${colspan}">No data available.</td></tr>`;
  return `<section><h2>${htmlCell(title)}</h2><table>${headerHtml}<tbody>${rowHtml}</tbody></table></section>`;
}

function plainReportCell(value) {
  const text = String(value ?? "-").replace(/\s+/g, " ").trim();
  return text || "-";
}

function committeePackRows() {
  return [
    {
      title: "Executive Control Summary",
      headers: ["Item", "Status / Value"],
      rows: summaryRowsForCommitteePack(),
    },
    {
      title: "Proposed Holdings",
      headers: ["Region", "Asset Class", "Style", "Ticker", "Weight", "Beta", "Lock"],
      rows: holdingsRowsForCommitteePack(),
    },
    {
      title: "Data Load Traceability",
      headers: ["Batch", "Data set", "Source", "Data date", "Rows", "Validation"],
      rows: dataLoadRowsForCommitteePack(),
    },
    {
      title: "Data Load Errors and Suggested Fixes",
      headers: ["Batch", "Data set", "Row", "Field", "Issue", "Suggested fix"],
      rows: dataLoadErrors.slice(0, 20).map((issue) => [
        issue.batchId,
        issue.label,
        issue.row,
        issue.field,
        issue.issue,
        issue.suggestion,
      ]),
    },
    {
      title: "Rebalance Follow-up",
      headers: ["Time", "Status", "Open alerts", "Owner", "Note", "Actor"],
      rows: rebalanceFollowUpRowsForCommitteePack(),
    },
    {
      title: "Management Attribution Bridge",
      headers: ["Item", "Value"],
      rows: [
        ["Attribution basis", el("attributionPrimaryDriver").textContent],
        ["Attribution conclusion", el("attributionVerdict").textContent],
        ["Target-period return", el("committeeTimingContribution").textContent],
        ["Policy benchmark return", el("committeeAttributionShare").textContent],
        ["Excess return vs policy", el("managerSelectionContribution").textContent],
        ["Allocation attribution", el("executionAttributionShare").textContent],
        ["Selection attribution", el("attributionBenchmarkReturn").textContent],
        ["Beta / execution deviation", el("betaImplementationContribution").textContent],
        ["Methodology status", el("reportAttributionMethod").textContent],
        ["Disclosure", "Preliminary governance bridge; professional attribution methodology approval is pending."],
      ],
    },
  ];
}

function committeePackPdfLines() {
  const lines = [
    "Decision Committee Review Pack",
    `Generated: ${new Date().toLocaleString()}`,
    `Generated by: ${currentAuditActor()}`,
    "Scope: target setting, public data, allocation, portfolio proposal, backtest, optimizer, approvals, rebalance monitoring, reporting, and performance attribution.",
    "",
  ];
  committeePackRows().forEach((section) => {
    lines.push(section.title);
    lines.push(section.headers.map(plainReportCell).join(" | "));
    lines.push(section.headers.map(() => "---").join(" | "));
    const rows = section.rows.length ? section.rows : [["No data available."]];
    rows.forEach((row) => lines.push(row.map(plainReportCell).join(" | ")));
    lines.push("");
  });
  return lines;
}

function pdfSafeText(value) {
  return plainReportCell(value)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/[\\()]/g, "\\$&");
}

function wrapPdfLine(value, maxLength = 100) {
  const text = plainReportCell(value);
  if (text.length <= maxLength) return [text];
  const words = text.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    if (word.length > maxLength) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      return;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function buildSimplePdf(lines) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const lineHeight = 13;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  const pages = [];
  let page = [];
  lines.forEach((line) => {
    wrapPdfLine(line).forEach((wrappedLine) => {
      if (page.length >= linesPerPage) {
        pages.push(page);
        page = [];
      }
      page.push(wrappedLine);
    });
  });
  if (page.length) pages.push(page);
  if (!pages.length) pages.push(["Decision Committee Review Pack"]);

  const objects = [];
  const setObject = (number, content) => { objects[number] = content; };
  const pageRefs = [];
  let nextObject = 4;
  pages.forEach((pageLines) => {
    const contentObject = nextObject;
    const pageObject = nextObject + 1;
    nextObject += 2;
    pageRefs.push(`${pageObject} 0 R`);
    const textCommands = pageLines.map((line, index) => {
      const command = `(${pdfSafeText(line)}) Tj`;
      return index === 0 ? command : `0 -${lineHeight} Td\n${command}`;
    }).join("\n");
    const content = `BT\n/F1 10 Tf\n${margin} ${pageHeight - margin} Td\n${textCommands}\nET`;
    setObject(contentObject, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    setObject(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
  });
  setObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  setObject(2, `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`);
  setObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function exportCommitteeReviewPack() {
  if (!requirePermission("report", "export committee review pack PDF")) return;
  const readiness = reportFormalReadiness();
  if (!readiness.ready) {
    updateReportDistributionSummary();
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const pdf = buildSimplePdf(committeePackPdfLines());
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `committee_review_pack_${stamp}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  logAudit("Committee review pack PDF exported", `Committee review pack PDF generated for ${stamp}`);
  el("reportDistributionSummary").textContent = "Committee review pack PDF exported for distribution.";
  el("reportDistributionSummary").className = "approval-decision is-valid";
}

function exportPerformanceReport() {
  if (!requirePermission("report", "export performance report")) return;
  const readiness = reportFormalReadiness();
  if (!readiness.ready) {
    updateReportDistributionSummary();
    return;
  }
  const rows = [
    ["Field", "Value"],
    ["Report period", el("reportPeriod").options[el("reportPeriod").selectedIndex].textContent],
    ["Date range", reportDateRangeLabel()],
    ["Initial principal", reportInitialPrincipal() > 0 ? currency.format(reportInitialPrincipal()) : "Required / not entered"],
    ["Reported period return", el("reportReturn").textContent],
    ["Policy benchmark return", el("reportBenchmarkReturn").textContent],
    ["Active return", el("reportActiveReturn").textContent],
    ["External cash flow adjustment", el("cashFlowStatus").textContent],
    ["Target return for selected period", el("reportTargetReturn").textContent],
    ["Return test", el("reportReturnStatus").textContent],
    ["U.S. equity sleeve beta", el("reportBeta").textContent],
    ["U.S. equity target beta", el("reportTargetBeta").textContent],
    ["Beta status", el("reportBetaStatus").textContent],
    ["Equity sleeve readiness", el("equitySleeveReadinessStatus").textContent],
    ["Max drawdown", el("reportMaxDrawdown").textContent],
    ["Drawdown control", el("reportDrawdownStatus").textContent],
    ["Drawdown alert", el("reportDrawdownAlert").textContent],
    ["Return method", el("reportReturnMethod").textContent],
    ["Valuation basis", el("reportValuationBasis").textContent],
    ["Benchmark basis", el("reportBenchmarkBasis").textContent],
    ["Attribution method", el("reportAttributionMethod").textContent],
    ["Data quality statement", el("reportDataQualityStatement").textContent],
    ["Report disclosure", "Internal governance report; market-data estimates do not replace broker, custodian, accounting, fee, tax, or independently validated performance records."],
    ["Rebalance formal check frequency", el("rebalanceCheckFrequency").value],
    ["Rebalance last check date", el("rebalanceLastCheckDate").textContent],
    ["Rebalance next monthly check", el("rebalanceNextCheckDate").textContent],
    ["Rebalance schedule status", el("rebalanceScheduleStatus").textContent],
    ["Rebalance open alerts", el("rebalanceOpenAlerts").textContent],
    ["Rebalance deadline status", el("rebalanceDeadlineStatus").textContent],
    ["Rebalance escalation status", el("rebalanceEscalationStatus").textContent],
    ["Rebalance exception status", el("rebalanceExceptionStatus").textContent],
    ["Rebalance escalation recipients", el("rebalanceEscalationRecipients").textContent],
    ["Attribution basis", el("attributionPrimaryDriver").textContent],
    ["Attribution conclusion", el("attributionVerdict").textContent],
    ["Target-period return", el("committeeTimingContribution").textContent],
    ["Policy benchmark return", el("committeeAttributionShare").textContent],
    ["Excess return vs policy", el("managerSelectionContribution").textContent],
    ["Allocation attribution", el("executionAttributionShare").textContent],
    ["Selection attribution", el("attributionBenchmarkReturn").textContent],
    ["Beta / execution deviation", el("betaImplementationContribution").textContent],
    ["Annual review readiness", el("annualReviewReadiness").textContent],
    ["Annual review committee conclusion", el("annualReviewCommitteeConclusion").textContent],
    ["Annual review execution conclusion", el("annualReviewExecutionConclusion").textContent],
    ["Annual review next action", el("annualReviewNextAction").textContent],
    ["Optimization result", el("optimizerStatus").textContent],
    ["Selected optimization option", el("optimizerSelectionStatus").textContent],
    ["Latest rebalance follow-up", rebalanceFollowUps[0] ? `${rebalanceFollowUps[0].status}: ${rebalanceFollowUps[0].note || rebalanceFollowUps[0].openAlerts}` : "No rebalance follow-up"],
    ["Data load error count", dataLoadErrors.length],
    ["Distribution status", el("reportDistributionStatus").value],
    ["Distribution date", el("reportDistributionDate").value],
    ["Recipient group", el("reportRecipientGroup").value],
    ["Latest data load batch", dataLoadRecords[0]?.batchId || "No data load batch"],
    ["Latest data load set", dataLoadRecords[0]?.label || "No data load batch"],
    ["Latest data load validation", dataLoadRecords[0] ? `${dataLoadRecords[0].status}: ${dataLoadRecords[0].message}` : "No data load batch"],
  ];
  dataLoadRecords.slice(0, 5).forEach((record, index) => {
    rows.push([
      `Data load batch ${index + 1}`,
      `${record.batchId} | ${record.label} | ${record.fileName} | ${record.dataDate || "-"} | ${record.rows} rows | ${record.status}`,
    ]);
  });
  dataLoadErrors.slice(0, 5).forEach((issue, index) => {
    rows.push([
      `Data load issue ${index + 1}`,
      `${issue.batchId} | ${issue.label} | row ${issue.row} | ${issue.field} | ${issue.issue} | Suggested fix: ${issue.suggestion || "Correct the source row and reload."}`,
    ]);
  });
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `performance_risk_report_${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  logAudit("Performance report exported", `Report period ${el("reportPeriod").value}, range ${reportDateRangeLabel()}`);
  el("reportDistributionSummary").textContent = "Report export: CSV downloaded. Mark as sent after distribution to the committee.";
  el("reportDistributionSummary").className = "approval-decision is-valid";
}

function updatePerformanceReport() {
  const benchmark = benchmarkProxy();
  const rows = reportRowsForSelectedPeriod();
  const navRows = reportNavRowsForPeriod();
  const hasPriceRows = benchmark !== "manual" && rows.length >= 2;
  const hasNavRows = navRows.length >= 1;
  const beginningValue = reportInitialPrincipal();
  const principalReady = beginningValue > 0;

  if (!hasPriceRows && !hasNavRows) {
    clearReport("load historical price data or approved NAV data before generating the report.");
    return;
  }

  const pairs = hasPriceRows ? portfolioReturnPairsForReportHoldings(rows, benchmark, reportHoldings()) : [];
  const returns = pairs.map((pair) => pair.asset);
  const priceReturn = periodReturnFromReturns(returns);
  const adjustedReturn = hasPriceRows
    ? cashFlowAdjustedReturn(priceReturn, rows)
    : { value: null, flows: [], estimatedEnding: false };
  const navReturn = principalReady ? reportPeriodNavReturn(navRows) : null;
  const reportReturn = principalReady ? (navReturn ?? adjustedReturn.value ?? priceReturn) : null;
  const reportBeta = betaFromPairs(pairs);
  const navReturns = returnsFromValueRows(navRows);
  const reportDrawdown = navReturns.length ? maxDrawdownFromReturns(navReturns) : maxDrawdownFromReturns(returns);
  const benchmarkReturn = periodReturnFromReturns(blendedPolicyBenchmarkReturns(rows));
  const activeReturn = reportReturn !== null && benchmarkReturn !== null
    ? reportReturn - benchmarkReturn
    : null;
  const annualTarget = currentFinalTargetReturn ?? readNumber(el("finalTargetRate"));
  const periodDays = reportPeriodDayCount(rows, navRows);
  const periodTargetReturn = targetReturnForReportPeriod(annualTarget, periodDays);
  const returnPass = reportReturn !== null && periodTargetReturn !== null && reportReturn >= periodTargetReturn;
  const drawdownStatus = reportDrawdown === null
    ? { status: "No data", className: "", message: "Drawdown data is not available for the selected report period." }
    : drawdownControlStatus(reportDrawdown);

  el("reportReturn").textContent = reportReturn === null ? "No data" : percent(reportReturn);
  el("reportBenchmarkReturn").textContent = benchmarkReturn === null ? "No data" : percent(benchmarkReturn);
  el("reportBenchmarkReturn").className = signedClassName(benchmarkReturn);
  el("reportActiveReturn").textContent = activeReturn === null ? "No data" : percent(activeReturn);
  el("reportActiveReturn").className = signedClassName(activeReturn);
  const cashFlowNote = adjustedReturn.flows.length
    ? `${adjustedReturn.flows.length} external cash flow(s) included using Modified Dietz${adjustedReturn.estimatedEnding ? " with estimated ending value" : ""}.`
    : "No external cash flows in the selected report period.";
  el("cashFlowStatus").textContent = `${dataQuality.cashFlows.status}: ${dataQuality.cashFlows.message} ${cashFlowNote}`;
  el("cashFlowStatus").className = dataQuality.cashFlows.status === "Pass"
    ? "validation-message is-valid"
    : (dataQuality.cashFlows.status === "Warning" ? "validation-message is-warning" : "validation-message");
  el("reportTargetReturn").textContent = periodTargetReturn === null ? "No data" : percent(periodTargetReturn);
  el("reportReturnStatus").textContent = !principalReady
    ? "Enter principal"
    : (reportReturn === null || periodTargetReturn === null ? "No data" : (returnPass ? "On target" : "Review"));
  el("reportReturnStatus").className = !principalReady ? "is-warning" : (returnPass ? "is-close" : "is-off");
  el("reportBeta").textContent = reportBeta === null ? "No data" : reportBeta.toFixed(2);
  el("reportTargetBeta").textContent = currentTargetBeta === null ? "No data" : currentTargetBeta.toFixed(2);
  const betaPass = reportBeta !== null && currentTargetBeta !== null && Math.abs(reportBeta - currentTargetBeta) <= 0.05;
  el("reportBetaStatus").textContent = reportBeta === null || currentTargetBeta === null ? "No data" : (betaPass ? "Pass" : "Review");
  el("reportBetaStatus").className = betaPass ? "is-close" : "is-off";
  el("reportMaxDrawdown").textContent = reportDrawdown === null ? "No data" : percent(reportDrawdown);
  el("reportVisibleMaxDrawdown").textContent = reportDrawdown === null ? "No data" : percent(reportDrawdown);
  el("reportVisibleMaxDrawdown").className = drawdownStatus.className;
  el("reportDrawdownStatus").textContent = drawdownStatus.status;
  el("reportDrawdownStatus").className = drawdownStatus.className;
  el("reportDrawdownAlert").textContent = drawdownStatus.message;
  el("reportDrawdownAlert").className = drawdownStatus.className === "is-close"
    ? "drawdown-risk-alert is-valid"
    : (drawdownStatus.className === "is-warning" ? "drawdown-risk-alert is-warning" : "drawdown-risk-alert is-invalid");
  const observedRows = navRows.length ? navRows : rows;
  const latestObservation = observedRows[observedRows.length - 1]?.date;
  const valuationDate = latestObservation instanceof Date
    ? latestObservation.toISOString().slice(0, 10)
    : String(latestObservation || "No data").slice(0, 10);
  const formalReadiness = reportFormalReadiness();
  const reportPeriodName = el("reportPeriod").options[el("reportPeriod").selectedIndex].textContent;
  el("reportHeaderPeriod").textContent = `${reportPeriodName} | ${reportDateRangeLabel()}`;
  el("reportHeaderAsOf").textContent = valuationDate || "No data";
  el("reportHeaderStatus").textContent = state.reportDistributionStatus === "Sent to Committee"
    ? "Sent to Committee"
    : (formalReadiness.ready ? "Ready for issue" : "Draft - controls incomplete");
  el("reportHeaderStatus").className = formalReadiness.ready ? "is-close" : "is-warning";
  el("reportReturnMethod").textContent = navReturn !== null
    ? "NAV-based period return using approved valuation records."
    : (adjustedReturn.flows.length
      ? "Modified Dietz return using recorded external cash flows."
      : "Market-price return proxy; no external cash-flow adjustment applied.");
  el("reportValuationBasis").textContent = hasNavRows
    ? "Actual equity holdings plus approved non-equity NAV, subject to loaded source records."
    : "Approved/proposed holdings valued from available market-price history.";
  el("reportBenchmarkBasis").textContent = benchmarkReturn === null
    ? "Blended policy benchmark is unavailable for the selected period."
    : "Blended policy benchmark based on the approved equity sleeve structure.";
  el("reportDataQualityStatement").textContent = dataLoadErrors.length
    ? `${dataLoadErrors.length} recorded data issue(s) require review before reliance.`
    : (dataLoadRecords.length
      ? `No unresolved issue is recorded in the current registry; latest batch ${dataLoadRecords[0].batchId || "not identified"}.`
      : "No data-load registry evidence is available for this report.");
  updateAnnualAttribution(reportReturn, reportBeta, benchmarkReturn, periodTargetReturn, periodDays);
  renderReportSleeveRiskMetrics(hasPriceRows ? rows : []);
  renderEquityValuePanels();
  updateReportDistributionSummary();
}

function periodKey(date, frequency) {
  if (frequency === "daily") return date.toISOString().slice(0, 10);
  if (frequency === "weekly") {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    return weekStart.toISOString().slice(0, 10);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function filterLookback(rows, months) {
  if (!rows.length) return [];
  const replayEndLabel = configuredTestDateOverride() || todayIso();
  const eligibleRows = rows.filter((row) => row.date?.toISOString?.().slice(0, 10) <= replayEndLabel);
  const scopedRows = eligibleRows.length ? eligibleRows : rows;
  const endDate = scopedRows[scopedRows.length - 1].date;
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - months);
  return scopedRows.filter((row) => row.date >= startDate && row.date <= endDate);
}

function resampleRows(rows, frequency) {
  const byPeriod = new Map();
  rows.forEach((row) => {
    byPeriod.set(periodKey(row.date, frequency), row);
  });
  return Array.from(byPeriod.values()).sort((a, b) => a.date - b.date);
}

function selectedBacktestFrequency() {
  return el("backtestFrequency")?.value || el("betaFrequency").value;
}

function selectedBacktestLookbackMonths() {
  return readNumber(el("backtestLookback") || el("betaLookback"));
}

function sampledBacktestRows() {
  return priceHistory.length
    ? resampleRows(filterLookback(priceHistory, selectedBacktestLookbackMonths()), selectedBacktestFrequency())
    : [];
}

function backtestWindowSummary(rows = sampledBacktestRows()) {
  const lookback = selectedBacktestLookbackMonths();
  const frequency = selectedBacktestFrequency();
  if (!rows.length) return `Backtest setting: ${lookback} months, ${frequency} returns. No usable historical price rows loaded yet.`;
  const start = rows[0].date?.toISOString?.().slice(0, 10) || "unknown start";
  const end = rows[rows.length - 1].date?.toISOString?.().slice(0, 10) || "unknown end";
  return `Backtest setting: ${lookback} months, ${frequency} returns. Effective historical window ${start} to ${end}; ${Math.max(0, rows.length - 1)} return period(s).`;
}

function returnPairs(rows, symbol, benchmark) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const previousSymbol = previous[symbol];
    const currentSymbol = current[symbol];
    const previousBenchmark = previous[benchmark];
    const currentBenchmark = current[benchmark];

    if (
      previousSymbol > 0 &&
      currentSymbol > 0 &&
      previousBenchmark > 0 &&
      currentBenchmark > 0
    ) {
      pairs.push({
        asset: currentSymbol / previousSymbol - 1,
        benchmark: currentBenchmark / previousBenchmark - 1,
      });
    }
  }
  return pairs;
}

function periodsPerYear(frequency) {
  if (frequency === "daily") return 252;
  if (frequency === "weekly") return 52;
  return 12;
}

function betaFromPairs(pairs) {
  if (pairs.length < 2) return null;
  const meanAsset = pairs.reduce((sum, pair) => sum + pair.asset, 0) / pairs.length;
  const meanBenchmark = pairs.reduce((sum, pair) => sum + pair.benchmark, 0) / pairs.length;
  const covariance = pairs.reduce((sum, pair) => {
    return sum + (pair.asset - meanAsset) * (pair.benchmark - meanBenchmark);
  }, 0);
  const variance = pairs.reduce((sum, pair) => {
    return sum + (pair.benchmark - meanBenchmark) ** 2;
  }, 0);
  if (variance === 0) return null;
  return covariance / variance;
}

function backtestTolerances() {
  const params = normalizeClientSystemConfig(state.systemConfig).businessParameters;
  return {
    betaRelative: Number(params.betaRelativeTolerance ?? 0.05),
    returnShortfall: Number(params.returnShortfallTolerance ?? 0.05),
    returnExcessReview: Number(params.returnExcessReviewTolerance ?? 0.5),
    drawdownExcess: Number(params.drawdownExcessTolerance ?? 0.1),
  };
}

function betaWithinTargetTolerance(actual, target) {
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(target))) return false;
  const tolerance = Math.abs(Number(target)) * backtestTolerances().betaRelative;
  return Math.abs(Number(actual) - Number(target)) <= tolerance + 0.000001;
}

function betaControlStatus(actual, target, returnPass = false, drawdownPass = false) {
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(target))) {
    return { label: "No data", hardPass: false, review: false };
  }
  const actualValue = Number(actual);
  const targetValue = Number(target);
  const tolerance = Math.abs(targetValue) * backtestTolerances().betaRelative;
  if (actualValue > targetValue + tolerance + 0.000001) {
    return { label: "Fail high beta", hardPass: false, review: false };
  }
  if (actualValue < targetValue - tolerance - 0.000001) {
    return returnPass && drawdownPass
      ? { label: "Review low beta", hardPass: true, review: true }
      : { label: "Fail low beta", hardPass: false, review: false };
  }
  return { label: "Pass", hardPass: true, review: false };
}

function returnMeetsTargetTolerance(actual, target) {
  return returnControlStatus(actual, target).hardPass;
}

function returnControlStatus(actual, target) {
  if (actual === null || actual === undefined || target === null || target === undefined || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(target))) {
    return { label: "No data", hardPass: false, review: false, floor: null, reviewCeiling: null };
  }
  const actualValue = Number(actual);
  const targetValue = Number(target);
  const tolerances = backtestTolerances();
  const targetMagnitude = Math.max(Math.abs(targetValue), 0.000001);
  const floor = targetValue - (targetMagnitude * tolerances.returnShortfall);
  const reviewCeiling = targetValue + (targetMagnitude * tolerances.returnExcessReview);
  if (actualValue < floor - 0.000001) {
    return { label: "Fail", hardPass: false, review: false, floor, reviewCeiling };
  }
  if (actualValue > reviewCeiling + 0.000001) {
    return { label: "Review", hardPass: true, review: true, floor, reviewCeiling };
  }
  return { label: "Pass", hardPass: true, review: false, floor, reviewCeiling };
}

function returnExcessGap(actual, target) {
  const status = returnControlStatus(actual, target);
  if (!status.review || status.reviewCeiling === null) return 0;
  return Math.max(0, Number(actual) - status.reviewCeiling);
}

function drawdownLimitMagnitude(targetBand, benchmarkDrawdown = null) {
  if (!targetBand) return null;
  const policyLimit = Math.abs(Number(targetBand.low));
  if (!Number.isFinite(policyLimit) || policyLimit <= 0) return null;
  const tolerance = backtestTolerances().drawdownExcess;
  const policyLimitWithTolerance = policyLimit * (1 + tolerance);
  const benchmarkLimit = Number.isFinite(Number(benchmarkDrawdown)) && Number(benchmarkDrawdown) < 0
    ? Math.abs(Number(benchmarkDrawdown)) * (1 + tolerance)
    : 0;
  return Math.max(policyLimitWithTolerance, benchmarkLimit);
}

function drawdownMeetsTargetTolerance(actual, targetBand, benchmarkDrawdown = null) {
  if (!Number.isFinite(Number(actual)) || !targetBand) return false;
  const limitMagnitude = drawdownLimitMagnitude(targetBand, benchmarkDrawdown);
  if (!Number.isFinite(limitMagnitude) || limitMagnitude <= 0) return false;
  return Math.abs(Number(actual)) <= limitMagnitude + 0.000001;
}

function backtestToleranceSummary() {
  const tolerances = backtestTolerances();
  return `return no lower than ${((1 - tolerances.returnShortfall) * 100).toFixed(0)}% of target; return above ${((1 + tolerances.returnExcessReview) * 100).toFixed(0)}% of target triggers review; sleeve beta may not exceed target by more than ${(tolerances.betaRelative * 100).toFixed(0)}%, while low beta is review-only when return and drawdown pass; drawdown no deeper than the policy or market-benchmark adjusted limit`;
}

function isUsEquityHolding(holding) {
  return holding?.assetClass === "Equity" && holding?.region === "United States";
}

function portfolioReturnPairs(rows, benchmark) {
  return portfolioReturnPairsForWeights(rows, benchmark, state.holdings.map((holding) => Number(holding.weight || 0)));
}

function usEquityReturnPairs(rows, benchmark) {
  return usEquityReturnPairsForWeights(rows, benchmark, state.holdings.map((holding) => Number(holding.weight || 0)));
}

function portfolioReturnPairsForWeights(rows, benchmark, weights) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let portfolioReturn = 0;
    let usableWeight = 0;

    state.holdings.forEach((holding, holdingIndex) => {
      const symbol = String(holding.symbol || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        portfolioReturn += weight * (currentPrice / previousPrice - 1);
        usableWeight += weight;
      }
    });

    const previousBenchmark = previous[benchmark];
    const currentBenchmark = current[benchmark];
    if (usableWeight > 0 && previousBenchmark > 0 && currentBenchmark > 0) {
      pairs.push({
        asset: portfolioReturn,
        benchmark: currentBenchmark / previousBenchmark - 1,
      });
    }
  }
  return pairs;
}

function blendedPolicyBenchmarkComponents() {
  const emergingWeight = readNumber(el("emergingEquityTargetWeight"));
  return [
    { sleeve: "U.S. equity", proxy: "VTI", weight: readNumber(el("usEquityTargetWeight")) },
    { sleeve: "Developed ex-U.S. equity - Japan proxy", proxy: "1306.T", weight: readNumber(el("developedEquityTargetWeight")) },
    { sleeve: "Emerging markets equity - Hong Kong proxy", proxy: "2800.HK", weight: emergingWeight * 0.6 },
    { sleeve: "Emerging markets equity - China A proxy", proxy: "510300.SS", weight: emergingWeight * 0.4 },
    { sleeve: "Bond", proxy: "AGG", weight: readNumber(el("bondTargetWeight")) },
    { sleeve: "Alternative", proxy: "GLD", weight: readNumber(el("alternativeTargetWeight")) },
    { sleeve: "Cash & cash-like", proxy: "BIL", weight: readNumber(el("cashTargetWeight")) },
  ].filter((component) => component.weight > 0);
}

function blendedPolicyBenchmarkPairsForWeights(rows, weights) {
  const components = blendedPolicyBenchmarkComponents();
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let assetReturn = 0;
    let usableAssetWeight = 0;
    let benchmarkReturn = 0;
    let usableBenchmarkWeight = 0;

    state.holdings.forEach((holding, holdingIndex) => {
      const symbol = String(holding.symbol || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        assetReturn += weight * (currentPrice / previousPrice - 1);
        usableAssetWeight += weight;
      }
    });

    components.forEach((component) => {
      const previousPrice = previous[component.proxy];
      const currentPrice = current[component.proxy];
      const weight = component.weight / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        benchmarkReturn += weight * (currentPrice / previousPrice - 1);
        usableBenchmarkWeight += weight;
      }
    });

    if (usableAssetWeight > 0 && usableBenchmarkWeight > 0) {
      pairs.push({
        asset: assetReturn / usableAssetWeight,
        benchmark: benchmarkReturn / usableBenchmarkWeight,
      });
    }
  }
  return pairs;
}

function blendedPolicyBenchmarkReturns(rows) {
  const components = blendedPolicyBenchmarkComponents();
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let benchmarkReturn = 0;
    let usableBenchmarkWeight = 0;

    components.forEach((component) => {
      const previousPrice = previous[component.proxy];
      const currentPrice = current[component.proxy];
      const weight = Number(component.weight || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        benchmarkReturn += weight * (currentPrice / previousPrice - 1);
        usableBenchmarkWeight += weight;
      }
    });

    if (usableBenchmarkWeight > 0) returns.push(benchmarkReturn / usableBenchmarkWeight);
  }
  return returns;
}

function usEquityReturnPairsForWeights(rows, benchmark, weights) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let sleeveReturn = 0;
    let usableWeight = 0;

    state.holdings.forEach((holding, holdingIndex) => {
      if (!isUsEquityHolding(holding)) return;
      const symbol = String(holding.symbol || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        sleeveReturn += weight * (currentPrice / previousPrice - 1);
        usableWeight += weight;
      }
    });

    const previousBenchmark = previous[benchmark];
    const currentBenchmark = current[benchmark];
    if (usableWeight > 0 && previousBenchmark > 0 && currentBenchmark > 0) {
      pairs.push({
        asset: sleeveReturn / usableWeight,
        benchmark: currentBenchmark / previousBenchmark - 1,
      });
    }
  }
  return pairs;
}

function equitySleeveDefinitions() {
  const usBenchmark = benchmarkProxy();
  return [
    {
      key: "us",
      label: "U.S. equity",
      region: "United States",
      benchmarkLabel: selectedBenchmarkLabel(),
      benchmarkProxies: usBenchmark === "manual" ? [] : [{ symbol: usBenchmark, weight: 1 }],
    },
    {
      key: "developed",
      label: "Developed ex-U.S. equity",
      region: "Japan",
      benchmarkLabel: "Japan ticker-level benchmarks / 1306.T or EWJ",
      benchmarkProxies: [{ symbol: betaBenchmarkProxyForRegion("Japan"), weight: 1 }],
    },
    {
      key: "emerging",
      label: "Emerging markets equity",
      region: "Hong Kong",
      benchmarkLabel: "Emerging ticker-level benchmarks / 2800.HK, 510300.SS, EWH, ASHR",
      benchmarkProxies: [
        { symbol: betaBenchmarkProxyForRegion("Hong Kong"), weight: 0.6 },
        { symbol: betaBenchmarkProxyForRegion("China A"), weight: 0.4 },
      ],
    },
  ];
}

function holdingMatchesEquitySleeve(holding, definition) {
  return holding?.assetClass === "Equity" && equitySleeveKey(holding.region) === definition.key;
}

function equitySleeveProposedWeight(definition, holdings = state.holdings) {
  return holdings
    .filter((holding) => holdingMatchesEquitySleeve(holding, definition))
    .reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
}

function sleeveBenchmarkReturn(definition, previous, current) {
  let benchmarkReturn = 0;
  let usableWeight = 0;
  definition.benchmarkProxies.forEach((proxy) => {
    const previousPrice = previous[proxy.symbol];
    const currentPrice = current[proxy.symbol];
    if (previousPrice > 0 && currentPrice > 0) {
      benchmarkReturn += proxy.weight * (currentPrice / previousPrice - 1);
      usableWeight += proxy.weight;
    }
  });
  return usableWeight > 0 ? benchmarkReturn / usableWeight : null;
}

function equitySleeveReturnPairsForWeights(rows, definition, weights, holdings = state.holdings) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let sleeveReturn = 0;
    let usableWeight = 0;

    holdings.forEach((holding, holdingIndex) => {
      if (!holdingMatchesEquitySleeve(holding, definition)) return;
      const symbol = String(holding.symbol || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        sleeveReturn += weight * (currentPrice / previousPrice - 1);
        usableWeight += weight;
      }
    });

    const benchmarkReturn = sleeveBenchmarkReturn(definition, previous, current);
    if (usableWeight > 0 && benchmarkReturn !== null) {
      pairs.push({
        asset: sleeveReturn / usableWeight,
        benchmark: benchmarkReturn,
      });
    }
  }
  return pairs;
}

function equitySleeveBenchmarkReturns(rows, definition) {
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const benchmarkReturn = sleeveBenchmarkReturn(definition, rows[index - 1], rows[index]);
    if (benchmarkReturn !== null) returns.push(benchmarkReturn);
  }
  return returns;
}

function tickerBetaForMarketBenchmark(symbol, region, rows) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return null;
  const record = tickerBySymbol(normalized);
  const benchmark = betaBenchmarkProxyForRecord(record, region);
  if (!benchmark || benchmark === "manual") return null;
  if (normalized === benchmark) return 1;
  return betaFromPairs(returnPairs(rows, normalized, benchmark));
}

function equitySleeveWeightedMarketBeta(rows, definition, weights, holdings = state.holdings) {
  let weightedBeta = 0;
  let usableWeight = 0;
  let observationCount = 0;

  holdings.forEach((holding, holdingIndex) => {
    if (!holdingMatchesEquitySleeve(holding, definition)) return;
    const weight = Number(weights[holdingIndex] || 0);
    if (weight <= 0) return;
    const beta = tickerBetaForMarketBenchmark(holding.symbol, holding.region || definition.region, rows);
    if (!Number.isFinite(beta)) return;
    weightedBeta += weight * beta;
    usableWeight += weight;
    const benchmark = betaBenchmarkProxyForHolding(holding);
    if (benchmark && benchmark !== "manual") {
      observationCount = Math.max(observationCount, returnPairs(rows, String(holding.symbol || "").trim().toUpperCase(), benchmark).length);
    }
  });

  return {
    beta: usableWeight > 0 ? weightedBeta / usableWeight : null,
    observations: observationCount,
  };
}

function equitySleeveBacktestResults(rows, weights, holdings = state.holdings) {
  return Object.fromEntries(equitySleeveDefinitions().map((definition) => {
    const target = currentEquitySleeveTargets[definition.key] || {};
    const targetBeta = Number.isFinite(Number(target.beta)) ? Number(target.beta) : null;
    const targetReturn = Number.isFinite(Number(target.targetReturn)) ? Number(target.targetReturn) : null;
    const drawdownBand = target.drawdownBand || null;
    const proposedWeight = equitySleeveProposedWeight(definition, holdings);
    const pairs = definition.benchmarkProxies.length
      ? equitySleeveReturnPairsForWeights(rows, definition, weights, holdings)
      : [];
    const marketBeta = equitySleeveWeightedMarketBeta(rows, definition, weights, holdings);
    const beta = marketBeta.beta;
    const returns = pairs.map((pair) => pair.asset);
    const benchmarkReturns = equitySleeveBenchmarkReturns(rows, definition);
    const annualizedReturn = annualizedReturnFromReturns(returns, selectedBacktestFrequency());
    const maxDrawdown = maxDrawdownFromReturns(returns);
    const benchmarkMaxDrawdown = maxDrawdownFromReturns(benchmarkReturns);
    const returnStatus = returnControlStatus(annualizedReturn, targetReturn);
    const returnPass = returnStatus.hardPass;
    const drawdownPass = maxDrawdown !== null
      && drawdownBand !== null
      && drawdownMeetsTargetTolerance(maxDrawdown, drawdownBand, benchmarkMaxDrawdown);
    const betaStatus = betaControlStatus(beta, targetBeta, returnPass, drawdownPass);
    const betaPass = betaStatus.hardPass;
    return [definition.key, {
      definition,
      targetBeta,
      targetReturn,
      drawdownBand,
      proposedWeight,
      pairs,
      beta,
      betaObservations: marketBeta.observations,
      returnPass,
      returnReview: returnStatus.review,
      returnStatus: returnStatus.label,
      betaPass,
      betaReview: betaStatus.review,
      betaStatus: betaStatus.label,
      drawdownPass,
      annualizedReturn,
      maxDrawdown,
      benchmarkMaxDrawdown,
    }];
  }));
}

function renderEquitySleeveReadiness(results = null) {
  const body = el("equitySleeveReadinessRows");
  if (!body) return;
  body.replaceChildren();

  const sampledRows = sampledBacktestRows();
  const weights = state.holdings.map((holding) => Number(holding.weight || 0));
  const backtestResults = results || (sampledRows.length ? equitySleeveBacktestResults(sampledRows, weights) : {});
  let hardIssues = 0;
  let reviewIssues = 0;

  equitySleeveDefinitions().forEach((definition) => {
    const result = backtestResults[definition.key] || {};
    const targetBeta = result.targetBeta ?? null;
    const proposedWeight = result.proposedWeight ?? equitySleeveProposedWeight(definition);
    const pairs = result.pairs || [];
    const betaObservationCount = result.betaObservations ?? pairs.length;
    const targetReturn = result.targetReturn ?? null;
    const drawdownBand = result.drawdownBand ?? null;
    const backtestedReturn = result.annualizedReturn ?? null;
    const backtestedBeta = result.beta ?? null;
    const maxDrawdown = result.maxDrawdown ?? null;
    const returnPass = Boolean(result.returnPass);
    const returnReview = Boolean(result.returnReview);
    const betaPass = Boolean(result.betaPass);
    const betaReview = Boolean(result.betaReview);
    const drawdownPass = Boolean(result.drawdownPass);

    let status = "";
    let className = "is-warning";
    if (targetReturn === null || targetBeta === null || drawdownBand === null) {
      status = "Target incomplete";
      className = "is-off";
    } else if (!priceHistory.length) {
      status = "Load historical prices";
    } else if (!definition.benchmarkProxies.length) {
      status = "Select a benchmark series";
      className = "is-off";
    } else if (proposedWeight <= 0) {
      status = "No proposed holdings";
      className = "is-off";
    } else if (betaObservationCount < 2 || backtestedReturn === null || backtestedBeta === null || maxDrawdown === null) {
      status = "Not enough usable return history";
      className = "is-off";
    } else {
      const failed = [];
      if (!returnPass) failed.push("return");
      if (!betaPass) failed.push("beta");
      if (!drawdownPass) failed.push("drawdown");
      const reviews = [];
      if (returnReview) reviews.push("return");
      if (betaReview) reviews.push("low beta");
      status = failed.length
        ? `Review ${failed.join("/")}`
        : (reviews.length ? `Pass with ${reviews.join("/")} review` : "Pass");
      className = failed.length ? "is-off" : (reviews.length ? "is-warning" : "is-close");
    }

    if (className === "is-off") hardIssues += 1;
    if (className === "is-warning") reviewIssues += 1;

    const row = document.createElement("tr");
    [
      definition.label,
      definition.benchmarkLabel,
      targetReturn === null ? "Invalid" : percent(targetReturn),
      backtestedReturn === null ? "No data" : percent(backtestedReturn),
      targetBeta === null ? "Invalid" : targetBeta.toFixed(2),
      backtestedBeta === null ? "No data" : backtestedBeta.toFixed(2),
      drawdownBand === null ? "Invalid" : formatDrawdownBand(drawdownBand),
      maxDrawdown === null ? "No data" : percent(maxDrawdown),
      status,
    ].forEach((value, index) => {
      const cell = document.createElement(index === 8 ? "th" : "td");
      cell.textContent = value;
      if (index === 8) cell.className = className;
      row.append(cell);
    });
    body.append(row);
  });

  const statusNode = el("equitySleeveReadinessStatus");
  if (!priceHistory.length) {
    statusNode.textContent = "Load historical price data to test each sleeve's return, beta, and drawdown controls.";
    statusNode.className = "validation-message";
  } else if (hardIssues) {
    statusNode.textContent = "Sleeve backtest controls: review the sleeve(s) marked Review before submitting for committee approval.";
    statusNode.className = "validation-message is-invalid";
  } else if (reviewIssues) {
    statusNode.textContent = "Sleeve backtest controls: hard controls pass, with return review on sleeve(s) where excess return may reflect stock-specific risk.";
    statusNode.className = "validation-message is-warning";
  } else {
    statusNode.textContent = "Sleeve backtest controls: all three sleeves pass return, beta, and drawdown checks.";
    statusNode.className = "validation-message is-valid";
  }
}

function portfolioReturnPairsForReportHoldings(rows, benchmark, holdings) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let portfolioReturn = 0;
    let usableWeight = 0;

    holdings.forEach((holding) => {
      const symbol = String(holding.symbol || holding.ticker || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(holding.weight || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        portfolioReturn += weight * (currentPrice / previousPrice - 1);
        usableWeight += weight;
      }
    });

    const previousBenchmark = previous[benchmark];
    const currentBenchmark = current[benchmark];
    if (usableWeight > 0 && previousBenchmark > 0 && currentBenchmark > 0) {
      pairs.push({
        asset: portfolioReturn,
        benchmark: currentBenchmark / previousBenchmark - 1,
      });
    }
  }
  return pairs;
}

function usEquityReturnPairsForReportHoldings(rows, benchmark, holdings) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let sleeveReturn = 0;
    let usableWeight = 0;

    holdings.filter(isUsEquityHolding).forEach((holding) => {
      const symbol = String(holding.symbol || holding.ticker || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(holding.weight || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        sleeveReturn += weight * (currentPrice / previousPrice - 1);
        usableWeight += weight;
      }
    });

    const previousBenchmark = previous[benchmark];
    const currentBenchmark = current[benchmark];
    if (usableWeight > 0 && previousBenchmark > 0 && currentBenchmark > 0) {
      pairs.push({
        asset: sleeveReturn / usableWeight,
        benchmark: currentBenchmark / previousBenchmark - 1,
      });
    }
  }
  return pairs;
}


function maxDrawdownFromReturns(returns) {
  if (!returns.length) return null;
  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;

  returns.forEach((periodReturn) => {
    value *= 1 + periodReturn;
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  });

  return maxDrawdown * 100;
}

function annualizedReturnFromReturns(returns, frequency) {
  if (!returns.length) return null;
  const cumulative = returns.reduce((value, periodReturn) => value * (1 + periodReturn), 1);
  return (cumulative ** (periodsPerYear(frequency) / returns.length) - 1) * 100;
}

function periodReturnFromReturns(returns) {
  if (!returns.length) return null;
  return (returns.reduce((value, periodReturn) => value * (1 + periodReturn), 1) - 1) * 100;
}

function benchmarkAnnualReturns(benchmark) {
  if (benchmark === "manual" || !priceHistory.length) return [];
  const rows = priceHistory
    .filter((row) => row[benchmark] > 0)
    .sort((a, b) => a.date - b.date);
  const byYear = new Map();

  rows.forEach((row) => {
    const year = row.date.getFullYear();
    const record = byYear.get(year) || { year, first: row, last: row };
    if (row.date < record.first.date) record.first = row;
    if (row.date > record.last.date) record.last = row;
    byYear.set(year, record);
  });

  return Array.from(byYear.values())
    .filter((record) => record.first !== record.last)
    .map((record) => ({
      year: record.year,
      returnRate: (record.last[benchmark] / record.first[benchmark] - 1) * 100,
    }))
    .sort((a, b) => b.year - a.year)
    .slice(0, 10);
}

function setBenchmarkReferenceMessage(message, className = "validation-message is-warning") {
  const mean = el("benchmarkTenYearMean");
  const years = el("benchmarkYearsAvailable");
  const body = el("benchmarkAnnualReturnRows");
  if (mean) mean.textContent = "Loading";
  if (years) years.textContent = "Loading";
  if (!body) return;
  body.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 2;
  cell.textContent = message;
  cell.className = className.includes("is-invalid") ? "is-off" : "";
  row.append(cell);
  body.append(row);
}

async function loadPublicDataEnginePriceOutput(path = "/data/public_data_engine_output/auto_historical_prices.csv") {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}fresh=${Date.now()}`);
  if (!response.ok) throw new Error(`public data engine price output unavailable: HTTP ${response.status}`);
  const text = await response.text();
  const parsed = applyHistoricalPriceText(text, "auto_historical_prices.csv", {
    type: "public_data_engine_historical_prices",
    auditAction: "Public data engine benchmark history loaded",
  });
  if (!parsed.length) throw new Error("public data engine price output did not contain usable historical prices");
  return parsed;
}

async function ensureBenchmarkReferenceData() {
  const benchmark = benchmarkProxy();
  if (benchmark === "manual" || benchmarkAnnualReturns(benchmark).length) return;

  const loadKey = `${benchmark}:load-existing`;
  if (!benchmarkReferenceAutoAttempts.has(loadKey)) {
    benchmarkReferenceAutoAttempts.add(loadKey);
    setBenchmarkReferenceMessage(`Auto-loading public benchmark history for ${benchmark} from the Public Data Engine output...`);
    try {
      await loadPublicDataEnginePriceOutput();
      if (benchmarkAnnualReturns(benchmark).length) return;
    } catch (error) {
      logAudit("Public benchmark history auto-load skipped", error.message);
    }
  }

  const runKey = `${benchmark}:run-engine`;
  if (!benchmarkReferenceAutoAttempts.has(runKey) && actorCan("annualData") && backendSyncAvailable()) {
    benchmarkReferenceAutoAttempts.add(runKey);
    setBenchmarkReferenceMessage(`Auto-running Public Data Engine to collect ${benchmark} benchmark history...`);
    try {
      const connected = await ensureBackendImportSession({
        allowedGroups: ["System Administrator", "Decision Committee"],
        fallbackRole: "decision",
      });
      if (!connected) throw new Error("local backend is not connected");
      const result = await backendRequest("/api/public-data/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      dataQuality.publicData = qualityResult("Pass", "Public data engine generated benchmark history automatically for CAPM reference.");
      await loadPublicDataEnginePriceOutput(result.publicDataEngine.outputs.historicalPrices);
      updateWorkflowOverview();
      if (benchmarkAnnualReturns(benchmark).length) return;
    } catch (error) {
      logAudit("Public benchmark history auto-run failed", error.message);
    }
  }

  updateBenchmarkReference();
}

function updateBenchmarkReference() {
  const benchmark = benchmarkProxy();
  const rows = benchmarkAnnualReturns(benchmark);
  const body = el("benchmarkAnnualReturnRows");
  body.replaceChildren();

  if (!rows.length) {
    el("benchmarkTenYearMean").textContent = "No data";
    el("benchmarkYearsAvailable").textContent = "No data";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.textContent = benchmark === "manual"
      ? "Manual benchmark selected. Load a benchmark proxy to calculate 10-year reference returns."
      : "Load historical price CSV with the selected benchmark column to show 10-year reference returns.";
    row.append(cell);
    body.append(row);
    return;
  }

  const mean = rows.reduce((sum, item) => sum + item.returnRate, 0) / rows.length;
  el("benchmarkTenYearMean").textContent = percent(mean);
  el("benchmarkYearsAvailable").textContent = `${rows.length} year${rows.length === 1 ? "" : "s"}`;

  rows.forEach((item) => {
    const row = document.createElement("tr");
    const year = document.createElement("td");
    const returnCell = document.createElement("td");
    year.textContent = String(item.year);
    returnCell.textContent = percent(item.returnRate);
    returnCell.className = item.returnRate >= 0 ? "is-close" : "is-off";
    row.append(year, returnCell);
    body.append(row);
  });
}

function adjustedTargetReturnForDays(days) {
  if (currentUsEquityTargetReturn === null || days <= 0) return null;
  return ((1 + currentUsEquityTargetReturn / 100) ** (days / 365) - 1) * 100;
}

function drawdownControlStatus(drawdown, benchmarkDrawdown = null) {
  if (drawdown === null || currentTargetDrawdownBand === null) {
    return { status: "No data", className: "", message: "Drawdown alert: target drawdown budget is not available." };
  }
  const breachMagnitude = drawdownLimitMagnitude(currentTargetDrawdownBand, benchmarkDrawdown) || Math.abs(currentTargetDrawdownBand.low);
  const breachLevel = -breachMagnitude;
  const warningLevel = -breachMagnitude * 0.8;
  if (drawdown < breachLevel) {
    return {
      status: "Breach",
      className: "is-off",
      message: `Drawdown alert: breached the max drawdown budget. Current ${percent(drawdown)}, adjusted limit ${percent(breachLevel)}.`,
    };
  }
  if (drawdown <= warningLevel) {
    return {
      status: "Approaching",
      className: "is-warning",
      message: `Drawdown alert: approaching max drawdown budget. Current ${percent(drawdown)}, warning level ${percent(warningLevel)}, adjusted limit ${percent(breachLevel)}.`,
    };
  }
  return {
    status: "Within control",
    className: "is-close",
    message: `Drawdown alert: within control. Current ${percent(drawdown)}, warning level ${percent(warningLevel)}.`,
  };
}

function portfolioMetricsForWeights(weights, holdings = state.holdings) {
  if (!priceHistory.length) return null;
  const frequency = selectedBacktestFrequency();
  const sampledRows = sampledBacktestRows();
  const pairs = portfolioBacktestReturnPairsForWeights(sampledRows, weights, holdings);
  const sleeves = equitySleeveBacktestResults(sampledRows, weights, holdings);
  const benchmarkReturns = proposedEquityBenchmarkReturns(sampledRows, holdings);
  const returns = pairs.map((pair) => pair.asset);
  return {
    maxDrawdown: maxDrawdownFromReturns(returns),
    benchmarkMaxDrawdown: maxDrawdownFromReturns(benchmarkReturns),
    annualizedReturn: annualizedReturnFromReturns(returns, frequency),
    targetReturn: proposedEquityBacktestTargetReturn(holdings),
    periods: pairs.length,
    sleeves,
  };
}

function proposedEquityBenchmarkReturns(rows, holdings = state.holdings) {
  const definitions = equitySleeveDefinitions();
  const weights = definitions.map((definition) => ({
    definition,
    weight: equitySleeveProposedWeight(definition, holdings),
  })).filter((item) => item.weight > 0);
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
  const returns = [];

  for (let index = 1; index < rows.length; index += 1) {
    let blendedReturn = 0;
    let usableWeight = 0;
    weights.forEach((item) => {
      const benchmarkReturn = sleeveBenchmarkReturn(item.definition, rows[index - 1], rows[index]);
      if (benchmarkReturn !== null) {
        blendedReturn += (item.weight / totalWeight) * benchmarkReturn;
        usableWeight += item.weight / totalWeight;
      }
    });
    if (usableWeight > 0) returns.push(blendedReturn / usableWeight);
  }

  return returns;
}

function portfolioBacktestReturnPairsForWeights(rows, weights, holdings = state.holdings) {
  const pairs = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let portfolioReturn = 0;
    let usableWeight = 0;

    holdings.forEach((holding, holdingIndex) => {
      if (holding.assetClass !== "Equity") return;
      const symbol = String(holding.symbol || "").trim().toUpperCase();
      const previousPrice = previous[symbol];
      const currentPrice = current[symbol];
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previousPrice > 0 && currentPrice > 0 && weight > 0) {
        portfolioReturn += weight * (currentPrice / previousPrice - 1);
        usableWeight += weight;
      }
    });

    if (usableWeight > 0) pairs.push({ asset: portfolioReturn / usableWeight });
  }
  return pairs;
}

function proposedEquityBacktestTargetReturn(holdings = state.holdings) {
  let weightedReturn = 0;
  let usableWeight = 0;
  equitySleeveDefinitions().forEach((definition) => {
    const targetReturn = Number(currentEquitySleeveTargets[definition.key]?.targetReturn);
    const proposedWeight = equitySleeveProposedWeight(definition, holdings);
    if (Number.isFinite(targetReturn) && proposedWeight > 0) {
      weightedReturn += proposedWeight * targetReturn;
      usableWeight += proposedWeight;
    }
  });
  return usableWeight > 0 ? weightedReturn / usableWeight : null;
}

function backtestControlStatus(metrics) {
  const sleeveResults = metrics?.sleeves || {};
  const sleeveDefinitions = equitySleeveDefinitions();
  const sleeveBetaPass = sleeveDefinitions.length > 0
    && sleeveDefinitions.every((definition) => sleeveResults[definition.key]?.betaPass === true);
  const sleeveControlPass = sleeveDefinitions.length > 0
    && sleeveDefinitions.every((definition) => {
      const result = sleeveResults[definition.key];
      return result?.returnPass === true && result?.betaPass === true && result?.drawdownPass === true;
    });
  // Approval is governed sleeve by sleeve. The blended portfolio result remains
  // useful for monitoring, but it is not an additional investment constraint.
  const portfolioReturnStatus = returnControlStatus(metrics?.annualizedReturn, metrics?.targetReturn);
  const returnPass = sleeveDefinitions.length > 0
    && sleeveDefinitions.every((definition) => sleeveResults[definition.key]?.returnPass === true);
  const sleeveReturnReview = sleeveDefinitions.some((definition) => sleeveResults[definition.key]?.returnReview === true);
  const sleeveBetaReview = sleeveDefinitions.some((definition) => sleeveResults[definition.key]?.betaReview === true);
  const returnReview = portfolioReturnStatus.review || sleeveReturnReview || sleeveBetaReview;
  const drawdownPass = sleeveDefinitions.length > 0
    && sleeveDefinitions.every((definition) => sleeveResults[definition.key]?.drawdownPass === true);
  return {
    returnPass,
    returnReview,
    returnStatus: returnPass ? (returnReview ? "Review" : "Pass") : "Review",
    portfolioReturnStatus: portfolioReturnStatus.label,
    drawdownPass,
    sleevePass: sleeveBetaPass,
    sleeveBetaPass,
    sleeveControlPass,
    hardPass: sleeveControlPass,
  };
}

function assetAndFactorSummariesForWeights(weights, holdings = state.holdings) {
  return holdings.reduce((summary, holding, index) => {
    const weight = Number(weights[index] || 0);
    const assetKey = assetClassKey(holding.assetClass);
    const holdingRegionKey = regionKey(holding.region);
    const factorKey = String(holding.styleFactor || "").toLowerCase();
    summary.assets[assetKey] = (summary.assets[assetKey] || 0) + weight;
    summary.regions[holdingRegionKey] = (summary.regions[holdingRegionKey] || 0) + weight;
    if (["cyclical", "growth", "active"].includes(factorKey)) {
      summary.factors[factorKey] = (summary.factors[factorKey] || 0) + weight;
    }
    return summary;
  }, { assets: {}, factors: {}, regions: {} });
}

function constraintPenalty(weights, holdings = state.holdings) {
  const constraints = readStyleConstraints();
  const summaries = assetAndFactorSummariesForWeights(weights, holdings);
  const assetKeys = ["equity", "bond", "alternative", "cash"];
  const regionKeys = ["us", "japan", "hongkong", "chinaa", "global"];
  const allocationPenalty = Object.entries(constraints).reduce((penalty, [key, range]) => {
    const summary = assetKeys.includes(key)
      ? summaries.assets
      : (regionKeys.includes(key) ? summaries.regions : summaries.factors);
    const weight = summary[key] || 0;
    if (weight < range.low) return penalty + (range.low - weight) ** 2;
    if (weight > range.high) return penalty + (weight - range.high) ** 2;
    return penalty;
  }, 0);
  const singleSecurityPenalty = weights.reduce((penalty, weight, index) => {
    const holding = holdings[index];
    if (holding?.assetClass !== "Equity") return penalty;
    const maxSingleSecurityWeight = singleSecurityMaxPortfolioWeight(holding);
    return weight > maxSingleSecurityWeight ? penalty + (weight - maxSingleSecurityWeight) ** 2 * 2 : penalty;
  }, 0);
  return allocationPenalty + singleSecurityPenalty;
}

function randomWeights(count) {
  const raw = Array.from({ length: count }, () => Math.random() ** 1.8);
  const sum = raw.reduce((total, value) => total + value, 0) || 1;
  return raw.map((value) => (value / sum) * 100);
}

function readOptimizerScope() {
  return {
    region: "all",
    assetClass: "Equity",
    style: "all",
  };
}

function holdingMatchesOptimizerScope(holding, scope) {
  if (holding.lockedWeight) return false;
  if (scope.region !== "all" && holding.region !== scope.region) return false;
  if (scope.assetClass !== "all" && holding.assetClass !== scope.assetClass) return false;
  if (scope.style !== "all" && holding.styleFactor !== scope.style) return false;
  return isUsEquityHolding(holding);
}

function randomUsEquitySleeveWeights(baseWeights) {
  const weights = [...baseWeights];
  const minimumSelectedEquityWeight = 2;
  const scope = readOptimizerScope();
  const usEquityIndexes = state.holdings
    .map((holding, index) => ({ holding, index }))
    .filter((row) => holdingMatchesOptimizerScope(row.holding, scope))
    .map((row) => row.index);
  const sleeveTotal = usEquityIndexes.reduce((total, index) => total + Number(baseWeights[index] || 0), 0);
  if (!usEquityIndexes.length || sleeveTotal <= 0) return [...baseWeights];
  const perHoldingMinimum = Math.min(minimumSelectedEquityWeight, sleeveTotal / usEquityIndexes.length);
  const minimumTotal = perHoldingMinimum * usEquityIndexes.length;
  const raw = usEquityIndexes.map(() => Math.random() ** 1.6);
  const rawTotal = raw.reduce((total, value) => total + value, 0) || 1;
  usEquityIndexes.forEach((holdingIndex, rawIndex) => {
    const distributable = Math.max(0, sleeveTotal - minimumTotal);
    weights[holdingIndex] = perHoldingMinimum + (raw[rawIndex] / rawTotal) * distributable;
  });
  return weights;
}

function scoreCandidate(weights, metrics) {
  if (!metrics || metrics.beta === null || metrics.maxDrawdown === null || metrics.annualizedReturn === null) return Infinity;
  const returnPenalty = currentUsEquityTargetReturn === null
    ? 0
    : Math.max(0, currentUsEquityTargetReturn - metrics.annualizedReturn) ** 2 * 0.1;
  const returnExcessPenalty = currentUsEquityTargetReturn === null
    ? 0
    : returnExcessGap(metrics.annualizedReturn, currentUsEquityTargetReturn) ** 2 * 0.03;
  const betaPenalty = currentTargetBeta === null
    ? 0
    : (metrics.beta - currentTargetBeta) ** 2 * 1000;
  const drawdownPenalty = currentTargetDrawdownBand === null
    ? 0
    : Math.max(0, Math.abs(metrics.maxDrawdown) - drawdownLimitMagnitude(currentTargetDrawdownBand, metrics.benchmarkMaxDrawdown)) ** 2 * 4;
  const weightPenalty = Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) ** 2;
  return returnPenalty + returnExcessPenalty + betaPenalty + drawdownPenalty + constraintPenalty(weights) + weightPenalty;
}

function holdingBetaForAdvice(holding) {
  if (!isUsEquityHolding(holding)) return null;
  const symbol = String(holding.symbol || "").trim().toUpperCase();
  if (betaEstimates[symbol] !== undefined) return betaEstimates[symbol];
  return Number(holding.beta || 0);
}

function optimizationReason(holding, oldWeight, newWeight, beforeMetrics, afterMetrics) {
  const delta = newWeight - oldWeight;
  const beta = holdingBetaForAdvice(holding);
  const betaGapBefore = beforeMetrics && beforeMetrics.beta !== null && currentTargetBeta !== null
    ? beforeMetrics.beta - currentTargetBeta
    : null;
  const returnGapBefore = beforeMetrics && beforeMetrics.annualizedReturn !== null && currentUsEquityTargetReturn !== null
    ? beforeMetrics.annualizedReturn - currentUsEquityTargetReturn
    : null;
  const returnStatusBefore = beforeMetrics
    ? returnControlStatus(beforeMetrics.annualizedReturn, currentUsEquityTargetReturn)
    : { review: false };
  const drawdownBreachedBefore = beforeMetrics && beforeMetrics.maxDrawdown !== null && currentTargetDrawdownBand !== null
    ? !drawdownMeetsTargetTolerance(beforeMetrics.maxDrawdown, currentTargetDrawdownBand, beforeMetrics.benchmarkMaxDrawdown)
    : false;

  if (holding.assetClass !== "Equity") {
    if (delta > 0) return "Add ballast while keeping asset-class and region constraints in range.";
    return "Release weight for the U.S. equity sleeve adjustment.";
  }

  if (betaGapBefore !== null && Math.abs(betaGapBefore) > 0.05 && beta !== null) {
    if (betaGapBefore < 0) {
      return delta > 0 && beta >= currentTargetBeta
        ? "Increase a higher-beta holding to move sleeve beta toward target."
        : "Reduce a lower-beta holding to fund beta improvement.";
    }
    return delta > 0 && beta <= currentTargetBeta
      ? "Increase a lower-beta holding to reduce excess sleeve beta."
      : "Reduce a higher-beta holding to bring beta back toward target.";
  }

  if (returnGapBefore !== null && returnGapBefore < 0) {
    return delta > 0 ? "Raise exposure to improve backtested return." : "Reduce lower-contribution exposure.";
  }

  if (returnStatusBefore.review) {
    return delta > 0
      ? "Rebalance toward a less idiosyncratic return source while preserving hard controls."
      : "Reduce exposure that may be driving excess stock-specific return.";
  }

  if (drawdownBreachedBefore) {
    return delta > 0 ? "Improve drawdown control while preserving constraints." : "Reduce drawdown pressure.";
  }

  return afterMetrics?.beta !== null
    ? "Fine-tune weight to improve the combined return, beta, and drawdown score."
    : "Fine-tune weight to improve the portfolio score.";
}

function renderOptimizationAdvice(oldWeights, newWeights, beforeMetrics, afterMetrics) {
  const advice = el("optimizerAdvice");
  advice.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Optimization Advice";
  advice.appendChild(title);

  const changes = state.holdings.map((holding, index) => {
    const oldWeight = Number(oldWeights[index] || 0);
    const newWeight = Number(newWeights[index] || 0);
    return {
      holding,
      oldWeight,
      newWeight,
      delta: newWeight - oldWeight,
      reason: optimizationReason(holding, oldWeight, newWeight, beforeMetrics, afterMetrics),
    };
  }).filter((row) => Math.abs(row.delta) >= 0.25)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (!changes.length) {
    const empty = document.createElement("p");
    empty.textContent = "The current weights are already close to the optimizer's best available suggestion.";
    advice.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Security", "Current", "Suggested", "Change", "Reason"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  changes.slice(0, 10).forEach((row) => {
    const tr = document.createElement("tr");
    [
      row.holding.symbol || "Unnamed",
      percent(row.oldWeight),
      percent(row.newWeight),
      `${row.delta >= 0 ? "+" : ""}${percent(row.delta)}`,
      row.reason,
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  advice.appendChild(table);
}

function setOptimizerSummary(id, text, className = "") {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
  node.className = className;
}

function resetOptimizerExplainability(message = "No optimizer run") {
  [
    "optimizerConstraintSummary",
    "optimizerLockSummary",
    "optimizerBeforeAfterSummary",
    "optimizerFeasibilitySummary",
  ].forEach((id) => setOptimizerSummary(id, message));
}

function optimizerMetricText(metrics) {
  if (!metrics) return "No usable metrics";
  const returnText = metrics.annualizedReturn === null ? "return n/a" : `return ${percent(metrics.annualizedReturn)}`;
  const betaText = metrics.beta === null ? "beta n/a" : `beta ${metrics.beta.toFixed(2)}`;
  const drawdownText = metrics.maxDrawdown === null ? "drawdown n/a" : `drawdown ${percent(metrics.maxDrawdown)}`;
  return `${returnText}, ${betaText}, ${drawdownText}`;
}

function optimizerHardControlStatus(metrics) {
  if (!metrics) return { returnPass: false, returnReview: false, betaPass: false, drawdownPass: false, hardPass: false };
  const returnStatus = returnControlStatus(metrics.annualizedReturn, currentUsEquityTargetReturn);
  const returnPass = returnStatus.hardPass;
  const betaPass = metrics.beta !== null
    && currentTargetBeta !== null
    && betaWithinTargetTolerance(metrics.beta, currentTargetBeta);
  const drawdownPass = metrics.maxDrawdown !== null
    && currentTargetDrawdownBand !== null
    && drawdownMeetsTargetTolerance(metrics.maxDrawdown, currentTargetDrawdownBand, metrics.benchmarkMaxDrawdown);
  return { returnPass, returnReview: returnStatus.review, betaPass, drawdownPass, hardPass: returnPass && betaPass && drawdownPass };
}

function optimizerConstraintText(metrics) {
  if (!metrics) return "No usable historical price pairs.";
  const hard = optimizerHardControlStatus(metrics);
  const returnText = metrics.annualizedReturn === null || currentUsEquityTargetReturn === null
    ? "return n/a"
    : `return ${hard.returnPass ? (hard.returnReview ? "review" : "pass") : "fail"}`;
  return `${returnText}; beta ${hard.betaPass ? "pass" : "review"}; drawdown ${hard.drawdownPass ? "pass" : "review"}.`;
}

function optimizerScopeText(scope, movableCount) {
  const lockedCount = state.holdings.filter((holding) => holding.lockedWeight).length;
  const region = scope.region === "all" ? "all U.S. equity regions" : scope.region;
  const assetClass = scope.assetClass === "all" ? "all asset classes" : scope.assetClass;
  const style = scope.style === "all" ? "all styles" : scope.style;
  return `${movableCount} eligible holding(s); ${lockedCount} locked; scope: ${region}, ${assetClass}, ${style}.`;
}

function optimizerFailureReasons(metrics, scope, movableCount) {
  const reasons = [];
  const lockedCount = state.holdings.filter((holding) => holding.lockedWeight).length;
  if (!movableCount) reasons.push("no eligible holdings under current locks/scope");
  if (lockedCount >= state.holdings.filter(isUsEquityHolding).length && lockedCount > 0) reasons.push("all U.S. equity holdings are locked");
  if (!metrics) {
    reasons.push("no usable historical price pairs for selected benchmark");
    return reasons;
  }
  const hard = optimizerHardControlStatus(metrics);
  if (!hard.betaPass && metrics.beta !== null && currentTargetBeta !== null) {
    reasons.push(`beta gap ${(metrics.beta - currentTargetBeta).toFixed(2)} remains outside +/-0.05 tolerance`);
  }
  if (!hard.drawdownPass && metrics.maxDrawdown !== null && currentTargetDrawdownBand !== null) {
    const limit = drawdownLimitMagnitude(currentTargetDrawdownBand, metrics.benchmarkMaxDrawdown);
    reasons.push(`max drawdown ${percent(metrics.maxDrawdown)} is deeper than limit ${percent(-(limit || Math.abs(currentTargetDrawdownBand.low)))}`);
  }
  if (metrics.annualizedReturn !== null && currentUsEquityTargetReturn !== null && metrics.annualizedReturn < currentUsEquityTargetReturn) {
    reasons.push(`historical return ${percent(metrics.annualizedReturn)} is below target ${percent(currentUsEquityTargetReturn)}`);
  }
  const returnStatus = returnControlStatus(metrics.annualizedReturn, currentUsEquityTargetReturn);
  if (returnStatus.review) {
    reasons.push(`historical return ${percent(metrics.annualizedReturn)} is above the excess-review band; optimizer should reduce possible stock-specific return risk`);
  }
  if (scope.region !== "all" || scope.assetClass !== "all" || scope.style !== "all") reasons.push("optimizer scope may be too narrow");
  return reasons.slice(0, 4);
}

function renderOptimizerExplainability(oldWeights, newWeights, beforeMetrics, afterMetrics, scope, movableCount) {
  const beforeHard = optimizerHardControlStatus(beforeMetrics);
  const afterHard = optimizerHardControlStatus(afterMetrics);
  const changedCount = oldWeights.reduce((count, weight, index) => {
    return count + (Math.abs(Number(newWeights[index] || 0) - Number(weight || 0)) >= 0.25 ? 1 : 0);
  }, 0);
  const improved = beforeMetrics && afterMetrics
    ? scoreCandidate(newWeights, afterMetrics) < scoreCandidate(oldWeights, beforeMetrics)
    : false;

  setOptimizerSummary(
    "optimizerConstraintSummary",
    optimizerConstraintText(afterMetrics),
    afterHard.hardPass ? (afterHard.returnReview ? "is-warning" : "is-close") : "is-warning",
  );
  setOptimizerSummary("optimizerLockSummary", optimizerScopeText(scope, movableCount), movableCount ? "is-close" : "is-off");
  setOptimizerSummary(
    "optimizerBeforeAfterSummary",
    `Before ${optimizerMetricText(beforeMetrics)} -> after ${optimizerMetricText(afterMetrics)}; ${changedCount} changed.`,
    afterHard.hardPass ? (afterHard.returnReview ? "is-warning" : "is-close") : "is-warning",
  );

  if (afterHard.hardPass) {
    setOptimizerSummary(
      "optimizerFeasibilitySummary",
      afterHard.returnReview
        ? "Feasible under beta and drawdown hard controls; return remains above the excess-review band."
        : "Feasible under return, beta, and drawdown hard controls.",
      afterHard.returnReview ? "is-warning" : "is-close",
    );
  } else if (improved) {
    const reasons = optimizerFailureReasons(afterMetrics, scope, movableCount);
    setOptimizerSummary("optimizerFeasibilitySummary", `Partial improvement; ${reasons.join("; ") || "remaining gap needs revised locks, ticker list, or committee guidance"}.`, "is-warning");
  } else if (beforeHard.hardPass) {
    setOptimizerSummary("optimizerFeasibilitySummary", "Current portfolio already satisfies hard controls; no material optimizer benefit.", "is-close");
  } else {
    const reasons = optimizerFailureReasons(afterMetrics, scope, movableCount);
    setOptimizerSummary("optimizerFeasibilitySummary", `No feasible improvement: ${reasons.join("; ") || "adjust inputs or scope"}.`, "is-off");
  }
}

function legacyOptimizeWeights() {
  if (!requirePermission("execution", "run optimizer")) return;
  if (!priceHistory.length || currentUsEquityTargetReturn === null || currentTargetBeta === null || currentTargetDrawdownBand === null) {
    el("optimizerStatus").textContent = "Load price CSV and make sure equity target return, sleeve beta targets, and sleeve drawdown budgets are valid first.";
    el("optimizerStatus").className = "validation-message is-invalid";
    resetOptimizerExplainability("Waiting for valid target and price data");
    return;
  }

  let best = null;
  const currentWeights = state.holdings.map((holding) => Number(holding.weight || 0));
  const currentMetrics = portfolioMetricsForWeights(currentWeights);
  const scope = readOptimizerScope();
  const movableCount = state.holdings.filter((holding) => holdingMatchesOptimizerScope(holding, scope)).length;
  if (!movableCount) {
    el("optimizerStatus").textContent = "No eligible U.S. equity holdings are available under the current optimization locks and scope.";
    el("optimizerStatus").className = "validation-message is-invalid";
    resetOptimizerExplainability(optimizerScopeText(scope, movableCount));
    setOptimizerSummary("optimizerFeasibilitySummary", optimizerFailureReasons(null, scope, movableCount).join("; "), "is-off");
    return;
  }
  if (!currentMetrics) {
    el("optimizerStatus").textContent = "Optimizer cannot run because there are no usable U.S. equity return pairs against the selected benchmark.";
    el("optimizerStatus").className = "validation-message is-invalid";
    resetOptimizerExplainability("No usable historical price pairs");
    setOptimizerSummary("optimizerFeasibilitySummary", optimizerFailureReasons(null, scope, movableCount).join("; "), "is-off");
    return;
  }
  best = { weights: currentWeights, metrics: currentMetrics, score: scoreCandidate(currentWeights, currentMetrics) };

  for (let index = 0; index < 3500; index += 1) {
    const weights = randomUsEquitySleeveWeights(currentWeights);
    const metrics = portfolioMetricsForWeights(weights);
    const score = scoreCandidate(weights, metrics);
    if (score < best.score) best = { weights, metrics, score };
  }

  best.weights.forEach((weight, index) => {
    state.holdings[index].weight = Number(weight.toFixed(2));
  });
  renderOptimizationAdvice(currentWeights, best.weights, currentMetrics, best.metrics);
  renderOptimizerExplainability(currentWeights, best.weights, currentMetrics, best.metrics, scope, movableCount);
  markVersionChanged("Optimizer changed proposed holding weights");
  logAudit("Optimizer applied", `Suggested weights applied across ${movableCount} eligible holding(s) with region ${scope.region}, asset ${scope.assetClass}, style ${scope.style}`);
  renderHoldings();
  updatePortfolio();

  const returnText = best.metrics.annualizedReturn === null ? "n/a" : percent(best.metrics.annualizedReturn);
  const betaText = best.metrics.beta === null || best.metrics.beta === undefined ? "n/a" : best.metrics.beta.toFixed(2);
  const drawdownText = best.metrics.maxDrawdown === null ? "n/a" : percent(best.metrics.maxDrawdown);
  el("optimizerStatus").textContent = `Suggested weights applied. Backtested return ${returnText}, beta ${betaText}, max drawdown ${drawdownText}.`;
  el("optimizerStatus").className = "validation-message is-valid";
}

function optimizationProfiles() {
  return [
    {
      id: "option-a",
      label: "Option A - Balanced Fit",
      description: "Balances return, sleeve beta, and drawdown gaps.",
      searchSeed: 104729,
      searchIterations: 72,
      fallbackIterations: 32,
      variation: 0.28,
      returnWeight: 12,
      returnExcessWeight: 0.25,
      betaWeight: 1200,
      drawdownWeight: 14,
    },
    {
      id: "option-b",
      label: "Option B - Risk Control",
      description: "Places more weight on staying within the drawdown budget while keeping return and sleeve beta inside tolerance.",
      searchSeed: 224737,
      searchIterations: 96,
      fallbackIterations: 40,
      variation: 0.18,
      returnWeight: 8,
      returnExcessWeight: 0.2,
      betaWeight: 1200,
      drawdownWeight: 28,
    },
    {
      id: "option-c",
      label: "Option C - Return Focus",
      description: "Places more weight on the proposed equity return target while retaining sleeve beta and drawdown controls.",
      searchSeed: 350377,
      searchIterations: 72,
      fallbackIterations: 32,
      variation: 0.42,
      returnWeight: 26,
      returnExcessWeight: 0.12,
      betaWeight: 1200,
      drawdownWeight: 16,
    },
  ];
}

function movableHoldingIndexesForSleeve(definition, holdings = state.holdings) {
  return holdings
    .map((holding, index) => ({ holding, index }))
    .filter((row) => holdingMatchesEquitySleeve(row.holding, definition) && !row.holding.lockedWeight)
    .map((row) => row.index);
}

function capSleeveCandidateWeights(values, total, maximum) {
  if (!values.length || total > values.length * maximum) return null;
  const capped = [...values];
  for (let pass = 0; pass < values.length; pass += 1) {
    const overIndexes = capped.map((value, index) => ({ value, index })).filter((item) => item.value > maximum);
    if (!overIndexes.length) return capped;
    const excess = overIndexes.reduce((sum, item) => sum + (item.value - maximum), 0);
    overIndexes.forEach((item) => { capped[item.index] = maximum; });
    const recipientIndexes = capped.map((value, index) => ({ value, index })).filter((item) => item.value < maximum - 0.0001);
    const capacity = recipientIndexes.reduce((sum, item) => sum + (maximum - item.value), 0);
    if (capacity + 0.0001 < excess) return null;
    recipientIndexes.forEach((item) => {
      capped[item.index] += excess * ((maximum - item.value) / capacity);
    });
  }
  return capped;
}

function directedSleeveBetaWeights(baseWeights, holdings = state.holdings, maxPasses = 80) {
  const weights = [...baseWeights].map((weight) => Number(weight || 0));
  const rows = sampledBacktestRows();
  const minimumWeight = 0.01;
  if (!rows.length) return weights;

  equitySleeveDefinitions().forEach((definition) => {
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const sleeve = equitySleeveBacktestResults(rows, weights, holdings)[definition.key];
      if (!sleeve || sleeve.beta === null || sleeve.targetBeta === null) break;
      if (betaWithinTargetTolerance(sleeve.beta, sleeve.targetBeta)) break;

      const sleeveWeight = Math.max(0.0001, Number(sleeve.proposedWeight || 0));
      const needsLowerBeta = sleeve.beta > sleeve.targetBeta;
      const candidates = holdings
        .map((holding, index) => ({ holding, index }))
        .filter((row) => holdingMatchesEquitySleeve(row.holding, definition) && !row.holding.lockedWeight)
        .map((row) => ({
          ...row,
          beta: tickerBetaForSleeve(row.holding.symbol, definition, rows),
          weight: Number(weights[row.index] || 0),
          maxWeight: singleSecurityMaxPortfolioWeight(row.holding),
        }))
        .filter((row) => Number.isFinite(row.beta));

      const recipients = candidates
        .filter((row) => needsLowerBeta
          ? row.beta < sleeve.beta && row.weight < row.maxWeight - 0.0001
          : row.beta > sleeve.beta && row.weight < row.maxWeight - 0.0001)
        .sort((left, right) => needsLowerBeta ? left.beta - right.beta : right.beta - left.beta);
      const donors = candidates
        .filter((row) => needsLowerBeta
          ? row.beta > sleeve.targetBeta && row.weight > minimumWeight + 0.0001
          : row.beta < sleeve.targetBeta && row.weight > minimumWeight + 0.0001)
        .sort((left, right) => needsLowerBeta ? right.beta - left.beta : left.beta - right.beta);

      if (!recipients.length || !donors.length) break;

      const recipient = recipients[0];
      const donor = donors[0];
      const betaGap = Math.abs(recipient.beta - donor.beta);
      if (betaGap < 0.0001) break;

      const requiredShift = Math.abs(sleeve.beta - sleeve.targetBeta) * sleeveWeight / betaGap;
      const recipientCapacity = Math.max(0, recipient.maxWeight - recipient.weight);
      const donorAvailable = Math.max(0, donor.weight - minimumWeight);
      const shift = Math.min(requiredShift, recipientCapacity, donorAvailable);
      if (shift < 0.001) break;

      weights[recipient.index] += shift;
      weights[donor.index] -= shift;
    }
  });

  return weights;
}

function optimizerSeededRandom(seed) {
  let stateValue = Math.max(1, Number(seed) >>> 0);
  return () => {
    stateValue = (stateValue * 1664525 + 1013904223) >>> 0;
    return stateValue / 4294967296;
  };
}

function optimizerSeedForSleeve(profile, definition, offset = 0) {
  const sleeveOffset = { us: 11, developed: 23, emerging: 37 }[definition.key] || 1;
  return Number(profile.searchSeed || 1) + sleeveOffset + offset;
}

function sleeveHardPass(result) {
  return Boolean(result?.returnPass && result?.betaPass && result?.drawdownPass);
}

function reliableTickerHistory(symbol, rows) {
  const returns = tickerReturnsForRows(symbol, rows);
  const minimumPeriods = Math.max(24, Math.ceil(Math.max(0, rows.length - 1) * 0.75));
  return returns.length >= minimumPeriods;
}

function replacementHoldingFromRecord(holding, record) {
  return {
    ...holding,
    symbol: record.ticker,
    region: record.region,
    styleFactor: record.styleFactor,
    theme: record.theme,
    beta: 0,
    betaMethod: "Auto from market benchmark",
  };
}

function sameMarketStyleReplacementChoices(definition, holdings, rows) {
  const heldTickers = new Set(holdings.map((holding) => String(holding.symbol || "").trim().toUpperCase()));
  return holdings
    .map((holding, holdingIndex) => ({ holding, holdingIndex }))
    .filter((item) => holdingMatchesEquitySleeve(item.holding, definition) && !item.holding.lockedWeight)
    .flatMap((item) => tickerUniverse
      .filter((record) => record.assetClass === "Equity")
      .filter((record) => record.region === item.holding.region)
      .filter((record) => String(record.styleFactor || "").trim().toLowerCase() === String(item.holding.styleFactor || "").trim().toLowerCase())
      .filter((record) => !heldTickers.has(String(record.ticker || "").trim().toUpperCase()))
      .filter((record) => reliableTickerHistory(record.ticker, rows))
      .map((record) => ({ definition, holdingIndex: item.holdingIndex, holding: item.holding, record })));
}

function sleeveMarketWeightGroups(definition, weights, holdings) {
  const groups = new Map();
  holdings.forEach((holding, index) => {
    if (!holdingMatchesEquitySleeve(holding, definition) || holding.lockedWeight) return;
    const key = definition.key === "emerging" ? holding.region : definition.key;
    const current = groups.get(key) || { indexes: [], total: 0 };
    current.indexes.push(index);
    current.total += Number(weights[index] || 0);
    groups.set(key, current);
  });
  return Array.from(groups.values()).filter((group) => group.indexes.length && group.total > 0);
}

function randomSleeveWeights(definition, baseWeights, holdings, random) {
  const weights = [...baseWeights].map((weight) => Number(weight || 0));
  const sleeveWeight = equitySleeveProposedWeight(definition, holdings);
  const maximum = sleeveWeight * singleSecurityMaxSleeveShare() / 100;
  const minimum = sleeveWeight * 0.02;

  sleeveMarketWeightGroups(definition, baseWeights, holdings).forEach((group) => {
    const groupMinimum = Math.min(minimum, group.total / group.indexes.length);
    const remaining = Math.max(0, group.total - (groupMinimum * group.indexes.length));
    const samples = group.indexes.map(() => Math.max(0.001, -Math.log(Math.max(0.000001, random()))));
    const sampleTotal = samples.reduce((sum, sample) => sum + sample, 0) || 1;
    const candidate = samples.map((sample) => groupMinimum + (remaining * sample / sampleTotal));
    const capped = capSleeveCandidateWeights(candidate, group.total, maximum);
    if (!capped) return;
    group.indexes.forEach((holdingIndex, index) => {
      weights[holdingIndex] = capped[index];
    });
  });
  return weights;
}

function directedWeightsForSleeve(definition, baseWeights, holdings, maxPasses = 24) {
  const directed = directedSleeveBetaWeights(baseWeights, holdings, maxPasses);
  return directed.map((weight, index) => (
    holdingMatchesEquitySleeve(holdings[index], definition) ? Number(weight || 0) : Number(baseWeights[index] || 0)
  ));
}

function sleeveSolutionScore(definition, result, weights, baseWeights, holdings, replacementCount, profile) {
  if (!result || result.annualizedReturn === null || result.beta === null || result.maxDrawdown === null) return Number.POSITIVE_INFINITY;
  const returnFloor = Number(result.targetReturn) * (1 - backtestTolerances().returnShortfall);
  const betaTolerance = Math.abs(Number(result.targetBeta)) * backtestTolerances().betaRelative;
  const drawdownLimit = drawdownLimitMagnitude(result.drawdownBand, result.benchmarkMaxDrawdown);
  const returnGap = Math.max(0, returnFloor - Number(result.annualizedReturn));
  const betaGap = Math.max(0, Math.abs(Number(result.beta) - Number(result.targetBeta)) - betaTolerance);
  const drawdownGap = drawdownLimit === null ? 1 : Math.max(0, Math.abs(Number(result.maxDrawdown)) - drawdownLimit);
  const hardPenalty = (returnGap ** 2 * 10_000) + (betaGap ** 2 * 100_000) + (drawdownGap ** 2 * 100_000);
  const reviewPenalty = returnExcessGap(result.annualizedReturn, result.targetReturn) ** 2 * (profile.returnExcessWeight || 0.2);
  const turnover = weights.reduce((sum, weight, index) => (
    holdingMatchesEquitySleeve(holdings[index], definition)
      ? sum + Math.abs(Number(weight || 0) - Number(baseWeights[index] || 0))
      : sum
  ), 0);
  return hardPenalty * 1_000_000 + (replacementCount * 10_000) + reviewPenalty + turnover;
}

function evaluateSleeveCandidate(definition, weights, holdings, baseWeights, profile, replacementCount) {
  const metrics = portfolioMetricsForWeights(weights, holdings);
  const result = metrics?.sleeves?.[definition.key] || null;
  return {
    weights,
    holdings,
    metrics,
    result,
    score: sleeveSolutionScore(definition, result, weights, baseWeights, holdings, replacementCount, profile),
  };
}

function findBestSleeveWeights(definition, baseWeights, holdings, profile, replacementCount = 0, iterations = profile.searchIterations) {
  const random = optimizerSeededRandom(optimizerSeedForSleeve(profile, definition, replacementCount * 997));
  let best = null;
  const assess = (weights) => {
    const candidate = evaluateSleeveCandidate(definition, weights, holdings, baseWeights, profile, replacementCount);
    if (!best || candidate.score < best.score) best = candidate;
    return candidate;
  };

  const startingCandidate = assess([...baseWeights]);
  if (sleeveHardPass(startingCandidate.result)) return startingCandidate;
  const directedCandidate = assess(directedWeightsForSleeve(definition, baseWeights, holdings));
  if (sleeveHardPass(directedCandidate.result)) return directedCandidate;

  for (let index = 0; index < iterations; index += 1) {
    const candidate = assess(randomSleeveWeights(definition, baseWeights, holdings, random));
    if (sleeveHardPass(candidate.result)) return candidate;
  }
  return best;
}

function holdingsWithReplacementChoices(holdings, choices) {
  const candidate = holdings.map((holding) => ({ ...holding }));
  choices.forEach((choice) => {
    candidate[choice.holdingIndex] = replacementHoldingFromRecord(candidate[choice.holdingIndex], choice.record);
  });
  return candidate;
}

function findSleeveOptimization(definition, baseWeights, baseHoldings, profile) {
  const rows = sampledBacktestRows();
  let best = evaluateSleeveCandidate(definition, baseWeights, baseHoldings, baseWeights, profile, 0);
  if (sleeveHardPass(best.result)) return { ...best, replacements: [] };

  const weightOnly = findBestSleeveWeights(definition, baseWeights, baseHoldings, profile, 0);
  if (weightOnly.score < best.score) best = weightOnly;
  if (sleeveHardPass(weightOnly.result)) return { ...weightOnly, replacements: [] };

  const choices = sameMarketStyleReplacementChoices(definition, baseHoldings, rows);
  const directReplacementCandidates = choices.map((choice) => {
    const holdings = holdingsWithReplacementChoices(baseHoldings, [choice]);
    const candidate = evaluateSleeveCandidate(definition, baseWeights, holdings, baseWeights, profile, 1);
    return { ...candidate, replacements: [choice] };
  });
  const directPasses = directReplacementCandidates
    .filter((candidate) => sleeveHardPass(candidate.result))
    .sort((left, right) => left.score - right.score);
  if (directPasses.length) return directPasses[0];

  const closestDirectCandidate = [...directReplacementCandidates]
    .sort((left, right) => left.score - right.score)[0];
  if (closestDirectCandidate) {
    if (closestDirectCandidate.score < best.score) best = closestDirectCandidate;
    const reweighted = findBestSleeveWeights(
      definition,
      baseWeights,
      closestDirectCandidate.holdings,
      profile,
      1,
      profile.fallbackIterations,
    );
    const reweightedWithReplacement = { ...reweighted, replacements: closestDirectCandidate.replacements };
    if (reweightedWithReplacement.score < best.score) best = reweightedWithReplacement;
    if (sleeveHardPass(reweightedWithReplacement.result)) return reweightedWithReplacement;
  }
  return { ...best, replacements: best.replacements || [] };
}

function buildSleeveDrivenOptimizationOption(profile, baseWeights, baseHoldings = state.holdings) {
  let weights = [...baseWeights].map((weight) => Number(weight || 0));
  let holdings = baseHoldings.map((holding) => ({ ...holding }));
  const sleevePlans = {};
  const replacements = [];

  equitySleeveDefinitions().forEach((definition) => {
    const currentMetrics = portfolioMetricsForWeights(weights, holdings);
    const currentSleeve = currentMetrics?.sleeves?.[definition.key];
    const plan = sleeveHardPass(currentSleeve)
      ? {
        weights: [...weights],
        holdings: holdings.map((holding) => ({ ...holding })),
        metrics: currentMetrics,
        result: currentSleeve,
        score: 0,
        replacements: [],
      }
      : findSleeveOptimization(definition, weights, holdings, profile);
    weights = plan.weights.map((weight) => Number(weight || 0));
    holdings = plan.holdings.map((holding) => ({ ...holding }));
    sleevePlans[definition.key] = plan;
    plan.replacements.forEach((replacement) => replacements.push(replacement));
  });

  const metrics = portfolioMetricsForWeights(weights, holdings);
  return {
    ...profile,
    baseWeights: [...baseWeights],
    baseHoldings: baseHoldings.map((holding) => ({ ...holding })),
    weights,
    holdings,
    metrics,
    replacements,
    sleevePlans,
  };
}

function optimizerControlText(metrics) {
  const controls = backtestControlStatus(metrics);
  const sleeveText = controls.hardPass
    ? "All 3 sleeve controls pass"
    : "One or more sleeve controls require review";
  const monitoringReturn = metrics?.annualizedReturn === null ? "n/a" : percent(metrics.annualizedReturn);
  const monitoringDrawdown = metrics?.maxDrawdown === null ? "n/a" : percent(metrics.maxDrawdown);
  return `${sleeveText}; portfolio monitoring return ${monitoringReturn}; portfolio monitoring drawdown ${monitoringDrawdown}.`;
}

function optimizationReasonForSleeve(holding, oldWeight, newWeight, definition, beforeMetrics, afterMetrics) {
  const delta = newWeight - oldWeight;
  const beforeSleeve = beforeMetrics?.sleeves?.[definition.key];
  const afterSleeve = afterMetrics?.sleeves?.[definition.key];
  if (beforeSleeve?.beta !== null && beforeSleeve?.targetBeta !== null && Math.abs(beforeSleeve.beta - beforeSleeve.targetBeta) > 0.05) {
    if (beforeSleeve.beta < beforeSleeve.targetBeta) return delta > 0 ? "Increase sleeve beta exposure." : "Fund higher-beta sleeve exposure.";
    return delta > 0 ? "Increase lower-beta balance." : "Reduce excess sleeve beta exposure.";
  }
  if (afterSleeve?.betaPass) return delta > 0 ? "Reallocate within the sleeve while preserving its market weight." : "Fund the sleeve reallocation.";
  return delta > 0 ? "Improve the combined backtest fit." : "Release weight for the combined backtest fit.";
}

function tickerHasSufficientHistory(symbol, rows) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const usable = rows.filter((row) => Number(row[normalized]) > 0).length;
  return usable >= Math.min(rows.length, 12);
}

function tickerBetaForSleeve(symbol, definition, rows) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const record = tickerBySymbol(normalized);
  return tickerBetaForMarketBenchmark(normalized, record?.region || definition.region, rows);
}

function tickerReturnsForRows(symbol, rows) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previousPrice = Number(rows[index - 1][normalized]);
    const currentPrice = Number(rows[index][normalized]);
    if (previousPrice > 0 && currentPrice > 0) returns.push(currentPrice / previousPrice - 1);
  }
  return returns;
}

function tickerDrawdownForRows(symbol, rows) {
  return maxDrawdownFromReturns(tickerReturnsForRows(symbol, rows));
}

function tickerAnnualizedReturnForRows(symbol, rows) {
  return annualizedReturnFromReturns(tickerReturnsForRows(symbol, rows), selectedBacktestFrequency());
}

function replacementCandidatesForHolding(holding, definition, holdings, rows, sleeveResult, options = {}) {
  const heldTickers = new Set(holdings.map((item) => String(item.symbol || "").trim().toUpperCase()));
  const targetBeta = sleeveResult?.targetBeta;
  const sleeveWeight = Math.max(0.0001, Number(sleeveResult?.proposedWeight || 0));
  const currentTickerBeta = tickerBetaForSleeve(holding.symbol, definition, rows);
  const currentSleeveBeta = sleeveResult?.beta;
  const style = String(holding.styleFactor || "").trim().toLowerCase();
  const allowCrossStyle = Boolean(options.allowCrossStyle);

  return tickerUniverse
    .filter((record) => record.assetClass === "Equity")
    .filter((record) => record.region === holding.region)
    .filter((record) => allowCrossStyle || String(record.styleFactor || "").trim().toLowerCase() === style)
    .filter((record) => !heldTickers.has(String(record.ticker || "").trim().toUpperCase()))
    .filter((record) => tickerHasSufficientHistory(record.ticker, rows))
    .map((record) => {
      const beta = tickerBetaForSleeve(record.ticker, definition, rows);
      const drawdown = tickerDrawdownForRows(record.ticker, rows);
      const annualizedReturn = tickerAnnualizedReturnForRows(record.ticker, rows);
      const estimatedSleeveBeta = Number.isFinite(currentSleeveBeta) && Number.isFinite(currentTickerBeta) && Number.isFinite(beta)
        ? currentSleeveBeta + ((beta - currentTickerBeta) * (Number(holding.weight || 0) / sleeveWeight))
        : null;
      const betaScore = Number.isFinite(targetBeta) && Number.isFinite(estimatedSleeveBeta)
        ? Math.abs(estimatedSleeveBeta - targetBeta) * 10
        : 0;
      const drawdownScore = sleeveResult?.drawdownPass === false && Number.isFinite(drawdown)
        ? Math.abs(drawdown) / 10
        : 0;
      const returnStatus = returnControlStatus(sleeveResult?.annualizedReturn, sleeveResult?.targetReturn);
      const returnScore = Number.isFinite(annualizedReturn)
        ? (
          sleeveResult?.returnPass === false
            ? -annualizedReturn / 20
            : (returnStatus.review ? Math.abs(annualizedReturn - Number(sleeveResult.targetReturn || 0)) / 12 : 0)
        )
        : 0;
      const stylePenalty = allowCrossStyle && String(record.styleFactor || "").trim().toLowerCase() !== style ? 2 : 0;
      return {
        record,
        beta,
        drawdown,
        annualizedReturn,
        estimatedSleeveBeta,
        distance: Number.isFinite(targetBeta) && Number.isFinite(estimatedSleeveBeta)
          ? Math.abs(estimatedSleeveBeta - targetBeta)
          : Number.POSITIVE_INFINITY,
        priority: betaScore + drawdownScore + returnScore + stylePenalty,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.beta))
    .sort((left, right) => left.priority - right.priority || left.distance - right.distance || Math.abs(left.drawdown || 0) - Math.abs(right.drawdown || 0));
}

function buildTickerReplacementChoices(baseMetrics, baseWeights, rows, options = {}) {
  const failedSleeves = equitySleeveDefinitions()
    .filter((definition) => {
      const result = baseMetrics?.sleeves?.[definition.key];
      return result && (!result.returnPass || result.returnReview || !result.betaPass || !result.drawdownPass);
    });
  const targetSleeves = failedSleeves.length ? failedSleeves : equitySleeveDefinitions();
  const bySleeve = targetSleeves.map((definition) => {
    const sleeveResult = baseMetrics.sleeves[definition.key];
    return state.holdings
      .map((holding, index) => ({ holding, index }))
      .filter((item) => holdingMatchesEquitySleeve(item.holding, definition) && !item.holding.lockedWeight)
      .flatMap((item) => replacementCandidatesForHolding(item.holding, definition, state.holdings, rows, sleeveResult, options)
        .slice(0, 3)
        .map((candidate) => ({
          definition,
          holdingIndex: item.index,
          holding: item.holding,
          candidate,
          priority: candidate.priority,
          baseWeight: Number(baseWeights[item.index] || 0),
        })));
  });
  return bySleeve.flatMap((choices) => choices.sort((left, right) => left.priority - right.priority).slice(0, 6));
}

function replacementSetsFromChoices(choices, size, maximum = 96) {
  const sets = [];
  const visit = (start, selected) => {
    if (sets.length >= maximum) return;
    if (selected.length === size) {
      sets.push(selected);
      return;
    }
    for (let index = start; index < choices.length; index += 1) {
      const choice = choices[index];
      const conflicts = selected.some((item) => (
        item.holdingIndex === choice.holdingIndex
        || item.candidate.record.ticker === choice.candidate.record.ticker
      ));
      if (!conflicts) visit(index + 1, [...selected, choice]);
      if (sets.length >= maximum) return;
    }
  };
  visit(0, []);
  return sets;
}

function replacementHoldings(baseHoldings, replacements) {
  const holdings = baseHoldings.map((holding) => ({ ...holding }));
  replacements.forEach((replacement) => {
    const record = replacement.candidate.record;
    holdings[replacement.holdingIndex] = {
      ...holdings[replacement.holdingIndex],
      symbol: record.ticker,
      region: record.region,
      styleFactor: record.styleFactor,
      theme: record.theme,
      beta: 0,
      betaMethod: "Auto from market benchmark",
    };
  });
  return holdings;
}

function equityStyleTickerCountsForHoldings(holdings, definition) {
  return Object.fromEntries(equityStyleTickerKeys.map((styleKey) => {
    const symbols = new Set(holdings
      .filter((holding) => holdingMatchesEquitySleeve(holding, definition))
      .filter((holding) => String(holding.styleFactor || "").trim().toLowerCase() === styleKey)
      .map((holding) => String(holding.symbol || "").trim().toUpperCase())
      .filter(Boolean));
    return [styleKey, symbols.size];
  }));
}

function equityStyleTickerCountsPass(holdings) {
  const tickerRange = styleTickerRange();
  return equitySleeveDefinitions().every((definition) => {
    const targetWeight = readNumber(el(equityMarketInputConfig[definition.key].targetWeightId));
    if (targetWeight <= 0) return true;
    const counts = equityStyleTickerCountsForHoldings(holdings, definition);
    return equityStyleTickerKeys.every((styleKey) => (
      counts[styleKey] >= tickerRange.low && counts[styleKey] <= tickerRange.high
    ));
  });
}

function tiltWeightsTowardSleeveBetas(baseWeights, holdings) {
  const weights = [...baseWeights];
  const rows = sampledBacktestRows();
  const minimum = 0.01;
  if (!rows.length) return weights;

  equitySleeveDefinitions().forEach((definition) => {
    const maximum = readNumber(el(equityMarketInputConfig[definition.key].targetWeightId)) * singleSecurityMaxSleeveShare() / 100;
    for (let pass = 0; pass < 12; pass += 1) {
      const sleeve = equitySleeveBacktestResults(rows, weights, holdings)[definition.key];
      if (!sleeve || sleeve.beta === null || sleeve.targetBeta === null || betaWithinTargetTolerance(sleeve.beta, sleeve.targetBeta)) break;
      const candidates = holdings
        .map((holding, index) => ({ holding, index }))
        .filter((item) => holdingMatchesEquitySleeve(item.holding, definition) && !item.holding.lockedWeight)
        .map((item) => ({ ...item, beta: tickerBetaForSleeve(item.holding.symbol, definition, rows) }))
        .filter((item) => Number.isFinite(item.beta));
      if (candidates.length < 2) break;

      const needsHigherBeta = sleeve.beta < sleeve.targetBeta;
      const ordered = [...candidates].sort((left, right) => left.beta - right.beta);
      const recipient = needsHigherBeta ? ordered[ordered.length - 1] : ordered[0];
      const donor = needsHigherBeta ? ordered[0] : ordered[ordered.length - 1];
      const betaGap = Math.abs(recipient.beta - donor.beta);
      const sleeveWeight = Math.max(0.0001, Number(sleeve.proposedWeight || 0));
      const requiredShift = Math.abs(sleeve.targetBeta - sleeve.beta) * sleeveWeight / Math.max(betaGap, 0.0001);
      const recipientCapacity = Math.max(0, maximum - Number(weights[recipient.index] || 0));
      const donorAvailable = Math.max(0, Number(weights[donor.index] || 0) - minimum);
      const shift = Math.min(requiredShift, recipientCapacity, donorAvailable);
      if (shift < 0.001) break;
      weights[recipient.index] += shift;
      weights[donor.index] -= shift;
    }
  });
  return weights;
}

function fitTickerReplacementPlan(replacements, baseWeights, baseMetrics) {
  const holdings = replacementHoldings(state.holdings, replacements);
  const styleCountsPass = equityStyleTickerCountsPass(holdings);
  const directMetrics = portfolioMetricsForWeights(baseWeights, holdings);
  let best = {
    weights: [...baseWeights],
    metrics: directMetrics,
    score: scoreOptimizationOption(baseWeights, directMetrics, optimizationProfiles()[0], holdings),
  };
  const tiltedWeights = tiltWeightsTowardSleeveBetas(baseWeights, holdings);
  const tiltedMetrics = portfolioMetricsForWeights(tiltedWeights, holdings);
  const tiltedScore = scoreOptimizationOption(tiltedWeights, tiltedMetrics, optimizationProfiles()[0], holdings);
  if (tiltedScore < best.score) best = { weights: tiltedWeights, metrics: tiltedMetrics, score: tiltedScore };
  const profiles = [optimizationProfiles()[0]];
  profiles.forEach((profile) => {
    const option = createOptimizationOption({ ...profile, variation: Math.max(profile.variation, 0.5) }, tiltedWeights, tiltedMetrics, holdings, 60);
    if (option.score < best.score) best = option;
  });
  return {
    id: `ticker-replacement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    replacements,
    holdings,
    weights: best.weights,
    metrics: best.metrics,
    score: best.score,
    baseMetrics,
    feasible: styleCountsPass && backtestControlStatus(best.metrics).hardPass,
    styleCountsPass,
    accepted: false,
  };
}

function findMinimalTickerReplacementPlan(baseWeights, baseMetrics) {
  return {
    feasible: false,
    baseMetrics,
    message: "The legacy multi-ticker search is retired. Use the independent sleeve optimizer, which tests reweighting and minimal single-ticker replacements without blocking the user interface.",
  };
}

function metricPercentText(value) {
  return Number.isFinite(Number(value)) ? percent(Number(value)) : "n/a";
}

function sleeveBacktestIssueList(metrics) {
  const issues = [];
  equitySleeveDefinitions().forEach((definition) => {
    const sleeve = metrics?.sleeves?.[definition.key];
    if (!sleeve) {
      issues.push(`${definition.label}: no usable backtest data.`);
      return;
    }
    const parts = [];
    if (!sleeve.returnPass) {
      parts.push(`return ${metricPercentText(sleeve.annualizedReturn)} vs target ${metricPercentText(sleeve.targetReturn)}`);
    } else if (sleeve.returnReview) {
      parts.push(`return ${metricPercentText(sleeve.annualizedReturn)} is above the excess-review band for target ${metricPercentText(sleeve.targetReturn)}`);
    }
    if (!sleeve.betaPass) {
      const tolerance = Number.isFinite(Number(sleeve.targetBeta))
        ? Math.abs(Number(sleeve.targetBeta) * backtestTolerances().betaRelative)
        : null;
      const beta = Number.isFinite(Number(sleeve.beta)) ? Number(sleeve.beta).toFixed(2) : "n/a";
      const target = Number.isFinite(Number(sleeve.targetBeta)) ? Number(sleeve.targetBeta).toFixed(2) : "n/a";
      parts.push(`beta ${beta} vs target ${target}${tolerance === null ? "" : ` (+/-${tolerance.toFixed(2)})`}`);
    } else if (sleeve.betaReview) {
      const beta = Number.isFinite(Number(sleeve.beta)) ? Number(sleeve.beta).toFixed(2) : "n/a";
      const target = Number.isFinite(Number(sleeve.targetBeta)) ? Number(sleeve.targetBeta).toFixed(2) : "n/a";
      parts.push(`low beta review ${beta} vs target ${target}`);
    }
    if (!sleeve.drawdownPass) {
      parts.push(`drawdown ${metricPercentText(sleeve.maxDrawdown)} vs budget ${sleeve.drawdownBand ? formatDrawdownBand(sleeve.drawdownBand) : "n/a"}`);
    }
    if (parts.length) issues.push(`${definition.label}: ${parts.join("; ")}.`);
  });
  return issues;
}

function sleeveReplacementGuidance(metrics) {
  return equitySleeveDefinitions().map((definition) => {
    const sleeve = metrics?.sleeves?.[definition.key];
    if (!sleeve) return `${definition.label}: add tickers with complete historical prices for this sleeve and its locked benchmark.`;
    const actions = [];
    if (!sleeve.betaPass && Number.isFinite(Number(sleeve.beta)) && Number.isFinite(Number(sleeve.targetBeta))) {
      actions.push(sleeve.beta > sleeve.targetBeta ? "look for lower-beta candidates" : "look for higher-beta candidates");
    }
    if (!sleeve.drawdownPass) actions.push("prefer lower-drawdown or broader ETF candidates");
    if (!sleeve.returnPass) actions.push("review whether the selected names can support the sleeve target return");
    if (sleeve.returnReview) actions.push("seek steadier candidates because excess return may come from stock-specific risk");
    return actions.length
      ? `${definition.label}: ${actions.join("; ")}.`
      : `${definition.label}: no ticker replacement action required.`;
  });
}

function renderNoFeasibleTickerReplacementPlan(plan) {
  const advice = el("tickerReplacementAdvice");
  if (!advice) return;
  const metrics = plan?.baseMetrics || portfolioMetricsForWeights(state.holdings.map((holding) => Number(holding.weight || 0)));
  const panel = document.createElement("div");
  panel.className = "optimizer-blocker";

  const title = document.createElement("strong");
  title.textContent = "No approval-ready plan yet";
  panel.append(title);

  const summary = document.createElement("p");
  summary.textContent = "The current proposed portfolio cannot move to committee approval. The Execution Team should return to portfolio construction, keep the approved sleeve weights, and change the ticker set or expand the approved ticker universe.";
  panel.append(summary);

  const issueList = document.createElement("ul");
  sleeveBacktestIssueList(metrics).slice(0, 5).forEach((issue) => {
    const item = document.createElement("li");
    item.textContent = issue;
    issueList.append(item);
  });
  if (!issueList.children.length) {
    const item = document.createElement("li");
    item.textContent = "No detailed sleeve issue was available. Refresh historical prices and run the backtest again.";
    issueList.append(item);
  }
  panel.append(issueList);

  const guidanceLines = sleeveReplacementGuidance(metrics)
    .filter((line) => !line.includes("no ticker replacement action required"));
  if (guidanceLines.length) {
    const guidance = document.createElement("p");
    guidance.className = "optimizer-blocker-next";
    guidance.textContent = guidanceLines.join(" ");
    panel.append(guidance);
  }
  advice.append(panel);
}

function renderTickerReplacementPlan() {
  const status = el("tickerReplacementStatus");
  const advice = el("tickerReplacementAdvice");
  const accept = el("acceptTickerReplacementPlanButton");
  if (!status || !advice || !accept) return;
  advice.replaceChildren();
  accept.disabled = true;

  if (!tickerReplacementPlan) {
    status.textContent = "Ticker replacements, when needed, are included directly in the three sleeve optimization options.";
    status.className = "validation-message";
    return;
  }
  if (!tickerReplacementPlan.feasible) {
    status.textContent = tickerReplacementPlan.message;
    status.className = "validation-message is-invalid";
    renderNoFeasibleTickerReplacementPlan(tickerReplacementPlan);
    return;
  }

  const controls = backtestControlStatus(tickerReplacementPlan.metrics);
  status.textContent = `Backtest-passing plan found with ${tickerReplacementPlan.replacements.length} ticker replacement${tickerReplacementPlan.replacements.length === 1 ? "" : "s"} using ${tickerReplacementPlan.modeLabel || "same-market"} search. Sleeve weight, market, style-count, and security-count constraints are preserved.`;
  status.className = controls.returnReview ? "validation-message is-warning" : "validation-message is-valid";

  const result = document.createElement("p");
  result.className = "optimizer-option-metrics";
  result.textContent = `${optimizerControlText(tickerReplacementPlan.metrics)} ${controls.hardPass ? (controls.returnReview ? "Hard controls pass; return review remains." : "All controls pass.") : "Review required."}`;
  advice.append(result);

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Sleeve", "Replace", "With", "Reason"].forEach((label) => {
    const cell = document.createElement("th");
    cell.textContent = label;
    headRow.append(cell);
  });
  head.append(headRow);
  table.append(head);
  const body = document.createElement("tbody");
  tickerReplacementPlan.replacements.forEach((replacement) => {
    const row = document.createElement("tr");
    const candidateBeta = Number(replacement.candidate.beta).toFixed(2);
    [
      replacement.definition.label,
      replacement.holding.symbol,
      replacement.candidate.record.ticker,
      `Same market; candidate beta ${candidateBeta} against the locked benchmark, with historical drawdown and style-count limits considered.`,
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);
  advice.append(table);
  accept.disabled = tickerReplacementPlan.accepted || !actorCan("execution");
  accept.textContent = tickerReplacementPlan.accepted ? "Ticker Replacement Plan Accepted" : "Accept Ticker Replacement Plan";
}

function acceptTickerReplacementPlan() {
  if (!requirePermission("execution", "accept ticker replacement plan")) return;
  if (!tickerReplacementPlan?.feasible) {
    el("optimizerStatus").textContent = "A backtest-passing ticker replacement plan is required before it can be accepted.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  state.holdings = tickerReplacementPlan.holdings.map((holding, index) => ({
    ...holding,
    weight: Number(tickerReplacementPlan.weights[index] || 0).toFixed(4),
  }));
  tickerReplacementPlan.accepted = true;
  optimizerOptions = [];
  selectedOptimizationOptionId = "";
  markVersionChanged("Minimum ticker replacement plan accepted for committee submission");
  logAudit("Ticker replacement plan accepted", `${tickerReplacementPlan.replacements.length} ticker replacement(s) accepted by the Execution Team`);
  renderHoldings();
  updatePortfolio();
  renderOptimizationOptions();
  renderTickerReplacementPlan();
  el("optimizerSelectionStatus").textContent = "Ticker replacement plan accepted. Submit it for Decision Committee approval.";
  const controls = backtestControlStatus(tickerReplacementPlan.metrics);
  el("optimizerStatus").textContent = controls.returnReview
    ? "Replacement plan applied. Hard controls passed, with return review for possible stock-specific excess return."
    : "Replacement plan applied and backtest controls passed.";
  el("optimizerStatus").className = controls.returnReview ? "validation-message is-warning" : "validation-message is-valid";
}

function renderOptimizationOptions() {
  const advice = el("optimizerAdvice");
  advice.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Optimization Options";
  advice.append(title);

  if (!optimizerOptions.length) {
    const empty = document.createElement("p");
    empty.textContent = "Generate options after a backtest requires adjustment.";
    advice.append(empty);
    renderTickerReplacementPlan();
    return;
  }

  optimizerOptions.forEach((option) => {
    const controls = backtestControlStatus(option.metrics);
    const card = document.createElement("article");
    card.className = `optimizer-option${selectedOptimizationOptionId === option.id ? " is-selected" : ""}`;

    const header = document.createElement("div");
    header.className = "optimizer-option-header";
    const heading = document.createElement("div");
    const name = document.createElement("h4");
    name.textContent = option.label;
    const detail = document.createElement("p");
    detail.textContent = option.description;
    heading.append(name, detail);
    const status = document.createElement("strong");
    status.textContent = controls.hardPass
      ? (controls.returnReview ? "Hard controls pass; return review" : "Meets backtest controls")
      : "Review required";
    status.className = controls.hardPass ? (controls.returnReview ? "is-warning" : "is-close") : "is-off";
    header.append(heading, status);
    card.append(header);

    const metric = document.createElement("p");
    metric.className = "optimizer-option-metrics";
    metric.textContent = optimizerControlText(option.metrics);
    card.append(metric);

    equitySleeveDefinitions().forEach((definition) => {
      const sleeve = option.metrics.sleeves[definition.key];
      const details = document.createElement("details");
      details.className = "optimizer-sleeve-option disclosure-panel";
      const summary = document.createElement("summary");
      const beta = sleeve?.beta === null || sleeve?.beta === undefined ? "n/a" : sleeve.beta.toFixed(2);
      const target = sleeve?.targetBeta === null || sleeve?.targetBeta === undefined ? "n/a" : sleeve.targetBeta.toFixed(2);
      const sleeveReturn = sleeve?.annualizedReturn === null || sleeve?.annualizedReturn === undefined ? "n/a" : percent(sleeve.annualizedReturn);
      const sleeveTargetReturn = sleeve?.targetReturn === null || sleeve?.targetReturn === undefined ? "n/a" : percent(sleeve.targetReturn);
      const sleeveDrawdown = sleeve?.maxDrawdown === null || sleeve?.maxDrawdown === undefined ? "n/a" : percent(sleeve.maxDrawdown);
      const drawdownLimit = sleeve?.drawdownBand ? drawdownLimitMagnitude(sleeve.drawdownBand, sleeve.benchmarkMaxDrawdown) : null;
      const sleeveDrawdownLimit = drawdownLimit === null ? "n/a" : `-${percent(drawdownLimit)}`;
      const sleeveStatus = sleeveHardPass(sleeve) ? "pass" : "review";
      summary.textContent = `${definition.label}: ${sleeveStatus}; return ${sleeveReturn} / ${sleeveTargetReturn}; beta ${beta} / ${target}; drawdown ${sleeveDrawdown} / limit ${sleeveDrawdownLimit}`;
      details.append(summary);

      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Security", "Current", "Suggested", "Change"].forEach((label) => {
        const cell = document.createElement("th");
        cell.textContent = label;
        headRow.append(cell);
      });
      head.append(headRow);
      table.append(head);
      const tableBody = document.createElement("tbody");
      const baseHoldings = option.baseHoldings || state.holdings;
      const proposedHoldings = option.holdings || state.holdings;
      const changes = baseHoldings
        .map((holding, index) => ({
          holding,
          proposedHolding: proposedHoldings[index] || holding,
          oldWeight: Number(option.baseWeights[index] || 0),
          newWeight: Number(option.weights[index] || 0),
        }))
        .filter((row) => holdingMatchesEquitySleeve(row.holding, definition)
          && (Math.abs(row.newWeight - row.oldWeight) >= 0.01 || row.proposedHolding.symbol !== row.holding.symbol))
        .sort((a, b) => Math.abs(b.newWeight - b.oldWeight) - Math.abs(a.newWeight - a.oldWeight));
      if (!changes.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.textContent = "No weight change proposed in this sleeve.";
        row.append(cell);
        tableBody.append(row);
      } else {
        changes.forEach((change) => {
          const row = document.createElement("tr");
          const delta = change.newWeight - change.oldWeight;
          [
            change.proposedHolding.symbol === change.holding.symbol
              ? (change.holding.symbol || "Unnamed")
              : `${change.holding.symbol || "Unnamed"} -> ${change.proposedHolding.symbol}`,
            percent(change.oldWeight),
            percent(change.newWeight),
            `${delta >= 0 ? "+" : ""}${percent(delta)}`,
          ].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
          });
          tableBody.append(row);
        });
      }
      table.append(tableBody);
      details.append(table);
      card.append(details);
    });

    const select = document.createElement("button");
    select.type = "button";
    select.className = "secondary-button";
    select.dataset.selectOptimizationOption = option.id;
    select.textContent = selectedOptimizationOptionId === option.id ? "Selected" : `Select ${option.label}`;
    select.hidden = !actorCan("execution");
    select.disabled = !controls.hardPass || selectedOptimizationOptionId === option.id;
    card.append(select);
    advice.append(card);
  });
  renderTickerReplacementPlan();
}

function selectOptimizationOption(optionId) {
  if (!requirePermission("execution", "select optimization option")) return;
  const option = optimizerOptions.find((item) => item.id === optionId);
  if (!option) return;
  if (!backtestControlStatus(option.metrics).hardPass) {
    el("optimizerStatus").textContent = "Only an option that meets all sleeve return, beta, and drawdown controls can be selected.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  state.holdings = (option.holdings || state.holdings).map((holding, index) => ({
    ...holding,
    weight: Number(option.weights[index] || 0).toFixed(4),
  }));
  selectedOptimizationOptionId = option.id;
  markVersionChanged(`${option.label} selected for committee submission`);
  logAudit("Optimization option selected", `${option.label} selected by the Execution Team`);
  renderHoldings();
  updatePortfolio();
  renderOptimizationOptions();
  el("optimizerSelectionStatus").textContent = `${option.label} selected. Submit it for Decision Committee approval.`;
  const controls = backtestControlStatus(option.metrics);
  el("optimizerStatus").textContent = controls.returnReview
    ? `${option.label} has been applied. Hard controls pass, with return review for possible stock-specific excess return.`
    : `${option.label} has been applied to the proposed portfolio and passed the backtest controls.`;
  el("optimizerStatus").className = controls.returnReview ? "validation-message is-warning" : "validation-message is-valid";
}

async function submitSelectedOptimizationOption() {
  if (!requirePermission("execution", "submit selected optimization option")) return;
  const option = optimizerOptions.find((item) => item.id === selectedOptimizationOptionId);
  const replacementAccepted = Boolean(tickerReplacementPlan?.feasible && tickerReplacementPlan.accepted);
  if (!option && !replacementAccepted) {
    el("optimizerStatus").textContent = "Select a passing weight option or accept a passing ticker replacement plan before submitting for approval.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  if (!currentPortfolioBacktestPass) {
    el("optimizerStatus").textContent = "The selected option must pass the full backtest before it can be submitted for approval.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  state.proposal.proposalStatus = "Submitted for Committee Approval";
  el("proposalStatus").value = state.proposal.proposalStatus;
  const planLabel = replacementAccepted
    ? `Ticker replacement plan (${tickerReplacementPlan.replacements.length} replacement${tickerReplacementPlan.replacements.length === 1 ? "" : "s"})`
    : option.label;
  const backendSubmitted = await submitCurrentPortfolioToBackendForApproval(planLabel);
  if (!backendSubmitted) {
    el("optimizerStatus").textContent = "Submission blocked. The selected portfolio was not accepted by the backend approval workflow.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  markVersionChanged(`${planLabel} submitted for Decision Committee approval`);
  logAudit("Optimization plan submitted", `${planLabel} submitted for Decision Committee approval`);
  el("optimizerSelectionStatus").textContent = `${planLabel} submitted. Waiting for Decision Committee approval.`;
  el("optimizerStatus").textContent = "Submission recorded. The Decision Committee can now review the selected option.";
  el("optimizerStatus").className = "validation-message is-valid";
  updateCommitteeDecision();
  updateWorkflowOverview();
}

function optimizeWeights() {
  if (!requirePermission("execution", "generate optimization options")) return;
  if (!priceHistory.length || currentFinalTargetReturn === null || currentTargetDrawdownBand === null) {
    el("optimizerStatus").textContent = "Load historical prices and confirm the approved annual target return and drawdown limit before generating options.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  const baseWeights = state.holdings.map((holding) => Number(holding.weight || 0));
  const baseMetrics = portfolioMetricsForWeights(baseWeights);
  if (!baseMetrics || !baseMetrics.periods) {
    el("optimizerStatus").textContent = "The optimizer needs usable historical price data for the portfolio and all three sleeve benchmarks.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  if (baseMetrics.targetReturn === null || baseMetrics.targetReturn === undefined) {
    el("optimizerStatus").textContent = "The optimizer needs a proposed equity return target from the approved sleeve targets before generating options.";
    el("optimizerStatus").className = "validation-message is-invalid";
    return;
  }
  optimizerOptions = optimizationProfiles().map((profile) => buildSleeveDrivenOptimizationOption(profile, baseWeights, state.holdings));
  selectedOptimizationOptionId = "";
  const feasibleOptions = optimizerOptions.filter((option) => backtestControlStatus(option.metrics).hardPass);
  const feasibleCount = feasibleOptions.length;
  const reviewCount = feasibleOptions.filter((option) => backtestControlStatus(option.metrics).returnReview).length;
  const cleanFeasibleCount = feasibleOptions.filter((option) => !backtestControlStatus(option.metrics).returnReview).length;
  tickerReplacementPlan = null;
  renderOptimizationOptions();
  el("optimizerSelectionStatus").textContent = "No option selected.";
  if (cleanFeasibleCount) {
    el("optimizerStatus").textContent = `${cleanFeasibleCount} of 3 independent sleeve solutions pass all hard controls. Select one option to submit for approval.`;
    el("optimizerStatus").className = "validation-message is-valid";
  } else if (feasibleCount) {
    el("optimizerStatus").textContent = `${feasibleCount} of 3 independent sleeve solutions meet hard controls. Return-review flags are notes only; select one option to submit for approval.`;
    el("optimizerStatus").className = "validation-message is-warning";
  } else {
    el("optimizerStatus").textContent = "No generated sleeve solution passed every hard control. Review the sleeve rows to see whether a return, beta, or drawdown constraint remains binding.";
    el("optimizerStatus").className = "validation-message is-warning";
  }
  logAudit("Optimization options generated", `${feasibleCount} of 3 independently solved sleeve options met hard controls; ${reviewCount} return-review note option(s)`);
}

let optimizerRunQueued = false;
function scheduleOptimizeWeights() {
  if (optimizerRunQueued) return;
  optimizerRunQueued = true;
  el("optimizerStatus").textContent = "Generating optimization options...";
  el("optimizerStatus").className = "validation-message is-warning";
  window.setTimeout(() => {
    optimizerRunQueued = false;
    optimizeWeights();
  }, 0);
}

function implementationApprovalCanApprove() {
  const manager = state.proposal.executionManager || "Execution Manager";
  return validateUsers().ok
    && isActiveUserInGroup(manager, "Execution Team")
    && !invalidCommitteeApprovers(state.committee).length
    && currentTargetReturnApproved
    && dataQuality.price.ok
    && dataQuality.tickerUniverse.ok
    && currentPortfolioBacktestPass;
}

function clearBlockedImplementationApprovals() {
  if (implementationApprovalCanApprove()) return false;
  let changed = false;
  state.committee.forEach((member) => {
    if (member.status === "Approve") {
      member.status = "Pending";
      member.decidedAt = "";
      changed = true;
    }
  });
  return changed;
}

function updateCommitteeDecision() {
  // A persisted committee approval remains valid after a browser reload. Local
  // backtest inputs are recomputed asynchronously and must not erase it.
  if (hasBackendApprovedPortfolio()) {
    restoreCommitteeApprovalFromBackendPortfolio();
    const decision = el("approvalDecision");
    const implementation = el("implementationStatus");
    const manager = state.proposal.executionManager || "Execution Manager";
    decision.textContent = `Approval decision: approved for implementation. The decision committee approver approved ${manager}'s backtested proposed portfolio.`;
    decision.className = "approval-decision is-valid";
    implementation.textContent = "Implementation status: ready. The approved portfolio can move to concrete investment execution.";
    implementation.className = "implementation-status is-valid";
    if (!state.portfolioVersion.locked) lockApprovedVersion();
    return;
  }

  clearBlockedImplementationApprovals();
  const statuses = state.committee.map((member) => member.status);
  const approvals = statuses.filter((status) => status === "Approve").length;
  const rejections = statuses.filter((status) => status === "Reject").length;
  const decision = el("approvalDecision");
  const implementation = el("implementationStatus");
  const manager = state.proposal.executionManager || "Execution Manager";
  const userStatus = validateUsers();
  const invalidApprovers = invalidCommitteeApprovers(state.committee);

  if (!userStatus.ok) {
    decision.textContent = userStatus.message;
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: blocked. User administration must be valid before approval.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (!isActiveUserInGroup(manager, "Execution Team")) {
    decision.textContent = `Approval decision: not ready. ${manager} must be an active execution team user before submitting a proposed portfolio.`;
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: blocked. Execution manager is not an active execution team user.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (invalidApprovers.length) {
    decision.textContent = `Approval decision: blocked. ${invalidApprovers.map((member) => member.member || member.role).join(", ")} must be an active decision committee approver.`;
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: blocked. Committee approval identity is invalid.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (!currentTargetReturnApproved) {
    decision.textContent = "Approval decision: not ready. The annual target return must be approved by the Decision Committee before the proposed portfolio can be approved for implementation.";
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: blocked. Annual target return approval is required before investment execution.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (!dataQuality.price.ok || !dataQuality.tickerUniverse.ok) {
    decision.textContent = "Approval decision: not ready. Historical price data and ticker universe must pass data quality checks before implementation approval.";
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: blocked. Required data quality checks have failed.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (!currentPortfolioBacktestPass) {
    decision.textContent = `Approval decision: not ready. ${manager}'s proposed equity portfolio must pass all sleeve return, beta, and drawdown controls plus the proposed-equity summary checks before committee approval for implementation.`;
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: blocked. The proposed portfolio has not passed the required return, beta, and drawdown controls.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (rejections > 0) {
    decision.textContent = `Approval decision: rejected. The decision committee approver rejected ${manager}'s proposed portfolio.`;
    decision.className = "approval-decision is-invalid";
    implementation.textContent = "Implementation status: rejected. Investment execution cannot proceed.";
    implementation.className = "implementation-status is-invalid";
    return;
  }

  if (approvals === state.committee.length) {
    decision.textContent = `Approval decision: approved for implementation. The decision committee approver approved ${manager}'s backtested proposed portfolio.`;
    decision.className = "approval-decision is-valid";
    implementation.textContent = "Implementation status: ready. The approved portfolio can move to concrete investment execution.";
    implementation.className = "implementation-status is-valid";
    if (!state.portfolioVersion.locked) lockApprovedVersion();
    syncPortfolioApprovalToBackend();
    return;
  }

  decision.textContent = `Approval decision: pending. ${approvals} of ${state.committee.length} decision approval received.`;
  decision.className = "approval-decision";
  implementation.textContent = "Implementation status: pending. Final committee approval is required before investment execution.";
  implementation.className = "implementation-status";
}

function updateTargetApprovalDecision() {
  const statuses = state.targetCommittee.map((member) => member.status);
  const approvals = statuses.filter((status) => status === "Approve").length;
  const rejections = statuses.filter((status) => status === "Reject").length;
  const decision = el("targetApprovalDecision");
  const userStatus = validateUsers();
  const invalidApprovers = invalidCommitteeApprovers(state.targetCommittee);

  currentTargetReturnApproved = false;

  if (backendState.approvedTargetPackage && Number.isFinite(Number(backendState.approvedTargetPackage.finalTargetReturn))) {
    currentFinalTargetReturn = Number(backendState.approvedTargetPackage.finalTargetReturn);
    currentTargetReturnApproved = true;
    decision.textContent = `Target return approval: loaded approved backend target ${percent(currentFinalTargetReturn)}.`;
    decision.className = "approval-decision is-valid";
    updateCommitteeDecision();
    return;
  }

  if (!userStatus.ok) {
    decision.textContent = userStatus.message;
    decision.className = "approval-decision is-invalid";
    updateCommitteeDecision();
    return;
  }

  if (invalidApprovers.length) {
    decision.textContent = `Target return approval: blocked. ${invalidApprovers.map((member) => member.member || member.role).join(", ")} must be active decision committee user(s).`;
    decision.className = "approval-decision is-invalid";
    updateCommitteeDecision();
    return;
  }

  if (currentFinalTargetReturn === null) {
    decision.textContent = "Target return approval: not ready. Enter valid target-return assumptions inside the approved ranges.";
    decision.className = "approval-decision is-invalid";
    updateCommitteeDecision();
    return;
  }

  if (currentFinalTargetReturn <= 0) {
    decision.textContent = "Target return approval: not ready. Final annual target return must be greater than 0%. Adjust the committee-selected market outlook value or other assumptions.";
    decision.className = "approval-decision is-invalid";
    updateCommitteeDecision();
    return;
  }

  if (!currentCpiSourcePass) {
    decision.textContent = "Target return approval: not ready. CPI estimate needs at least two included numeric source values.";
    decision.className = "approval-decision is-invalid";
    updateCommitteeDecision();
    return;
  }

  if (rejections > 0) {
    decision.textContent = "Target return approval: rejected by the decision committee approver.";
    decision.className = "approval-decision is-invalid";
    updateCommitteeDecision();
    return;
  }

  if (approvals === state.targetCommittee.length) {
    currentTargetReturnApproved = true;
    decision.textContent = `Target return approval: approved by the decision committee approver for the ${percent(currentFinalTargetReturn)} annual target return.`;
    decision.className = "approval-decision is-valid";
    syncTargetPackageToBackend({ approve: true });
    updateCommitteeDecision();
    return;
  }

  decision.textContent = `Target return approval: pending. ${approvals} of ${state.targetCommittee.length} decision approval received for the ${percent(currentFinalTargetReturn)} annual target return.`;
  decision.className = "approval-decision";
  updateCommitteeDecision();
}

function setTargetReturnApproval(decisionStatus) {
  if (!requirePermission("decision", `${decisionStatus.toLowerCase()} target return`)) return;
  if (decisionStatus === "Approve") {
    if (currentFinalTargetReturn === null) {
      el("targetApprovalDecision").textContent = "Target return approval: not ready. Enter valid target-return assumptions inside the approved ranges.";
      el("targetApprovalDecision").className = "approval-decision is-invalid";
      return;
    }
    if (currentFinalTargetReturn <= 0) {
      el("targetApprovalDecision").textContent = "Target return approval: not ready. Final annual target return must be greater than 0%.";
      el("targetApprovalDecision").className = "approval-decision is-invalid";
      return;
    }
    if (!currentCpiSourcePass) {
      el("targetApprovalDecision").textContent = "Target return approval: not ready. CPI estimate needs at least two included numeric source values.";
      el("targetApprovalDecision").className = "approval-decision is-invalid";
      return;
    }
  }
  if (!state.targetCommittee.length) {
    state.targetCommittee = [{ role: "Decision Committee Approver", member: state.userCredentials.decision.username, status: "Pending", note: "" }];
  }
  const approver = state.targetCommittee[0];
  approver.member = currentAuditActor();
  approver.status = decisionStatus;
  approver.note = decisionStatus === "Approve"
    ? `Approved annual target return ${el("targetRateLarge").textContent}`
    : `Rejected annual target return ${el("targetRateLarge").textContent}`;
  approver.decidedAt = new Date().toISOString();
  renderTargetCommittee();
  updateTargetApprovalDecision();
  logAudit("Target return approval action", `${decisionStatus} by ${currentAuditActor()}`);
}

function renderCommitteeGroup(containerId, committee, onStatusChange) {
  const container = el(containerId);
  const template = el("committeeTemplate");
  container.replaceChildren();

  committee.forEach((member) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const role = card.querySelector(".committee-role");
    const memberName = card.querySelector(".committee-member");
    const status = card.querySelector(".committee-status");
    const timestamp = card.querySelector(".committee-timestamp");
    const decisionButtons = Array.from(card.querySelectorAll("[data-committee-decision]"));
    const syncDecisionButtons = () => {
      const implementationApproveBlocked = containerId === "committeeRows" && !implementationApprovalCanApprove();
      const exceptionDecisionBlocked = containerId === "exceptionCommitteeRows"
        && (!exceptionTicker() || !exceptionReasonProvided());
      decisionButtons.forEach((button) => {
        button.disabled = exceptionDecisionBlocked
          || (button.dataset.committeeDecision === "Approve" && implementationApproveBlocked);
        button.title = exceptionDecisionBlocked
          ? "Execution Team must enter the exception scope/ticker and reason before committee approval."
          : "";
        button.classList.toggle("is-active", button.dataset.committeeDecision === member.status);
        button.setAttribute("aria-pressed", button.dataset.committeeDecision === member.status ? "true" : "false");
      });
    };
    const applyDecision = (decisionStatus) => {
      if (!requirePermission("decision", "change approval decision")) {
        status.value = member.status;
        syncDecisionButtons();
        return;
      }
      if (containerId === "committeeRows" && decisionStatus === "Approve" && !implementationApprovalCanApprove()) {
        member.status = "Pending";
        status.value = member.status;
        member.decidedAt = "";
        timestamp.textContent = formatDecisionTimestamp(member.decidedAt);
        syncDecisionButtons();
        logAudit("Approval decision blocked", "Implementation approval was blocked because the proposed portfolio is not approval-ready.");
        onStatusChange();
        return;
      }
      member.status = decisionStatus;
      status.value = member.status;
      member.decidedAt = member.status === "Pending" ? "" : new Date().toISOString();
      timestamp.textContent = formatDecisionTimestamp(member.decidedAt);
      syncDecisionButtons();
      logAudit("Approval decision changed", `${member.member || member.role} set ${member.role} decision to ${member.status}`);
      onStatusChange();
    };

    role.value = member.role;
    memberName.value = member.member;
    status.value = member.status;
    timestamp.textContent = formatDecisionTimestamp(member.decidedAt);
    syncDecisionButtons();

    role.addEventListener("input", () => { member.role = role.value; });
    memberName.addEventListener("input", () => {
      member.member = memberName.value;
      onStatusChange();
    });
    status.addEventListener("change", () => {
      applyDecision(status.value);
    });
    decisionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyDecision(button.dataset.committeeDecision || "Pending");
      });
    });
    container.append(card);
  });
}

function renderTargetCommittee() {
  renderCommitteeGroup("targetCommitteeRows", state.targetCommittee, updateTargetApprovalDecision);
  updateTargetApprovalDecision();
}

function renderPortfolioVersion() {
  const version = state.portfolioVersion;
  el("portfolioVersionNumber").textContent = `v${version.number}`;
  el("portfolioVersionStatus").textContent = version.status;
  el("portfolioVersionLock").textContent = version.locked ? "Locked" : "Unlocked";
  el("portfolioVersionNote").textContent = version.locked
    ? `Version locked after approval. Last change: ${version.lastChange}. Create a new version before editing approved assumptions or holdings.`
    : `Editable ${version.status} version. Last change: ${version.lastChange}.`;
  el("portfolioVersionNote").className = version.locked
    ? "validation-message is-valid"
    : "validation-message";
}

function markVersionChanged(reason) {
  if (state.portfolioVersion.locked) {
    state.portfolioVersion.status = "Change Requires New Version";
    state.portfolioVersion.lastChange = reason;
    renderPortfolioVersion();
    return;
  }
  state.portfolioVersion.status = "Draft";
  state.portfolioVersion.lastChange = reason;
  renderPortfolioVersion();
}

function lockApprovedVersion() {
  state.portfolioVersion.status = "Committee Approved";
  state.portfolioVersion.locked = true;
  state.portfolioVersion.lastChange = "Approved by Decision Committee";
  approvedVersionSnapshot = {
    version: state.portfolioVersion.number,
    approvedAt: new Date().toISOString(),
    finalTargetReturn: currentFinalTargetReturn,
    usEquityTargetReturn: currentUsEquityTargetReturn,
    targetBeta: currentTargetBeta,
    holdings: structuredClone(state.holdings),
  };
  logAudit("Portfolio version locked", `v${state.portfolioVersion.number} approved by Decision Committee`);
  renderPortfolioVersion();
}

function createNewPortfolioVersion() {
  if (!requirePermission("execution", "create new portfolio version")) return;
  state.portfolioVersion.number += 1;
  state.portfolioVersion.status = "Draft";
  state.portfolioVersion.locked = false;
  state.portfolioVersion.lastChange = "New version created from prior state";
  approvedVersionSnapshot = null;
  clearBackendPortfolioWorkflowState();
  logAudit("Portfolio version created", `v${state.portfolioVersion.number} created from prior state`);
  state.committee.forEach((member) => { member.status = "Pending"; });
  renderCommittee();
  renderPortfolioVersion();
  updateCommitteeDecision();
}

function resetTargetApproval(options = {}) {
  if (!options.preserveVersionNote) markVersionChanged("Target assumption changed");
  if (!options.keepBackendApprovedTarget) {
    clearBackendTargetWorkflowState();
    clearBackendPortfolioWorkflowState();
  }
  state.targetCommittee.forEach((member) => { member.status = "Pending"; });
  currentTargetReturnApproved = false;
  renderTargetCommittee();
}

function renderCommittee() {
  renderCommitteeGroup("committeeRows", state.committee, updateCommitteeDecision);
  updateCommitteeDecision();
}

function renderExceptionCommittee() {
  renderCommitteeGroup("exceptionCommitteeRows", state.rebalanceExceptionCommittee, updateExceptionApprovalDecision);
  updateExceptionApprovalDecision();
}

function updateProposalFromInputs() {
  if (!requirePermission("execution", "edit proposal metadata")) {
    el("executionManager").value = state.proposal.executionManager;
    el("proposalStatus").value = state.proposal.proposalStatus;
    el("proposalNote").value = state.proposal.proposalNote;
    return;
  }
  state.proposal.executionManager = el("executionManager").value.trim() || state.userCredentials.execution.username;
  state.proposal.proposalStatus = el("proposalStatus").value;
  state.proposal.proposalNote = el("proposalNote").value;
  markVersionChanged("Proposal metadata changed");
  updateCommitteeDecision();
}

function updateRebalanceExceptionFromInputs() {
  if (!requirePermission("execution", "submit rebalance exception")) {
    el("exceptionTicker").value = state.rebalanceException.ticker;
    el("exceptionReason").value = state.rebalanceException.reason;
    return;
  }
  state.rebalanceException.ticker = el("exceptionTicker").value.trim().toUpperCase();
  state.rebalanceException.reason = el("exceptionReason").value;
  updateExceptionApprovalDecision();
}

function tradeValue(order) {
  return Number(order.quantity || 0) * Number(order.price || 0);
}

function tradeRequiresCommittee(order) {
  return tradeValue(order) > readNumber(el("tradeApprovalLimit"));
}

function executionTolerances() {
  const params = normalizeClientSystemConfig(state.systemConfig).businessParameters;
  return {
    quantity: Number(params.executionQuantityTolerance ?? defaults.systemConfig.businessParameters.executionQuantityTolerance),
    value: Number(params.executionValueTolerance ?? defaults.systemConfig.businessParameters.executionValueTolerance),
    weightPp: Number(params.executionWeightTolerancePp ?? defaults.systemConfig.businessParameters.executionWeightTolerancePp),
  };
}

function relativeToleranceAmount(expected, toleranceRate, minimum = 0.0001) {
  const expectedNumber = Math.abs(Number(expected || 0));
  const toleranceNumber = Math.max(0, Number(toleranceRate || 0));
  return Math.max(expectedNumber * toleranceNumber, minimum);
}

function withinRelativeTolerance(actual, expected, toleranceRate, minimum = 0.0001) {
  return Math.abs(Number(actual || 0) - Number(expected || 0)) <= relativeToleranceAmount(expected, toleranceRate, minimum) + 0.000001;
}

function executionToleranceLabel() {
  const tolerances = executionTolerances();
  return `quantity +/-${(tolerances.quantity * 100).toFixed(1)}%, value +/-${(tolerances.value * 100).toFixed(1)}%, holding weight +/-${tolerances.weightPp.toFixed(2)} pp`;
}

function tradeFinalStatus(order) {
  if (!String(order.ticker || "").trim()) return "Incomplete";
  if (!isActiveUserInGroup(order.executionApprover, "Execution Team")) return "Invalid Approver";
  if (order.reasonType === "Exception" && !String(order.remark || "").trim()) return "Incomplete";
  if (order.executionStatus === "Reject" || order.committeeStatus === "Reject") return "Rejected";
  if (tradeRequiresCommittee(order)) {
    if (order.committeeStatus === "Approve") return "Approved by Committee";
    return "Needs Committee Approval";
  }
  if (order.executionStatus === "Approve") return "Authorized by Execution";
  return "Pending Execution Authorization";
}

function updateTradeApprovalSummary() {
  if (!state.tradeOrders.length) {
    el("tradeApprovalSummary").textContent = "Trade authorization summary: no trade orders submitted.";
    el("tradeApprovalSummary").className = "approval-decision";
    return;
  }

  const statuses = state.tradeOrders.map(tradeFinalStatus);
  const rejected = statuses.filter((status) => status === "Rejected").length;
  const approved = statuses.filter((status) => status === "Authorized by Execution" || status === "Approved by Committee").length;
  const needsCommittee = statuses.filter((status) => status === "Needs Committee Approval").length;
  const incomplete = statuses.filter((status) => status === "Incomplete").length;
  const invalidApprover = statuses.filter((status) => status === "Invalid Approver").length;

  el("tradeApprovalSummary").textContent = `Trade authorization summary: ${approved} authorized/approved, ${needsCommittee} need committee approval, ${incomplete} incomplete, ${invalidApprover} invalid authorizer, ${rejected} rejected.`;
  el("tradeApprovalSummary").className = rejected || needsCommittee || incomplete || invalidApprover
    ? "approval-decision is-invalid"
    : "approval-decision is-valid";
}

function tradeKey(action, ticker) {
  return `${String(action || "").trim()}|${String(ticker || "").trim().toUpperCase()}`;
}

function approvedTradeSummaries() {
  return state.tradeOrders.reduce((summary, order) => {
    const finalStatus = tradeFinalStatus(order);
    if (finalStatus !== "Authorized by Execution" && finalStatus !== "Approved by Committee") return summary;
    const key = tradeKey(order.action, order.ticker);
    if (!summary[key]) {
      summary[key] = { action: order.action, ticker: String(order.ticker || "").trim().toUpperCase(), quantity: 0, value: 0, authorizedAt: "" };
    }
    summary[key].quantity += Number(order.quantity || 0);
    summary[key].value += tradeValue(order);
    const authorizedAt = order.authorizedAt || todayIso();
    if (!summary[key].authorizedAt || authorizedAt > summary[key].authorizedAt) summary[key].authorizedAt = authorizedAt;
    return summary;
  }, {});
}

function actualTradeSummaries() {
  return actualTrades.reduce((summary, trade) => {
    const key = tradeKey(trade.action, trade.ticker);
    if (!summary[key]) {
      summary[key] = { action: trade.action, ticker: trade.ticker, quantity: 0, value: 0 };
    }
    summary[key].quantity += Number(trade.quantity || 0);
    summary[key].value += Number(trade.netValue || 0);
    return summary;
  }, {});
}

function authorizedTradeRows() {
  return Object.values(approvedTradeSummaries());
}

function authorizedTradeCompletionRows() {
  const byTicker = new Map();
  authorizedTradeRows().forEach((trade) => {
    const ticker = String(trade.ticker || "").trim().toUpperCase();
    if (!ticker) return;
    if (!byTicker.has(ticker)) {
      byTicker.set(ticker, { ticker, actions: new Set(), quantity: 0, value: 0, authorizedAt: "" });
    }
    const row = byTicker.get(ticker);
    row.actions.add(trade.action || "-");
    row.quantity += Number(trade.quantity || 0);
    row.value += Number(trade.value || 0);
    if (!row.authorizedAt || String(trade.authorizedAt || "") > row.authorizedAt) row.authorizedAt = trade.authorizedAt || todayIso();
  });
  return Array.from(byTicker.values()).map((row) => ({
    ...row,
    actionLabel: Array.from(row.actions).sort().join(" / "),
  }));
}

function tradeCompletionDueDate(trade) {
  const authorizedDate = new Date(trade.authorizedAt || todayIso());
  const base = Number.isNaN(authorizedDate.getTime()) ? effectiveTodayDate() : authorizedDate;
  return addTradingDays(base, 1);
}

function renderTradeHoldingCompletion() {
  const body = el("tradeHoldingCompletionRows");
  const summary = el("tradeHoldingCompletionSummary");
  if (!body || !summary) return;
  body.replaceChildren();

  const rows = authorizedTradeCompletionRows();
  const tolerances = executionTolerances();
  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "No authorized trade rows yet. Authorize trades first, then load next-day holdings to verify completion.";
    emptyRow.append(cell);
    body.append(emptyRow);
    summary.textContent = `Holding completion check: waiting for authorized trades. Tolerance: ${executionToleranceLabel()}.`;
    summary.className = "approval-decision";
    return;
  }

  if (!actualHoldings.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "Authorized trades exist. Load the next actual holdings file to verify whether target weights were reached.";
    emptyRow.append(cell);
    body.append(emptyRow);
    summary.textContent = `Holding completion check: waiting for next holdings load. Tolerance: ${executionToleranceLabel()}.`;
    summary.className = "approval-decision is-warning";
    return;
  }

  let complete = 0;
  let review = 0;
  let pending = 0;
  const latestDate = latestActualHoldingsDate();
  rows.forEach((trade) => {
    const dueDate = tradeCompletionDueDate(trade);
    const dueLabel = dateOnlyLabel(dueDate);
    const dueReached = latestDate && latestDate >= dueDate;
    const targetWeight = approvedWeightByTicker(trade.ticker);
    const actualWeight = actualWeightByTicker(trade.ticker);
    const difference = actualWeight - targetWeight;
    const hasApprovedTarget = targetWeight > 0;
    const sellCloseAllowed = !hasApprovedTarget && trade.actionLabel.includes("Sell") && actualWeight <= tolerances.weightPp + 0.000001;
    const insideTolerance = hasApprovedTarget
      ? Math.abs(difference) <= tolerances.weightPp + 0.000001
      : sellCloseAllowed;
    const status = !dueReached
      ? "Waiting for next-day holdings"
      : (insideTolerance
        ? "Completed within tolerance"
        : (hasApprovedTarget ? "Execution mismatch" : "No approved target"));

    if (!dueReached) pending += 1;
    else if (insideTolerance) complete += 1;
    else review += 1;

    const row = document.createElement("tr");
    [
      trade.ticker,
      trade.actionLabel || "-",
      dueLabel,
      hasApprovedTarget ? percent(targetWeight) : "No target",
      percent(actualWeight),
      percent(difference),
      `+/-${tolerances.weightPp.toFixed(2)} pp`,
      status,
    ].forEach((value, index) => {
      const isStatusColumn = index === 7;
      const cell = document.createElement(isStatusColumn ? "th" : "td");
      cell.textContent = value;
      if (isStatusColumn) cell.className = !dueReached ? "is-warning" : (insideTolerance ? "is-close" : "is-off");
      row.append(cell);
    });
    body.append(row);
  });

  summary.textContent = `Holding completion check: ${complete} completed, ${pending} waiting for next-day holdings, ${review} need review using ${latestDate ? dateOnlyLabel(latestDate) : "latest"} holdings. Tolerance: ${executionToleranceLabel()}.`;
  summary.className = review ? "approval-decision is-invalid" : (pending ? "approval-decision is-warning" : "approval-decision is-valid");
}

function renderTradeReconciliation() {
  const body = el("tradeReconciliationRows");
  body.replaceChildren();

  if (!actualTrades.length) {
    dataQuality.actualTrades = validateActualTradesQuality(actualTrades);
    applyQualityStatus("actualTradesStatus", dataQuality.actualTrades);
    el("tradeReconciliationSummary").textContent = `Trade reconciliation: no actual trade file loaded yet. Tolerance: ${executionToleranceLabel()}.`;
    el("tradeReconciliationSummary").className = "approval-decision";
    renderTradeHoldingCompletion();
    return;
  }

  const approved = approvedTradeSummaries();
  const actual = actualTradeSummaries();
  const keys = Array.from(new Set([...Object.keys(approved), ...Object.keys(actual)]));
  const tolerances = executionTolerances();
  let withinTolerance = 0;
  let exceptions = 0;

  keys.forEach((key) => {
    const approvedTrade = approved[key] || {};
    const actualTrade = actual[key] || {};
    const action = approvedTrade.action || actualTrade.action;
    const ticker = approvedTrade.ticker || actualTrade.ticker;
    const approvedQuantity = Number(approvedTrade.quantity || 0);
    const actualQuantity = Number(actualTrade.quantity || 0);
    const approvedValue = Number(approvedTrade.value || 0);
    const actualValue = Number(actualTrade.value || 0);
    const quantityDiff = actualQuantity - approvedQuantity;
    const valueDiff = actualValue - approvedValue;
    const quantityWithinTolerance = withinRelativeTolerance(actualQuantity, approvedQuantity, tolerances.quantity, 0.0001);
    const valueWithinTolerance = withinRelativeTolerance(actualValue, approvedValue, tolerances.value, 1);
    const status = !approvedQuantity && actualQuantity
      ? "Unapproved actual"
      : (approvedQuantity && !actualQuantity
        ? "Not executed"
        : (quantityWithinTolerance && valueWithinTolerance
          ? (Math.abs(quantityDiff) <= 0.0001 && Math.abs(valueDiff) <= 1 ? "Matched" : "Within tolerance")
          : "Mismatch"));

    if (status === "Matched" || status === "Within tolerance") withinTolerance += 1;
    else exceptions += 1;

    const row = document.createElement("tr");
    [
      action,
      ticker,
      Number(approvedQuantity).toFixed(2),
      Number(actualQuantity).toFixed(2),
	      currency.format(approvedValue),
	      currency.format(actualValue),
	      Number(quantityDiff).toFixed(2),
	      currency.format(valueDiff),
	      status,
	    ].forEach((value, index) => {
	      const isStatusColumn = index === 8;
	      const cell = document.createElement(isStatusColumn ? "th" : "td");
	      cell.textContent = value;
	      if (isStatusColumn) cell.className = status === "Matched" || status === "Within tolerance" ? "is-close" : "is-off";
	      row.append(cell);
	    });
    body.append(row);
  });

  dataQuality.actualTrades = validateActualTradesQuality(actualTrades);
  applyQualityStatus("actualTradesStatus", dataQuality.actualTrades);
  el("tradeReconciliationSummary").textContent = `Trade reconciliation: ${withinTolerance} within tolerance, ${exceptions} exception(s). Tolerance: ${executionToleranceLabel()}.`;
  el("tradeReconciliationSummary").className = exceptions || !dataQuality.actualTrades.ok
    ? "approval-decision is-invalid"
    : "approval-decision is-valid";
  renderTradeHoldingCompletion();
}

function loadActualTrades(file) {
  if (!file) return;
  if (!requirePermission("data", "load actual trades")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const importText = String(reader.result || "");
    try {
      const parsed = parseActualTrades(importText);
      actualTrades = parsed;
      logAudit("Actual trades loaded", `${parsed.length} trade row(s) loaded`);
      renderTradeReconciliation();
      recordDataLoad("actual_trades", file.name, importText, parsed, dataQuality.actualTrades);
      syncImportToBackend("actual_trades", file.name, importText);
    } catch (error) {
      const failedQuality = qualityResult("Fail", "Standard trades CSV export could not be parsed.");
      actualTrades = [];
      dataQuality.actualTrades = failedQuality;
      logAudit("Actual trades load failed", "Standard trades CSV export could not be parsed");
      renderTradeReconciliation();
      dataQuality.actualTrades = failedQuality;
      applyQualityStatus("actualTradesStatus", dataQuality.actualTrades);
      recordDataLoad("actual_trades_failed", file.name, importText, [], failedQuality);
      syncImportToBackend("actual_trades_failed", file.name, importText);
    }
  });
  reader.readAsText(file);
}

function currentAuthorizedTradePrice(trade) {
  const quantity = Number(trade.quantity || 0);
  const value = Number(trade.value || 0);
  if (quantity > 0 && value > 0) return value / quantity;
  const matchingOrder = state.tradeOrders.find((order) => String(order.ticker || "").trim().toUpperCase() === String(trade.ticker || "").trim().toUpperCase());
  return Number(matchingOrder?.price || 0) > 0 ? Number(matchingOrder.price) : 100;
}

function currentApprovedHoldingPrice(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  const matchingTrade = authorizedTradeRows().find((trade) => String(trade.ticker || "").trim().toUpperCase() === normalized);
  if (matchingTrade) return currentAuthorizedTradePrice(matchingTrade);
  return 100;
}

function authorizedTradesToStandardCsv() {
  const tradeRows = authorizedTradeRows();
  const tradeDate = todayIso();
  const settlementDate = dateOnlyLabel(addTradingDays(effectiveTodayDate(), 2));
  const headers = ["TradeDate", "SettlementDate", "Account", "Broker", "Action", "Ticker", "Currency", "Quantity", "Price", "Fees", "NetValue", "ExternalTradeId"];
  const values = tradeRows.map((trade, index) => {
    const price = currentAuthorizedTradePrice(trade);
    const quantity = Number(trade.quantity || 0);
    const value = Number(trade.value || 0);
    return [
      tradeDate,
      settlementDate,
      "Puyan-Test",
      "Broker Normalizer",
      trade.action,
      String(trade.ticker || "").trim().toUpperCase(),
      "USD",
      quantity.toFixed(6),
      price.toFixed(6),
      "0",
      value.toFixed(6),
      `TEST-${tradeDate.replaceAll("-", "")}-${index + 1}`,
    ];
  });
  return `${[headers, ...values].map((row) => row.map(csvSafe).join(",")).join("\n")}\n`;
}

function approvedPortfolioToNextHoldingCsv() {
  const asOfDate = dateOnlyLabel(addTradingDays(effectiveTodayDate(), 1));
  const principal = reportInitialPrincipal() || 100000;
  const headers = ["AsOfDate", "Account", "Broker", "Ticker", "Name", "AssetClass", "Region", "Currency", "Quantity", "Price", "MarketValue", "Weight"];
  const values = state.holdings
    .filter((holding) => String(holding.assetClass || "").toLowerCase() === "equity" && Number(holding.weight || 0) > 0)
    .map((holding) => {
      const ticker = String(holding.symbol || "").trim().toUpperCase();
      const meta = approvedMetaByTicker(ticker);
      const price = currentApprovedHoldingPrice(ticker);
      const marketValue = principal * Number(holding.weight || 0) / 100;
      const quantity = price > 0 ? marketValue / price : 0;
      return [
        asOfDate,
        "Puyan-Test",
        "Broker Normalizer",
        ticker,
        tickerBySymbol(ticker)?.name || ticker,
        "Equity",
        meta.region || holding.region || "",
        "USD",
        quantity.toFixed(6),
        price.toFixed(6),
        marketValue.toFixed(6),
        Number(holding.weight || 0).toFixed(6),
      ];
    });
  return `${[headers, ...values].map((row) => row.map(csvSafe).join(",")).join("\n")}\n`;
}

function loadAuthorizedTradeTestFill() {
  if (!requirePermission("data", "load actual trades")) return;
  const tradeRows = authorizedTradeRows();
  if (!tradeRows.length) {
    dataQuality.actualTrades = qualityResult("Missing", "Authorize trades before generating a test fill CSV.");
    applyQualityStatus("actualTradesStatus", dataQuality.actualTrades);
    renderTradeReconciliation();
    return;
  }

  const tradesText = authorizedTradesToStandardCsv();
  const holdingsText = approvedPortfolioToNextHoldingCsv();
  actualTrades = parseActualTrades(tradesText);
  actualHoldings = parseActualHoldings(holdingsText);
  mergeEquityValueHistory(actualHoldings);
  logAudit("Test broker fill generated", `${actualTrades.length} actual trade row(s) generated from authorized orders`);
  logAudit("Next-day holding snapshot generated", `${actualHoldings.length} holding row(s) generated from approved portfolio`);
  renderActualHoldings();
  renderTradeReconciliation();
  recordDataLoad("test_actual_trades", "authorized_trade_test_fill.csv", tradesText, actualTrades, dataQuality.actualTrades);
  recordDataLoad("test_actual_holdings", "authorized_trade_next_holdings.csv", holdingsText, actualHoldings, dataQuality.actualHoldings);
  syncImportToBackend("test_actual_trades", "authorized_trade_test_fill.csv", tradesText);
  syncImportToBackend("test_actual_holdings", "authorized_trade_next_holdings.csv", holdingsText);
}

function renderTradeOrders() {
  const body = el("tradeOrderRows");
  const template = el("tradeOrderTemplate");
  body.replaceChildren();

  state.tradeOrders.forEach((order, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const action = row.querySelector(".trade-action");
    const ticker = row.querySelector(".trade-ticker");
    const quantity = row.querySelector(".trade-quantity");
    const price = row.querySelector(".trade-price");
    const value = row.querySelector(".trade-value");
    const reasonType = row.querySelector(".trade-reason-type");
    const remark = row.querySelector(".trade-remark");
    const approver = row.querySelector(".trade-approver");
    const executionStatus = row.querySelector(".trade-execution-status");
    const committeeStatus = row.querySelector(".trade-committee-status");
    const finalStatus = row.querySelector(".trade-final-status");
    const remove = row.querySelector(".trade-remove");

    const refreshRow = () => {
      const requiresCommittee = tradeRequiresCommittee(order);
      const status = tradeFinalStatus(order);
      value.textContent = currency.format(tradeValue(order));
      committeeStatus.disabled = !requiresCommittee;
      remark.required = order.reasonType === "Exception";
      remark.placeholder = order.reasonType === "Exception" ? "Required exception remark" : "Optional";
	      finalStatus.textContent = status;
	      finalStatus.className = status.includes("Approved") || status.includes("Authorized") ? "trade-final-status is-close" : "trade-final-status is-off";
	      updateTradeApprovalSummary();
	      renderTradeHoldingCompletion();
	    };

    action.value = order.action;
    ticker.value = order.ticker;
    quantity.value = order.quantity;
    price.value = order.price;
    reasonType.value = order.reasonType || "Compliant";
    remark.value = order.remark || "";
    approver.value = order.executionApprover;
    executionStatus.value = order.executionStatus;
    committeeStatus.value = order.committeeStatus;

    action.addEventListener("change", () => {
      if (!requirePermission("execution", "edit trade action")) { action.value = order.action; return; }
      order.action = action.value; refreshRow(); queueTradeAuthorizationSync();
    });
    ticker.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit trade ticker"); ticker.value = order.ticker; return; }
      order.ticker = ticker.value.trim().toUpperCase(); refreshRow(); queueTradeAuthorizationSync();
    });
    quantity.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit trade quantity"); quantity.value = order.quantity; return; }
      order.quantity = readNumber(quantity); refreshRow(); queueTradeAuthorizationSync();
    });
    price.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit trade price"); price.value = order.price; return; }
      order.price = readNumber(price); refreshRow(); queueTradeAuthorizationSync();
    });
    reasonType.addEventListener("change", () => {
      if (!requirePermission("execution", "edit trade reason")) { reasonType.value = order.reasonType; return; }
      order.reasonType = reasonType.value;
      refreshRow();
      queueTradeAuthorizationSync();
    });
    remark.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit trade remark"); remark.value = order.remark; return; }
      order.remark = remark.value; refreshRow(); queueTradeAuthorizationSync();
    });
    approver.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit trade execution authorizer"); approver.value = order.executionApprover; return; }
      order.executionApprover = approver.value; refreshRow(); queueTradeAuthorizationSync();
    });
    executionStatus.addEventListener("change", () => {
      if (!requirePermission("execution", "change trade authorization status")) { executionStatus.value = order.executionStatus; return; }
      order.executionStatus = executionStatus.value;
      order.authorizedAt = executionStatus.value === "Approve" ? todayIso() : "";
      logAudit("Trade authorization status changed", `${order.action} ${order.ticker || "unassigned ticker"} set to ${order.executionStatus}`);
      refreshRow();
      queueTradeAuthorizationSync();
    });
    committeeStatus.addEventListener("change", () => {
      if (!requirePermission("decision", "change trade committee status")) { committeeStatus.value = order.committeeStatus; return; }
      order.committeeStatus = committeeStatus.value;
      if (committeeStatus.value === "Approve") order.authorizedAt = todayIso();
      logAudit("Trade committee status changed", `${order.action} ${order.ticker || "unassigned ticker"} set to ${order.committeeStatus}`);
      refreshRow();
      queueTradeAuthorizationSync();
    });
    remove.addEventListener("click", () => {
      if (!requirePermission("execution", "remove trade order")) return;
      logAudit("Trade order removed", `${order.action} ${order.ticker || "unassigned ticker"} removed`);
      state.tradeOrders.splice(index, 1);
      renderTradeOrders();
      queueTradeAuthorizationSync();
    });

    refreshRow();
    body.append(row);
  });

  updateTradeApprovalSummary();
  renderTradeReconciliation();
}

function addTradeOrder() {
  if (!requirePermission("execution", "add trade order")) return;
  state.tradeOrders.push({
    action: "Buy",
    ticker: "",
    quantity: 0,
    price: 0,
    reasonType: "Compliant",
    remark: "",
    executionApprover: state.proposal.executionManager || state.userCredentials.execution.username,
    executionStatus: "Pending",
    committeeStatus: "Pending",
    authorizedAt: "",
  });
  logAudit("Trade order added", "New trade order added");
  renderTradeOrders();
  queueTradeAuthorizationSync();
}

function updateBacktestResults() {
  const sampledRows = sampledBacktestRows();
  if (el("backtestWindowStatus")) el("backtestWindowStatus").textContent = backtestWindowSummary(sampledRows);
  if (!priceHistory.length) {
    currentPortfolioBacktestPass = false;
    currentUsEquityReferenceBetaPass = false;
    el("backtestTargetReturn").textContent = "No data";
    el("backtestedReturn").textContent = "No data";
    el("backtestedBeta").textContent = "No data";
    el("backtestedMaxDrawdown").textContent = "No data";
    el("backtestReturnStatus").textContent = "No data";
    el("backtestBetaStatus").textContent = "No data";
    el("backtestDrawdownStatus").textContent = "No data";
    el("backtestReturnStatus").className = "";
    el("backtestBetaStatus").className = "";
    el("backtestDrawdownStatus").className = "";
    el("portfolioDecision").textContent = "Load historical price data to backtest the system-built proposed portfolio return and drawdown plus each sleeve's return, beta, and drawdown controls.";
    el("portfolioDecision").className = "portfolio-decision";
    el("backtestValidation").textContent = "Load historical price data to test the system-built proposed portfolio return and drawdown plus each sleeve's return, beta, and drawdown controls.";
    el("backtestValidation").className = "validation-message";
    el("drawdownRiskAlert").textContent = "Drawdown alert: load historical price data to monitor drawdown risk usage.";
    el("drawdownRiskAlert").className = "drawdown-risk-alert";
    renderEquitySleeveReadiness();
    updatePerformanceReport();
    updateCommitteeDecision();
    updateWorkflowOverview();
    return;
  }

  const weights = state.holdings.map((holding) => Number(holding.weight || 0));
  const metrics = portfolioMetricsForWeights(weights);
  const controls = backtestControlStatus(metrics);
  const backtestTargetReturn = metrics?.targetReturn ?? null;
  const backtestedReturn = metrics?.annualizedReturn ?? null;
  const backtestedDrawdown = metrics?.maxDrawdown ?? null;
  const sleeveResults = metrics?.sleeves || {};
  const sleevePassCount = equitySleeveDefinitions()
    .filter((definition) => sleeveResults[definition.key]?.betaPass === true)
    .length;
  currentUsEquityReferenceBetaPass = Boolean(sleeveResults.us?.betaPass);

  el("backtestTargetReturn").textContent = backtestTargetReturn === null ? "No data" : percent(backtestTargetReturn);
  el("backtestedReturn").textContent = backtestedReturn === null ? "No data" : percent(backtestedReturn);
  el("backtestedBeta").textContent = metrics ? `${sleevePassCount} / 3 pass` : "No data";
  el("backtestedMaxDrawdown").textContent = backtestedDrawdown === null ? "No data" : percent(backtestedDrawdown);
  el("backtestReturnStatus").textContent = metrics ? controls.returnStatus : "No data";
  el("backtestBetaStatus").textContent = metrics ? (controls.sleevePass ? "Pass" : "Review") : "No data";
  el("backtestDrawdownStatus").textContent = metrics ? (controls.drawdownPass ? "Pass" : "Review") : "No data";
  el("backtestReturnStatus").className = controls.returnPass ? (controls.returnReview ? "is-warning" : "is-close") : "is-off";
  el("backtestBetaStatus").className = controls.sleevePass ? "is-close" : "is-off";
  el("backtestDrawdownStatus").className = controls.drawdownPass ? "is-close" : "is-off";
  el("backtestValidation").textContent = metrics?.periods
    ? `Proposed equity portfolio backtest used ${metrics.periods} sampled periods. Approval is based on each sleeve separately: return no lower than ${((1 - backtestTolerances().returnShortfall) * 100).toFixed(0)}% of its target, beta within the ${(backtestTolerances().betaRelative * 100).toFixed(0)}% tolerance, and drawdown within its policy or market-benchmark adjusted limit. Portfolio return and drawdown are monitoring values, not an additional approval gate. Return above ${((1 + backtestTolerances().returnExcessReview) * 100).toFixed(0)}% of target and low beta are review notes only when the sleeve hard controls pass.`
    : "No usable sampled proposed equity return periods. Check historical prices for the selected proposed securities and locked benchmarks.";
  el("backtestValidation").className = metrics?.periods && controls.hardPass
    ? (controls.returnReview ? "validation-message is-warning" : "validation-message is-valid")
    : "validation-message is-invalid";
  el("drawdownRiskAlert").textContent = backtestedDrawdown === null
    ? "Portfolio monitoring: no usable proposed-equity drawdown series."
    : `Portfolio monitoring only: proposed-equity drawdown ${percent(backtestedDrawdown)}; this does not override sleeve approval controls.`;
  el("drawdownRiskAlert").className = "drawdown-risk-alert is-warning";
  currentPortfolioBacktestPass = Boolean(metrics?.periods && controls.hardPass);
  el("portfolioDecision").textContent = currentPortfolioBacktestPass
    ? (controls.returnReview
      ? "Proposed portfolio decision: pass. Return is above the review band; note possible stock-specific excess-return risk in the submission."
      : "Proposed portfolio decision: pass. Each sleeve meets its return, beta, and drawdown controls.")
    : "Proposed portfolio decision: needs optimization. At least one sleeve does not yet meet its return, beta, or drawdown control.";
  el("portfolioDecision").className = currentPortfolioBacktestPass
    ? (controls.returnReview ? "portfolio-decision is-warning" : "portfolio-decision is-valid")
    : "portfolio-decision is-invalid";
  renderEquitySleeveReadiness(sleeveResults);
  updatePerformanceReport();
  updateCommitteeDecision();
  updateWorkflowOverview();
}

function updateBlendedPolicyBenchmark() {
  const rowsBody = el("blendedBenchmarkRows");
  if (!rowsBody) return null;
  const components = blendedPolicyBenchmarkComponents();
  const sampledRows = priceHistory.length ? sampledBacktestRows() : [];
  const proxyHasUsableSeries = (proxy) => {
    for (let index = 1; index < sampledRows.length; index += 1) {
      const previousPrice = Number(sampledRows[index - 1]?.[proxy]);
      const currentPrice = Number(sampledRows[index]?.[proxy]);
      if (previousPrice > 0 && currentPrice > 0) return true;
    }
    return false;
  };
  rowsBody.replaceChildren();

  components.forEach((component) => {
    const available = proxyHasUsableSeries(component.proxy);
    const row = document.createElement("tr");
    [component.sleeve, component.proxy, percent(component.weight), available ? "Available" : "Missing"].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    rowsBody.append(row);
  });

  if (!components.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Set target allocation weights before calculating blended benchmark beta.";
    row.append(cell);
    rowsBody.append(row);
  }

  if (!priceHistory.length) {
    el("blendedBenchmarkBeta").textContent = "No data";
    el("blendedBenchmarkObservations").textContent = "No data";
    el("wholePortfolioBeta").textContent = "No data";
    el("blendedBenchmarkStatus").textContent = "Load Public Data Engine historical prices to calculate portfolio beta versus blended policy benchmark.";
    el("blendedBenchmarkStatus").className = "validation-message";
    return null;
  }

  const missing = components.filter((component) => !proxyHasUsableSeries(component.proxy));
  const pairs = blendedPolicyBenchmarkPairsForWeights(sampledRows, state.holdings.map((holding) => Number(holding.weight || 0)));
  const beta = betaFromPairs(pairs);
  el("blendedBenchmarkBeta").textContent = beta === null ? "No data" : beta.toFixed(2);
  el("blendedBenchmarkObservations").textContent = pairs.length ? String(pairs.length) : "No data";
  el("blendedBenchmarkSource").textContent = "Blended policy benchmark";
  el("wholePortfolioBeta").textContent = beta === null ? "No data" : beta.toFixed(2);

  if (beta === null) {
    el("blendedBenchmarkStatus").textContent = "Blended benchmark beta could not be calculated. Check that Public Data Engine prices include policy proxies and proposed holdings.";
    el("blendedBenchmarkStatus").className = "validation-message is-invalid";
    return null;
  }
  if (missing.length) {
    el("blendedBenchmarkStatus").textContent = `Reference beta calculated with available proxies. Missing benchmark proxy price columns: ${missing.map((item) => item.proxy).join(", ")}.`;
    el("blendedBenchmarkStatus").className = "validation-message is-warning";
  } else {
    el("blendedBenchmarkStatus").textContent = "Reference beta calculated versus blended policy benchmark. This is a monitoring metric, not a sleeve beta hard control.";
    el("blendedBenchmarkStatus").className = "validation-message is-valid";
  }
  return beta;
}

function calculateBetaEstimates() {
  if (!priceHistory.length) {
    betaEstimates = {};
    betaEstimateBenchmarks = {};
    updateBetaEngineStatus();
    return;
  }

  const frequency = el("betaFrequency").value;
  const lookbackMonths = readNumber(el("betaLookback"));
  const sampledRows = resampleRows(filterLookback(priceHistory, lookbackMonths), frequency);
  const holdingsBySymbol = new Map();
  state.holdings
    .filter((holding) => holding.assetClass === "Equity")
    .forEach((holding) => {
      const symbol = String(holding.symbol || "").trim().toUpperCase();
      if (symbol && !holdingsBySymbol.has(symbol)) holdingsBySymbol.set(symbol, holding);
    });

  betaEstimates = {};
  betaEstimateBenchmarks = {};
  holdingsBySymbol.forEach((holding, symbol) => {
    const benchmark = betaBenchmarkProxyForHolding(holding);
    if (!benchmark || benchmark === "manual") return;
    betaEstimateBenchmarks[symbol] = benchmark;
    if (symbol === benchmark) {
      betaEstimates[symbol] = 1;
      return;
    }
    const beta = betaFromPairs(returnPairs(sampledRows, symbol, benchmark));
    if (beta !== null) betaEstimates[symbol] = beta;
  });

  updateBetaEngineStatus(sampledRows.length);
}

function updateBetaEngineStatus(sampleCount = 0) {
  const status = el("betaEngineStatus");
  const benchmark = benchmarkProxy();
  const symbols = Object.keys(betaEstimates);

  if (benchmark === "manual" && !symbols.length) {
    status.textContent = "Manual U.S. benchmark selected. Automatic U.S. equity beta requires a proxy ticker; non-U.S. market benchmarks can still be used where price data exists.";
    status.className = "validation-message is-invalid";
    return;
  }

  if (!priceHistory.length) {
    status.textContent = "No price data loaded yet. Equity auto beta will use placeholder values until historical prices are available.";
    status.className = "validation-message";
    return;
  }

  dataQuality.price = validatePriceQuality(priceHistory);
  const benchmarkPairs = symbols
    .slice(0, 8)
    .map((symbol) => `${symbol}/${betaEstimateBenchmarks[symbol] || benchmark}`)
    .join(", ");
  const moreText = symbols.length > 8 ? ` and ${symbols.length - 8} more` : "";
  const betaMessage = symbols.length
    ? `Calculated market-consistent beta for ${benchmarkPairs}${moreText} using ${sampleCount} sampled price points.`
    : `Price data loaded, but no equity symbols matched their required market benchmark.`;
  status.textContent = `${dataQuality.price.status}: ${dataQuality.price.message} ${betaMessage}`;
  status.className = dataQuality.price.status === "Pass" && symbols.length
    ? "validation-message is-valid"
    : (dataQuality.price.status === "Warning" ? "validation-message is-warning" : "validation-message is-invalid");
}

function applyHistoricalPriceText(importText, fileName, options = {}) {
  const parsed = parseCsv(importText);
  priceHistory = parsed;
  logAudit(options.auditAction || "Historical prices loaded", `${parsed.length} price row(s) loaded from ${fileName}`);
  calculateBetaEstimates();
  updateBenchmarkReference();
  renderHoldings();
  calculate();
  if (options.record !== false) {
    recordDataLoad(options.type || "historical_prices", fileName, importText, parsed, dataQuality.price);
  }
  if (options.sync !== false) {
    syncImportToBackend(options.type || "historical_prices", fileName, importText);
  }
  return parsed;
}

function loadPriceCsv(file) {
  if (!file) return;
  if (!requirePermission("data", "load historical prices")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const importText = String(reader.result || "");
    applyHistoricalPriceText(importText, file.name);
  });
  reader.readAsText(file);
}

async function loadSampleCsv(path, fileName, loader, statusId) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Sample file could not be loaded: ${response.status}`);
    const text = rebaseSampleCsvForReplay(await response.text(), fileName);
    const sampleFile = new File([text], fileName, { type: "text/csv" });
    loader(sampleFile);
    logAudit("Sample data loaded", `${fileName} loaded from ${path}`);
  } catch (error) {
    const status = el(statusId);
    if (status) {
      status.textContent = `Fail: ${error.message}`;
      status.className = "validation-message is-invalid";
    }
    logAudit("Sample data load failed", `${fileName}: ${error.message}`);
    updateWorkflowOverview();
  }
}

function rebaseSampleCsvForReplay(text, fileName) {
  if (!configuredTestDateOverride()) return text;
  if (fileName === "standard_actual_holdings.csv") return rebaseCsvDateColumn(text, "AsOfDate", 0);
  if (fileName === "standard_actual_trades.csv") {
    const rebasedTradeDate = rebaseCsvDateColumn(text, "TradeDate", 0);
    return rebaseCsvDateColumn(rebasedTradeDate, "SettlementDate", 2);
  }
  return text;
}

function rebaseCsvDateColumn(text, columnName, offsetTradingDays = 0) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return text;
  const headers = splitCsvLine(lines[0]);
  const dateIndex = headers.findIndex((header) => header.trim().toLowerCase() === columnName.toLowerCase());
  if (dateIndex < 0) return text;
  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  const sourceDates = Array.from(new Set(rows.map((row) => normalizedIsoDate(row[dateIndex])).filter(Boolean))).sort();
  if (!sourceDates.length) return text;
  const endDate = subtractTradingDays(effectiveTodayDate(), offsetTradingDays);
  const dateMap = new Map();
  sourceDates.forEach((date, index) => {
    const daysBack = sourceDates.length - index - 1;
    dateMap.set(date, dateOnlyLabel(subtractTradingDays(endDate, daysBack)));
  });
  const rebasedRows = rows.map((row) => {
    const nextRow = [...row];
    const normalized = normalizedIsoDate(nextRow[dateIndex]);
    if (dateMap.has(normalized)) nextRow[dateIndex] = dateMap.get(normalized);
    return nextRow.join(",");
  });
  return [lines[0], ...rebasedRows].join("\n");
}

function publicDataCacheSummary(cacheRecord) {
  const cache = cacheRecord?.cache || cacheRecord || {};
  const incremental = Number(cache.incrementalTickers || 0);
  const fullHistory = Number(cache.fullHistoryTickers || 0);
  const previousDate = cache.previousLastDate ? ` Cached through ${cache.previousLastDate} before this run.` : " Initial historical cache created.";
  return `${incremental} ticker(s) refreshed incrementally; ${fullHistory} ticker(s) downloaded as full history.${previousDate}`;
}

function publicDataCacheDataSets(cacheRecord) {
  return cacheRecord?.dataSets || {};
}

function cacheDataSetText(dataSets, key) {
  return String(dataSets?.[key]?.rawText || "");
}

async function loadLatestPublicDataCache(options = {}) {
  if (!actorCan("publicDataRead") || !backendSyncAvailable()) return false;
  if (!options.force && publicDataCacheAutoLoadAttempted) return false;
  publicDataCacheAutoLoadAttempted = true;

  const status = el("allocationRecommendationStatus");
  if (status) {
    status.textContent = "Checking backend public data cache before running a new public data refresh...";
    status.className = "validation-message is-warning";
  }

  const connected = await ensureBackendImportSession({
    allowedGroups: ["System Administrator", "Decision Committee", "Execution Team"],
    fallbackRole: actorInGroup("Decision Committee") ? "decision" : "execution",
  });
  if (!connected) return false;

  try {
    const result = await backendRequest("/api/public-data/cache?includeData=1");
    const cacheRecord = result.publicDataCache;
    const dataSets = publicDataCacheDataSets(cacheRecord);
    const historicalPriceText = cacheDataSetText(dataSets, "historicalPrices");
    const tickerUniverseText = cacheDataSetText(dataSets, "tickerUniverse");
    const marketStatisticsText = cacheDataSetText(dataSets, "marketStatistics");
    if (!historicalPriceText || !tickerUniverseText || !marketStatisticsText) {
      if (status) {
        status.textContent = "No complete backend annual public-data cache is available yet. Decision Committee should run the Annual Public Data Engine once to create it.";
        status.className = "validation-message is-warning";
      }
      return false;
    }

    applyHistoricalPriceText(historicalPriceText, dataSets.historicalPrices.fileName || "auto_historical_prices.csv", {
      type: "public_data_cache_historical_prices",
      auditAction: "Backend public data cache historical prices loaded",
      sync: false,
    });
    applyTickerUniverseText(tickerUniverseText, dataSets.tickerUniverse.fileName || "auto_ticker_universe.csv", {
      type: "public_data_cache_ticker_universe",
      auditAction: "Backend public data cache ticker universe loaded",
      sync: false,
    });
    applyMarketStatisticsText(marketStatisticsText, dataSets.marketStatistics.fileName || "auto_market_statistics.csv", {
      type: "public_data_cache_market_statistics",
      auditAction: "Backend public data cache market statistics loaded",
      sync: false,
      publicDataSource: "cache",
      publicDataMessage: `Loaded backend cached public data generated at ${new Date(cacheRecord.generatedAt || cacheRecord.recordedAt).toLocaleString()}.`,
    });
    dataQuality.publicData = qualityResult("Pass", `Loaded backend cached public data generated at ${new Date(cacheRecord.generatedAt || cacheRecord.recordedAt).toLocaleString()}.`);
    if (status) {
      status.textContent = `Pass: loaded backend cached historical prices, ticker universe, and market statistics. ${publicDataCacheSummary(cacheRecord)}`;
      status.className = "validation-message is-valid";
    }
    logAudit("Backend public data cache loaded", "Latest cached public data loaded into workflow without a new external refresh");
    updateWorkflowOverview();
    return true;
  } catch (error) {
    if (status) {
      status.textContent = `Public data cache could not be loaded. ${error.message}`;
      status.className = "validation-message is-warning";
    }
    logAudit("Backend public data cache load skipped", error.message);
    return false;
  }
}

async function runPublicDataEngine() {
  if (!requirePermission("annualData", "run annual public data engine")) return;
  const status = el("allocationRecommendationStatus");
  status.textContent = "Running annual public data engine and preparing historical scenario recommendations...";
  status.className = "validation-message is-warning";
  const connected = await ensureBackendImportSession({
    allowedGroups: ["System Administrator", "Decision Committee"],
    fallbackRole: "decision",
  });
  if (!connected) {
    status.textContent = "Fail: local backend must be running before public data can be collected.";
    status.className = "validation-message is-invalid";
    return;
  }

  try {
    const result = await backendRequest("/api/public-data/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const outputs = result.publicDataEngine.outputs;
    const historicalPriceText = await readSampleCsv(outputs.historicalPrices);
    applyHistoricalPriceText(historicalPriceText, "auto_historical_prices.csv", {
      type: "public_data_engine_historical_prices",
      auditAction: "Public data engine historical prices loaded",
      sync: false,
    });
    const tickerUniverseText = await readSampleCsv(outputs.tickerUniverse);
    applyTickerUniverseText(tickerUniverseText, "auto_ticker_universe.csv", {
      type: "public_data_engine_ticker_universe",
      auditAction: "Public data engine ticker universe loaded",
      sync: false,
    });
    const marketStatisticsText = await readSampleCsv(outputs.marketStatistics);
    applyMarketStatisticsText(marketStatisticsText, "auto_market_statistics.csv", {
      type: "public_data_engine_market_statistics",
      auditAction: "Public data engine market statistics loaded",
      sync: false,
    });
    dataQuality.publicData = qualityResult("Pass", "Public data engine generated and loaded required reference CSV files.");
    const sourceName = result.publicDataEngine.cache?.sourceName || "Public market data source";
    const sourceUrl = result.publicDataEngine.cache?.sourceUrl || "";
    const sourceRange = [result.publicDataEngine.cache?.startDate, result.publicDataEngine.cache?.endDate].filter(Boolean).join(" to ");
    status.textContent = `Pass: annual public data engine generated historical prices, ticker universe, and bull/balanced/bear allocation recommendations at ${new Date(result.publicDataEngine.generatedAt).toLocaleString()}. Source: ${sourceName}${sourceRange ? ` (${sourceRange})` : ""}${sourceUrl ? `, ${sourceUrl}` : ""}. ${publicDataCacheSummary(result.publicDataEngine.cache)}`;
    status.className = "validation-message is-valid";
    logAudit("Public data engine completed", `Generated public CSV files from ${sourceName}${sourceUrl ? ` (${sourceUrl})` : ""} and loaded them into the workflow`);
    updateWorkflowOverview();
  } catch (error) {
    logAudit("Public data engine failed", error.message);
    const cacheLoaded = await loadLatestPublicDataCache({ force: true });
    if (cacheLoaded) {
      dataQuality.publicData = qualityResult("Warning", `Live public data refresh failed; loaded latest backend cache instead. ${error.message}`);
      status.textContent = `Warning: live public data refresh failed, so the system loaded the latest backend public-data cache instead. Original error: ${error.message}`;
      status.className = "validation-message is-warning";
      logAudit("Public data engine cache fallback loaded", error.message);
      updateWorkflowOverview();
      return;
    }
    dataQuality.publicData = qualityResult("Fail", error.message);
    status.textContent = `Fail: public data engine could not complete and no backend cache was available. ${error.message}. Upload standard market statistics CSV or use the manual bond/alternative/cash reference fields before continuing.`;
    status.className = "validation-message is-invalid";
    updateWorkflowOverview();
  }
}

function todayIso() {
  return dateOnlyLabel(effectiveTodayDate());
}

function configuredTestDateOverride() {
  return normalizedIsoDate(state?.systemConfig?.businessParameters?.testDateOverride);
}

function effectiveTodayDate() {
  const override = configuredTestDateOverride();
  if (override) {
    const [year, month, day] = override.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date();
}

function normalizeCpiSourceFromBackend(source, index) {
  const rate = sourceRateNumber(source);
  return {
    name: source.name || `Public CPI source ${index + 1}`,
    rate,
    sourceDate: source.sourceDate || todayIso(),
    enteredBy: source.enteredBy || "Backend public source lookup",
    note: source.note || "",
    sourceUrl: source.sourceUrl || extractSourceUrl(source),
    status: source.status || (rate === null ? "Excluded from calculation" : "Included in calculation"),
    selected: false,
    message: source.message || "",
  };
}

async function findLatestPublicSources() {
  if (!requirePermission("decision", "find latest public target-setting sources")) return;
  const status = el("publicSourceStatus");
  status.textContent = "Fetching public CPI sources from backend. If values are unavailable, use manual source entry below.";
  status.className = "validation-message is-warning";
  try {
    await ensureBackendSessionForRole("decision");
    const result = await backendRequest("/api/public-data/target-sources", {
      method: "POST",
      body: JSON.stringify({ sourceDate: todayIso() }),
    });
    const lookup = result.targetSources;
    state.cpi = (lookup.sources || []).map(normalizeCpiSourceFromBackend);
    el("cpiMethod").value = "average";
    el("outlookSourceDate").value = lookup.sourceDate || todayIso();
    el("outlookSourceNote").value = lookup.outlookNote || "";
    renderSources("cpi");
    resetTargetApproval();
    calculate({ resetManualTarget: true });
    const included = includedCpiSourcesWithRates().length;
    const errorNote = lookup.errors?.length ? ` Manual review required: ${lookup.errors.join("; ")}` : "";
    status.textContent = `${lookup.status}: ${lookup.sources.length} public source reference(s) returned; ${included} numeric source(s) included in CPI average.${errorNote}`;
    status.className = included >= 2 ? "validation-message is-valid" : "validation-message is-warning";
    logAudit("Public CPI sources fetched", status.textContent);
  } catch (error) {
    status.textContent = `Public CPI lookup failed: ${error.message}. Use manual CPI source entry below.`;
    status.className = "validation-message is-invalid";
    logAudit("Public CPI source lookup failed", error.message);
  }
}

async function readSampleCsv(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Sample file could not be loaded: ${response.status}`);
  return response.text();
}

function setActingUser(name) {
  state.currentUser = name;
  document.body.dataset.currentRole = roleKeyForUserName(name) || "unmatched";
  const userInput = el("currentUserName");
  if (userInput) userInput.value = name;
  updatePermissionStatus(`Current acting user set to ${name}.`, true);
  updatePermissionVisibility();
  refreshSelfProfileForm();
}

function roleKeyForUserName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === String(state.userCredentials.admin.username || "").trim().toLowerCase()
    || normalized === String(state.systemAdmin || "").trim().toLowerCase()) return "admin";
  if (normalized === String(state.userCredentials.decision.username || "").trim().toLowerCase()) return "decision";
  if (normalized === String(state.userCredentials.execution.username || "").trim().toLowerCase()) return "execution";
  return "";
}

function roleLabelForKey(role) {
  if (role === "admin") return "System User";
  if (role === "decision") return "Decision Committee";
  if (role === "execution") return "Execution Team";
  return "Unmatched user";
}

function replaceCommitteeMemberName(list, oldName, newName) {
  list.forEach((member) => {
    if (String(member.member || "").trim().toLowerCase() === String(oldName || "").trim().toLowerCase()) {
      member.member = newName;
    }
  });
}

function updateConfiguredUserName(role, newName) {
  const credential = state.userCredentials[role];
  if (!credential) return;
  const oldName = credential.username;
  credential.username = newName;

  if (role === "admin") {
    state.systemAdmin = newName;
    state.currentUser = newName;
    if (el("systemAdminName")) el("systemAdminName").value = newName;
    if (el("currentUserName")) el("currentUserName").value = newName;
    if (el("gateAdminUser")) el("gateAdminUser").value = newName;
    updateGateLoginUserLabels();
    return;
  }

  const group = role === "decision" ? "Decision Committee" : "Execution Team";
  const user = state.users.find((item) => item.group === group
    && String(item.name || "").trim().toLowerCase() === String(oldName || "").trim().toLowerCase());
  if (user) user.name = newName;

  if (role === "decision") {
    replaceCommitteeMemberName(state.targetCommittee, oldName, newName);
    replaceCommitteeMemberName(state.committee, oldName, newName);
    replaceCommitteeMemberName(state.rebalanceExceptionCommittee, oldName, newName);
    if (el("gateDecisionUser")) el("gateDecisionUser").value = newName;
  } else {
    if (String(state.proposal.executionManager || "").trim().toLowerCase() === String(oldName || "").trim().toLowerCase()) {
      state.proposal.executionManager = newName;
      if (el("executionManager")) el("executionManager").value = newName;
    }
    if (String(state.rebalanceOwner || "").trim().toLowerCase() === String(oldName || "").trim().toLowerCase()) {
      state.rebalanceOwner = newName;
      if (el("rebalanceOwner")) el("rebalanceOwner").value = newName;
    }
    state.tradeOrders.forEach((order) => {
      if (String(order.executionApprover || "").trim().toLowerCase() === String(oldName || "").trim().toLowerCase()) {
        order.executionApprover = newName;
      }
    });
    if (el("gateExecutionUser")) el("gateExecutionUser").value = newName;
  }

  const escalationRecipients = el("rebalanceEscalationRecipients");
  if (escalationRecipients) {
    escalationRecipients.textContent = `${state.userCredentials.decision.username}; ${state.userCredentials.execution.username}`;
  }
  updateGateLoginUserLabels();
}

function refreshSelfProfileForm() {
  const role = roleKeyForUserName(currentAuditActor());
  const roleInput = el("selfProfileRole");
  const aliasInput = el("selfProfileAlias");
  const passwordInput = el("selfProfilePassword");
  const saveButton = el("saveSelfProfileButton");
  const status = el("selfProfileStatus");
  if (!roleInput || !aliasInput || !passwordInput || !saveButton || !status) return;

  if (!role) {
    roleInput.value = "Unmatched user";
    aliasInput.value = currentAuditActor();
    passwordInput.value = "";
    aliasInput.disabled = true;
    passwordInput.disabled = true;
    saveButton.disabled = true;
    status.textContent = "My account: current user is not one of the configured login users.";
    status.className = "validation-message is-warning";
    return;
  }

  const credential = state.userCredentials[role];
  roleInput.value = roleLabelForKey(role);
  aliasInput.value = credential.username;
  passwordInput.value = credential.password;
  aliasInput.disabled = false;
  passwordInput.disabled = false;
  saveButton.disabled = false;
  status.textContent = "My account: short name and password can be updated here.";
  status.className = "validation-message";
}

async function saveSelfProfile() {
  const role = roleKeyForUserName(currentAuditActor());
  if (!role) {
    refreshSelfProfileForm();
    return;
  }
  const alias = String(el("selfProfileAlias")?.value || "").trim();
  const password = String(el("selfProfilePassword")?.value || "");
  if (!alias || !password) {
    const status = el("selfProfileStatus");
    status.textContent = "My account: short name and password are required.";
    status.className = "validation-message is-invalid";
    return;
  }

  const duplicate = state.users.some((user) => String(user.name || "").trim().toLowerCase() === alias.toLowerCase()
    && user.group !== (role === "decision" ? "Decision Committee" : "Execution Team"));
  if (role !== "admin" && duplicate) {
    const status = el("selfProfileStatus");
    status.textContent = "My account: this short name is already used by another role.";
    status.className = "validation-message is-invalid";
    return;
  }

  const previous = state.userCredentials[role].username;
  const status = el("selfProfileStatus");
  if (backendSyncAvailable()) {
    status.textContent = "My account: saving to local backend...";
    status.className = "validation-message is-warning";
    try {
      await syncUserProfileToBackend(role, alias, password);
    } catch (error) {
      status.textContent = `My account: backend sync failed. ${error.message}`;
      status.className = "validation-message is-invalid";
      updateBackendStatus(`profile sync failed. ${error.message}`, false);
      return;
    }
  }

  updateConfiguredUserName(role, alias);
  state.userCredentials[role].password = password;
  if (role === "admin" && el("gateAdminPassword")) el("gateAdminPassword").value = password;
  if (role === "decision" && el("gateDecisionPassword")) el("gateDecisionPassword").value = password;
  if (role === "execution" && el("gateExecutionPassword")) el("gateExecutionPassword").value = password;
  saveUserCredentialSnapshot();
  setActingUser(alias);
  renderUsers();
  renderTargetCommittee();
  renderCommittee();
  renderExceptionCommittee();
  renderTradeOrders();
  refreshGovernanceAfterUserChange();
  refreshSelfProfileForm();
  status.textContent = `My account: ${previous === alias ? "profile" : `short name changed from ${previous} to ${alias}`} saved${backendSyncAvailable() ? " and synced to backend" : ""}.`;
  status.className = "validation-message is-valid";
  logAudit("User profile updated", `${roleLabelForKey(role)} profile saved by ${alias}`);
}

function approveCommitteeList(committee, note) {
  committee.forEach((member) => {
    member.status = "Approve";
    member.note = note;
    member.decidedAt = new Date().toISOString();
  });
}

async function importSampleDataForDemo() {
  const [tickerText, priceText, holdingsText, tradesText, cashFlowText] = await Promise.all([
    readSampleCsv("./data/sample_ticker_universe.csv"),
    readSampleCsv("./data/sample_prices_demo.csv"),
    readSampleCsv("./data/standard_actual_holdings.csv"),
    readSampleCsv("./data/standard_actual_trades.csv"),
    readSampleCsv("./data/standard_cash_flows.csv"),
  ]);

  tickerUniverse = parseTickerUniverse(tickerText);
  logAudit("Sample ticker universe loaded", `${tickerUniverse.length} ticker row(s) loaded`);
  updateTickerUniverseStatus();
  recordDataLoad("sample_ticker_universe", "sample_ticker_universe.csv", tickerText, tickerUniverse, dataQuality.tickerUniverse);

  priceHistory = parseCsv(priceText);
  logAudit("Sample historical prices loaded", `${priceHistory.length} price row(s) loaded`);
  calculateBetaEstimates();
  updateBenchmarkReference();
  recordDataLoad("sample_historical_prices", "sample_prices_demo.csv", priceText, priceHistory, dataQuality.price);

  actualHoldings = parseActualHoldings(holdingsText);
  mergeEquityValueHistory(actualHoldings);
  logAudit("Sample actual holdings loaded", `${actualHoldings.length} holding row(s) loaded`);

  actualTrades = parseActualTrades(tradesText);
  logAudit("Sample actual trades loaded", `${actualTrades.length} trade row(s) loaded`);

  cashFlows = parseCashFlows(cashFlowText);
  logAudit("Sample cash flows loaded", `${cashFlows.length} cash flow row(s) loaded`);

  syncImportToBackend("sample_ticker_universe", "sample_ticker_universe.csv", tickerText);
  syncImportToBackend("sample_historical_prices", "sample_prices_demo.csv", priceText);
  syncImportToBackend("sample_actual_holdings", "standard_actual_holdings.csv", holdingsText);
  syncImportToBackend("sample_actual_trades", "standard_actual_trades.csv", tradesText);
  syncImportToBackend("sample_cash_flows", "standard_cash_flows.csv", cashFlowText);

  renderHoldings();
  renderActualHoldings();
  recordDataLoad("sample_actual_holdings", "standard_actual_holdings.csv", holdingsText, actualHoldings, dataQuality.actualHoldings);
  renderTradeReconciliation();
  recordDataLoad("sample_actual_trades", "standard_actual_trades.csv", tradesText, actualTrades, dataQuality.actualTrades);
  renderCashFlows();
  recordDataLoad("sample_cash_flows", "standard_cash_flows.csv", cashFlowText, cashFlows, dataQuality.cashFlows);
  updatePerformanceReport();
  calculate();
}

async function runSampleDemoFlow() {
  const status = el("sampleDemoStatus");
  status.textContent = "Sample demo flow: running target approval, sample data loads, backtest, optimization, and committee approval.";
  status.className = "validation-message is-warning";

  try {
    setActingUser(state.userCredentials.decision.username);
    calculate({ resetManualTarget: true });
    approveCommitteeList(state.targetCommittee, "Approved by one-click sample demo");
    renderTargetCommittee();
    updateTargetApprovalDecision();

    setActingUser(state.userCredentials.execution.username);
    await importSampleDataForDemo();
    updatePortfolio();

    if (!currentPortfolioBacktestPass) {
      optimizeWeights();
      updatePortfolio();
    }

    setActingUser(state.userCredentials.decision.username);
    approveCommitteeList(state.committee, currentPortfolioBacktestPass
      ? "Approved by one-click sample demo after backtest review"
      : "Demo approval recorded, but backtest still needs review");
    renderCommittee();
    updateCommitteeDecision();

    if (backendState.sessionId || window.location.protocol.startsWith("http")) {
      setActingUser(state.userCredentials.decision.username);
      await submitTargetPackageFromConsole();
      await approveTargetFromConsole("committee-1", state.userCredentials.decision.username);
      setActingUser(state.userCredentials.execution.username);
      await submitPortfolioFromConsole();
      setActingUser(state.userCredentials.decision.username);
      await approvePortfolioFromConsole("committee-1", state.userCredentials.decision.username);
    }

    updateWorkflowOverview();
    status.textContent = currentPortfolioBacktestPass
      ? "Sample demo flow: complete. Target, sample data loads, backtest, portfolio approval, backend records, and report status were refreshed."
      : "Sample demo flow: complete with review. Sample data loaded and approvals recorded, but beta/drawdown still needs review.";
    status.className = currentPortfolioBacktestPass ? "validation-message is-valid" : "validation-message is-warning";
    logAudit("Sample demo flow completed", status.textContent.replace("Sample demo flow: ", ""));
  } catch (error) {
    status.textContent = `Sample demo flow failed: ${error.message}`;
    status.className = "validation-message is-invalid";
    logAudit("Sample demo flow failed", error.message);
    updateWorkflowOverview();
  }
}

function summarizeBy(key) {
  return state.holdings.reduce((summary, holding) => {
    const group = holding[key] || "Unclassified";
    summary[group] = (summary[group] || 0) + Number(holding.weight || 0);
    return summary;
  }, {});
}

function renderBreakdown(containerId, summary) {
  const container = el(containerId);
  container.replaceChildren();
  Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, value]) => {
      const tag = document.createElement("span");
      tag.textContent = `${label}: ${percent(value)}`;
      container.append(tag);
    });
}

function assetClassKey(assetClass) {
  const keys = {
    Equity: "equity",
    Bond: "bond",
    Alternative: "alternative",
    "Cash & Cash-like": "cash",
  };
  return keys[assetClass] || "other";
}

function regionKey(region) {
  const keys = {
    "United States": "us",
    Japan: "japan",
    "Hong Kong": "hongkong",
    "China A": "chinaa",
    Global: "global",
  };
  return keys[region] || "other";
}

function equitySleeveKey(region) {
  const key = regionKey(region);
  if (key === "japan") return "developed";
  if (key === "hongkong" || key === "chinaa") return "emerging";
  return key;
}

function readStyleConstraints() {
  return {
    equity: normalizeRange(readNumber(el("equityMin")), readNumber(el("equityMax"))),
    bond: normalizeRange(readNumber(el("bondMin")), readNumber(el("bondMax"))),
    alternative: normalizeRange(readNumber(el("alternativeMin")), readNumber(el("alternativeMax"))),
    cash: normalizeRange(readNumber(el("cashMin")), readNumber(el("cashMax"))),
    cyclical: normalizeRange(readNumber(el("cyclicalMin")), readNumber(el("cyclicalMax"))),
    growth: normalizeRange(readNumber(el("growthStyleMin")), readNumber(el("growthStyleMax"))),
    active: normalizeRange(readNumber(el("activeMin")), readNumber(el("activeMax"))),
    us: normalizeRange(readNumber(el("usRegionMin")), readNumber(el("usRegionMax"))),
    japan: normalizeRange(readNumber(el("japanRegionMin")), readNumber(el("japanRegionMax"))),
    hongkong: normalizeRange(readNumber(el("hongKongRegionMin")), readNumber(el("hongKongRegionMax"))),
    chinaa: normalizeRange(readNumber(el("chinaARegionMin")), readNumber(el("chinaARegionMax"))),
    global: normalizeRange(readNumber(el("globalRegionMin")), readNumber(el("globalRegionMax"))),
  };
}

function styleTickerRange() {
  const params = normalizeClientSystemConfig(state.systemConfig).businessParameters;
  return normalizeRange(
    Number(params.styleTickerMin ?? defaults.systemConfig.businessParameters.styleTickerMin),
    Number(params.styleTickerMax ?? defaults.systemConfig.businessParameters.styleTickerMax),
  );
}

function singleSecurityMaxSleeveShare() {
  const params = normalizeClientSystemConfig(state.systemConfig).businessParameters;
  return Number(params.maxSingleSecurityWeight ?? defaults.systemConfig.businessParameters.maxSingleSecurityWeight);
}

function singleSecurityMaxPortfolioWeight(holding) {
  if (holding?.assetClass !== "Equity") return Number.POSITIVE_INFINITY;
  const definition = equityPortfolioSleeveDefinitions().find((item) => item.key === equitySleeveKey(holding.region));
  if (!definition) return Number.POSITIVE_INFINITY;
  const targetWeight = Math.max(0, readNumber(el(definition.targetWeightId)));
  return targetWeight * singleSecurityMaxSleeveShare() / 100;
}

function applyStylePreset(style) {
  const preset = defaults.styleConstraints[style];
  if (!preset) return;

  el("equityMin").value = preset.equity[0];
  el("equityMax").value = preset.equity[1];
  el("bondMin").value = preset.bond[0];
  el("bondMax").value = preset.bond[1];
  el("alternativeMin").value = preset.alternative[0];
  el("alternativeMax").value = preset.alternative[1];
  el("cashMin").value = preset.cash[0];
  el("cashMax").value = preset.cash[1];
  el("cyclicalMin").value = preset.cyclical[0];
  el("cyclicalMax").value = preset.cyclical[1];
  el("growthStyleMin").value = preset.growth[0];
  el("growthStyleMax").value = preset.growth[1];
  el("activeMin").value = preset.active[0];
  el("activeMax").value = preset.active[1];
  el("usRegionMin").value = preset.us[0];
  el("usRegionMax").value = preset.us[1];
  el("japanRegionMin").value = preset.japan[0];
  el("japanRegionMax").value = preset.japan[1];
  el("hongKongRegionMin").value = preset.hongkong[0];
  el("hongKongRegionMax").value = preset.hongkong[1];
  el("chinaARegionMin").value = preset.chinaa[0];
  el("chinaARegionMax").value = preset.chinaa[1];
  el("globalRegionMin").value = preset.global[0];
  el("globalRegionMax").value = preset.global[1];
}

function equityPortfolioSleeveDefinitions() {
  return [
    {
      key: "us",
      label: "U.S. equity",
      region: "United States",
      targetWeightId: "usEquityTargetWeight",
      benchmark: benchmarkProxy() === "manual" ? "VTI" : benchmarkProxy(),
    },
    {
      key: "developed",
      label: "Developed ex-U.S. equity",
      region: "Japan",
      targetWeightId: "developedEquityTargetWeight",
      benchmark: "1306.T",
    },
    {
      key: "emerging",
      label: "Emerging markets equity",
      region: "Hong Kong",
      targetWeightId: "emergingEquityTargetWeight",
      benchmark: "2800.HK + 510300.SS",
    },
  ];
}

function equityPortfolioSleeveDefinition(key = activePortfolioSleeve) {
  return equityPortfolioSleeveDefinitions().find((item) => item.key === key) || equityPortfolioSleeveDefinitions()[0];
}

function holdingsForEquitySleeve(definition) {
  return state.holdings.filter((holding) => (
    holding.assetClass === "Equity" && equitySleeveKey(holding.region) === definition.key
  ));
}

function tickerUniverseForEquitySleeve(definition) {
  return tickerUniverse.filter((record) => (
    record.assetClass === "Equity" && equitySleeveKey(record.region) === definition.key
  ));
}

function defaultTickerForEquitySleeve(definition) {
  return tickerUniverseForEquitySleeve(definition)[0] || null;
}

function selectedTickerForEquitySleeve(definition) {
  const query = String(el("tickerQuickSearch")?.value || "").trim().toUpperCase();
  if (!query) return null;
  const record = tickerBySymbol(query);
  if (!record || record.assetClass !== "Equity") return null;
  return equitySleeveKey(record.region) === definition.key ? record : null;
}

function assumedTestTickerRows() {
  const names = {
    VTI: "Vanguard Total Stock Market ETF",
    SPY: "SPDR S&P 500 ETF Trust",
    AAPL: "Apple Inc.",
    MSFT: "Microsoft Corporation",
    NVDA: "NVIDIA Corporation",
    QQQ: "Invesco QQQ Trust",
    JPM: "JPMorgan Chase & Co.",
    XOM: "Exxon Mobil Corporation",
    DIA: "SPDR Dow Jones Industrial Average ETF Trust",
    EWJ: "iShares MSCI Japan ETF",
    DXJ: "WisdomTree Japan Hedged Equity Fund",
    "7203.T": "Toyota Motor Corporation",
    "6758.T": "Sony Group Corporation",
    "9984.T": "SoftBank Group Corp.",
    "8306.T": "Mitsubishi UFJ Financial Group",
    EWH: "iShares MSCI Hong Kong ETF",
    "2800.HK": "Tracker Fund of Hong Kong",
    "0700.HK": "Tencent Holdings Limited",
    "0005.HK": "HSBC Holdings plc",
    "0388.HK": "Hong Kong Exchanges and Clearing Limited",
    "3690.HK": "Meituan",
    ASHR: "Xtrackers Harvest CSI 300 China A-Shares ETF",
    KBA: "KraneShares Bosera MSCI China A 50 Connect ETF",
    "600519.SS": "Kweichow Moutai Co., Ltd.",
    "300750.SZ": "Contemporary Amperex Technology Co., Ltd.",
    "601318.SS": "Ping An Insurance Group",
    "000001.SZ": "Ping An Bank Co., Ltd.",
    AGG: "iShares Core U.S. Aggregate Bond ETF",
    BIL: "SPDR Bloomberg 1-3 Month T-Bill ETF",
    GLD: "SPDR Gold Shares",
  };
  return assumedTestPortfolioRows().map((holding) => ({
    ticker: holding.symbol,
    name: names[holding.symbol] || holding.symbol,
    market: "US",
    region: holding.region,
    geographicRegion: holding.region,
    assetClass: holding.assetClass,
    styleFactor: holding.styleFactor,
    theme: holding.theme,
  }));
}

function assumedTestPortfolioRows() {
  return [
    { region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Core", symbol: "VTI", weight: 6, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Core", symbol: "SPY", weight: 6, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders", symbol: "AAPL", weight: 5, beta: 1.2, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders", symbol: "MSFT", weight: 5, beta: 1.1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors", symbol: "NVDA", weight: 4, beta: 1.8, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors", symbol: "QQQ", weight: 4, beta: 1.3, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical", symbol: "JPM", weight: 5, beta: 1.1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical", symbol: "XOM", weight: 5, beta: 0.9, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical", symbol: "DIA", weight: 5, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF", symbol: "EWJ", weight: 1.25, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF", symbol: "DXJ", weight: 1.25, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Japan Industrials", symbol: "7203.T", weight: 1.25, beta: 1.1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "8306.T", weight: 1.25, beta: 1.2, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders", symbol: "6758.T", weight: 1.25, beta: 1.15, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform", symbol: "9984.T", weight: 1.25, beta: 1.25, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF", symbol: "EWH", weight: 1.25, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF", symbol: "2800.HK", weight: 1.25, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "0005.HK", weight: 1.25, beta: 1.05, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "0388.HK", weight: 1.25, beta: 1.15, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform", symbol: "0700.HK", weight: 1.25, beta: 1.25, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform", symbol: "3690.HK", weight: 1.25, beta: 1.35, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF", symbol: "ASHR", weight: 0.84, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF", symbol: "KBA", weight: 0.84, beta: 1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "601318.SS", weight: 0.83, beta: 1.05, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "000001.SZ", weight: 0.83, beta: 1.1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Leaders", symbol: "600519.SS", weight: 0.83, beta: 1.1, betaMethod: "Auto from market benchmark", lockedWeight: false },
    { region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery", symbol: "300750.SZ", weight: 0.83, beta: 1.25, betaMethod: "Auto from market benchmark", lockedWeight: false },
  ];
}

function scaleAssumedPortfolioToCurrentSleeves(rows) {
  const scaled = rows.map((holding) => ({ ...holding }));
  equitySleeveDefinitions().forEach((definition) => {
    const config = equityMarketInputConfig[definition.key];
    const targetWeight = config ? readNumber(el(config.targetWeightId)) : 0;
    if (!Number.isFinite(targetWeight) || targetWeight <= 0) return;
    const sleeveRows = scaled.filter((holding) => holdingMatchesEquitySleeve(holding, definition));
    const currentWeight = sleeveRows.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
    if (currentWeight <= 0) return;
    const ratio = targetWeight / currentWeight;
    sleeveRows.forEach((holding) => {
      holding.weight = Number((Number(holding.weight || 0) * ratio).toFixed(4));
    });
  });
  return scaled;
}

async function loadAssumedTestPortfolio() {
  if (!requirePermission("execution", "load assumed test portfolio")) return;
  mergeTickerUniverseRows(assumedTestTickerRows());
  state.holdings = scaleAssumedPortfolioToCurrentSleeves(assumedTestPortfolioRows());
  state.proposal.proposalStatus = "Submitted for Backtest";
  state.proposal.proposalNote = "Assumed equity portfolio loaded with real listed tickers across the three approved equity sleeves.";
  if (el("proposalStatus")) el("proposalStatus").value = state.proposal.proposalStatus;
  if (el("proposalNote")) el("proposalNote").value = state.proposal.proposalNote;
  markVersionChanged("Assumed test portfolio loaded");
  logAudit("Assumed test portfolio loaded", `${state.holdings.length} proposed holding row(s) loaded using real ticker symbols`);
  recordDataLoad("assumed_test_portfolio", "assumed_test_portfolio.csv", holdingsToCsv(state.holdings), state.holdings, qualityResult("Pass", "Assumed equity portfolio loaded for the three-sleeve backtest workflow."));
  syncImportToBackend("assumed_test_portfolio", "assumed_test_portfolio.csv", holdingsToCsv(state.holdings));
  syncImportToBackend("assumed_ticker_universe", "assumed_ticker_universe.csv", tickerUniverseToCsv());
  try {
    const priceText = await readSampleCsv("./data/public_data_engine_output/auto_historical_prices.csv");
    applyHistoricalPriceText(priceText, "auto_historical_prices.csv", {
      type: "assumed_test_historical_prices",
      auditAction: "Assumed test historical prices loaded",
    });
  } catch (error) {
    const status = el("betaEngineStatus");
    if (status) {
      status.textContent = `Warning: assumed portfolio loaded, but historical prices were not auto-loaded. ${error.message}`;
      status.className = "validation-message is-warning";
    }
  }
  renderHoldings();
  renderPortfolioVersion();
  updatePortfolio();
}

function sleeveHoldingStatus(holding, sleeveShare, maxSingleSecuritySleeveShare) {
  if (sleeveShare > maxSingleSecuritySleeveShare) return { label: "Over single limit", className: "is-off" };
  if (sleeveShare > 50) return { label: "High concentration", className: "is-warning" };
  return { label: "OK", className: "is-close" };
}

function renderEquitySleeveBuilder() {
  const body = el("equitySleeveHoldingRows");
  if (!body) return;

  document.querySelectorAll("[data-sleeve-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sleeveTab === activePortfolioSleeve);
  });

  const definition = equityPortfolioSleeveDefinition();
  const holdings = holdingsForEquitySleeve(definition);
  const sleeveWeight = holdings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
  const targetWeight = readNumber(el(definition.targetWeightId));
  const maxSingleSecuritySleeveShare = singleSecurityMaxSleeveShare();
  const tickerRows = tickerUniverseForEquitySleeve(definition);
  const selectedTicker = selectedTickerForEquitySleeve(definition);
  const rawSelectedTicker = String(el("tickerQuickSearch")?.value || "").trim().toUpperCase();
  const activeTitle = el("activeSleeveTitle");
  const activeStatus = el("activeSleeveStatus");
  const targetWeightNode = el("activeSleeveTargetWeight");
  const currentWeightNode = el("activeSleeveCurrentWeight");
  const countNode = el("activeSleeveTickerCount");
  const largestNode = el("activeSleeveLargestHolding");
  const suggestionRule = el("activeSleeveSuggestionRule");
  const tickerSource = el("activeSleeveTickerSource");
  const validation = el("equitySleeveValidation");
  const adviceList = el("equitySleeveAdviceList");

  const largest = holdings
    .map((holding) => ({
      symbol: holding.symbol || "Unnamed",
      portfolioWeight: Number(holding.weight || 0),
      sleeveShare: sleeveWeight > 0 ? (Number(holding.weight || 0) / sleeveWeight) * 100 : 0,
    }))
    .sort((a, b) => b.sleeveShare - a.sleeveShare)[0] || null;

  const issues = [];
  const suggestions = [];
  const count = new Set(holdings.map((holding) => String(holding.symbol || "").trim().toUpperCase()).filter(Boolean)).size;
  const weightGap = sleeveWeight - targetWeight;
  const tickerRange = styleTickerRange();
  const tickerRangePreview = el("styleTickerRangePreview");
  if (tickerRangePreview) {
    tickerRangePreview.textContent = `${tickerRange.low}-${tickerRange.high} tickers per style bucket, per sleeve`;
  }
  const styleCounts = Object.fromEntries(equityStyleTickerKeys.map((key) => {
    const symbols = new Set(holdings
      .filter((holding) => String(holding.styleFactor || "").trim().toLowerCase() === key)
      .map((holding) => String(holding.symbol || "").trim().toUpperCase())
      .filter(Boolean));
    return [key, symbols.size];
  }));

  if (Math.abs(weightGap) > 0.5) {
    issues.push(`${definition.label} current weight ${percent(sleeveWeight)} differs from target ${percent(targetWeight)}`);
    suggestions.push(`Adjust ${definition.label} holdings by ${percent(-weightGap)} so total proposed weight matches the sleeve target.`);
  }
  equityStyleTickerKeys.forEach((styleKey) => {
    const styleCount = styleCounts[styleKey] || 0;
    const styleLabel = equityStyleTickerLabels[styleKey];
    if (styleCount < tickerRange.low) {
      issues.push(`${definition.label} ${styleLabel} needs ${tickerRange.low}-${tickerRange.high} tickers, currently ${styleCount}`);
      suggestions.push(`Add ${tickerRange.low - styleCount} ${definition.label} ${styleLabel} ticker(s) from the imported ticker universe.`);
    }
    if (styleCount > tickerRange.high) {
      issues.push(`${definition.label} ${styleLabel} has ${styleCount} tickers, above the ${tickerRange.high} maximum`);
      suggestions.push(`Reduce ${definition.label} ${styleLabel} to no more than ${tickerRange.high} ticker(s).`);
    }
  });
  holdings.forEach((holding) => {
    const portfolioWeight = Number(holding.weight || 0);
    const sleeveShare = sleeveWeight > 0 ? (portfolioWeight / sleeveWeight) * 100 : 0;
    if (sleeveShare > maxSingleSecuritySleeveShare) {
      issues.push(`${holding.symbol || "Holding"} exceeds the single-security sleeve limit`);
      suggestions.push(`Reduce ${holding.symbol || "the holding"} to ${percent(maxSingleSecuritySleeveShare)} or below inside the ${definition.label} sleeve.`);
    }
    if (sleeveShare > 50) {
      issues.push(`${holding.symbol || "Holding"} is too concentrated inside ${definition.label}`);
      suggestions.push(`Reduce ${holding.symbol || "the holding"} below 50% of the ${definition.label} sleeve, or add/raise another ticker.`);
    }
  });
  if (!tickerRows.length) {
    issues.push(`No imported ticker universe rows found for ${definition.label}`);
    suggestions.push(`Import an external ticker universe CSV with tickers and short names for ${definition.label}.`);
  }
  if (!suggestions.length) {
    suggestions.push(`${definition.label} construction is within target weight, style ticker count, and single-security limits.`);
  }

  if (activeTitle) activeTitle.textContent = `${definition.label} construction status`;
  if (activeStatus) {
    activeStatus.textContent = issues.length ? "Review" : "Pass";
    activeStatus.className = issues.length ? "is-off" : "is-close";
  }
  if (targetWeightNode) targetWeightNode.textContent = percent(targetWeight);
  if (currentWeightNode) {
    currentWeightNode.textContent = percent(sleeveWeight);
    currentWeightNode.className = Math.abs(weightGap) <= 0.5 ? "is-close" : "is-off";
  }
  if (countNode) {
    countNode.textContent = String(count);
    countNode.className = equityStyleTickerKeys.every((key) => styleCounts[key] >= tickerRange.low && styleCounts[key] <= tickerRange.high) ? "is-close" : "is-off";
  }
  if (largestNode) {
    largestNode.textContent = largest ? `${largest.symbol} ${percent(largest.sleeveShare)}` : "No holdings";
    largestNode.className = largest && largest.sleeveShare > maxSingleSecuritySleeveShare ? "is-off" : "is-close";
  }
  if (suggestionRule) {
    const styleSummary = equityStyleTickerKeys.map((key) => `${equityStyleTickerLabels[key]} ${styleCounts[key] || 0}`).join(", ");
    const selectedText = selectedTicker
      ? ` Selected ticker ready to add: ${selectedTicker.ticker} ${selectedTicker.name || ""}.`
      : (rawSelectedTicker ? ` Selected ticker belongs to another sleeve; Add Selected Ticker will place it in its correct sleeve.` : " Search a ticker above, then add it to this sleeve.");
    suggestionRule.textContent = `${definition.label} uses benchmark ${definition.benchmark}; holdings should sum to the target sleeve weight, keep ${tickerRange.low}-${tickerRange.high} tickers in each style bucket, and keep each ticker within ${percent(maxSingleSecuritySleeveShare)} of this sleeve. Current style counts: ${styleSummary}.${selectedText}`;
  }
  if (tickerSource) {
    tickerSource.textContent = `Ticker source: ${tickerRows.length} imported ${definition.label} ticker row(s). Load an external ticker universe CSV above to expand choices.`;
  }

  body.replaceChildren();
  if (!holdings.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = `No proposed holdings. Add ${tickerRange.low}-${tickerRange.high} tickers per required style bucket.`;
    row.append(cell);
    body.append(row);
  } else {
    holdings.forEach((holding) => {
      const ticker = tickerBySymbol(holding.symbol);
      const portfolioWeight = Number(holding.weight || 0);
      const sleeveShare = sleeveWeight > 0 ? (portfolioWeight / sleeveWeight) * 100 : 0;
      const status = sleeveHoldingStatus(holding, sleeveShare, maxSingleSecuritySleeveShare);
      const row = document.createElement("tr");
      [
        holding.symbol || "Unnamed",
        ticker?.name || "Custom / imported ticker",
        holding.styleFactor || "Unclassified",
        holding.theme || "Unclassified",
        percent(portfolioWeight),
        percent(sleeveShare),
        Number.isFinite(Number(holding.beta)) ? Number(holding.beta).toFixed(2) : "Invalid",
        status.label,
      ].forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 7) cell.className = status.className;
        row.append(cell);
      });
      body.append(row);
    });
  }

  if (adviceList) {
    adviceList.replaceChildren();
    suggestions.forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      adviceList.append(item);
    });
  }
  if (validation) {
    validation.textContent = issues.length ? issues.join("; ") : `${definition.label} sleeve construction passes current checks.`;
    validation.className = issues.length ? "validation-message is-invalid" : "validation-message is-valid";
  }
}

function validateStyleConstraints(assetSummary, factorSummary, regionSummary, tickerSummary) {
  const tickerRange = styleTickerRange();
  const violations = [];
  equityPortfolioSleeveDefinitions().forEach((definition) => {
    const targetWeight = readNumber(el(definition.targetWeightId));
    if (targetWeight <= 0) return;
    const sleeveHoldings = holdingsForEquitySleeve(definition);
    equityStyleTickerKeys.forEach((styleKey) => {
      const count = new Set(sleeveHoldings
        .filter((holding) => String(holding.styleFactor || "").trim().toLowerCase() === styleKey)
        .map((holding) => String(holding.symbol || "").trim().toUpperCase())
        .filter(Boolean)).size;
      if (count < tickerRange.low || count > tickerRange.high) {
        violations.push(`${definition.label} ${equityStyleTickerLabels[styleKey]} needs ${tickerRange.low}-${tickerRange.high} tickers, currently ${count}`);
      }
    });
  });
  state.holdings.forEach((holding) => {
    if (holding.assetClass !== "Equity") return;
    const weight = Number(holding.weight || 0);
    const maxSingleSecurityWeight = singleSecurityMaxPortfolioWeight(holding);
    if (weight > maxSingleSecurityWeight) {
      violations.push(`${holding.symbol || "Equity holding"} ${percent(weight)} exceeds max single equity holding ${percent(maxSingleSecurityWeight)} based on ${percent(singleSecurityMaxSleeveShare())} of its sleeve`);
    }
  });

  el("constraintValidation").textContent = violations.length
    ? violations.join("; ")
    : "Proposed equity sleeve weights, per-sleeve style ticker counts, and single-equity limits are within constraints.";
  el("constraintValidation").className = violations.length
    ? "validation-message is-invalid"
    : "validation-message is-valid";
}

function updatePortfolio() {
  calculateBetaEstimates();
  const totalWeight = state.holdings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
  const assetSummary = state.holdings.reduce((summary, holding) => {
    const key = assetClassKey(holding.assetClass);
    summary[key] = (summary[key] || 0) + Number(holding.weight || 0);
    return summary;
  }, {});
  const factorSummary = state.holdings.reduce((summary, holding) => {
    const key = String(holding.styleFactor || "").toLowerCase();
    if (["cyclical", "growth", "active"].includes(key)) {
      summary[key] = (summary[key] || 0) + Number(holding.weight || 0);
    }
    return summary;
  }, {});
  const regionSummary = state.holdings.reduce((summary, holding) => {
    const key = regionKey(holding.region);
    summary[key] = (summary[key] || 0) + Number(holding.weight || 0);
    return summary;
  }, {});
  const tickerSummary = state.holdings.reduce((summary, holding) => {
    const key = String(holding.styleFactor || "").toLowerCase();
    const symbol = String(holding.symbol || "").trim().toUpperCase();
    if (["cyclical", "growth", "active"].includes(key) && symbol) {
      if (!summary[key]) summary[key] = new Set();
      summary[key].add(symbol);
    }
    return summary;
  }, {});
  const weightedPolicyBeta = state.holdings.reduce((sum, holding) => {
    applyBetaPolicy(holding);
    return sum + (Number(holding.weight || 0) / 100) * Number(holding.beta || 0);
  }, 0);
  const usEquityHoldings = state.holdings.filter((holding) => (
    holding.assetClass === "Equity" && holding.region === "United States"
  ));
  const usEquityWeight = usEquityHoldings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
  const usEquitySleeveBeta = usEquityWeight > 0
    ? usEquityHoldings.reduce((sum, holding) => (
      sum + (Number(holding.weight || 0) / usEquityWeight) * Number(holding.beta || 0)
    ), 0)
    : null;
  const betaGap = currentTargetBeta === null || usEquitySleeveBeta === null ? null : usEquitySleeveBeta - currentTargetBeta;
  currentUsEquityReferenceBetaPass = betaGap !== null && betaWithinTargetTolerance(usEquitySleeveBeta, currentTargetBeta);

  el("portfolioWeight").textContent = percent(totalWeight);
  el("usEquitySleeveBeta").textContent = usEquitySleeveBeta === null ? "No U.S. equity" : usEquitySleeveBeta.toFixed(2);
  el("usEquityTargetBeta").textContent = currentTargetBeta === null ? "Invalid" : currentTargetBeta.toFixed(2);
  el("wholePortfolioBeta").textContent = priceHistory.length ? "Calculating" : weightedPolicyBeta.toFixed(2);
  el("betaGap").textContent = betaGap === null ? "Invalid" : betaGap.toFixed(2);
  el("betaGap").className = currentUsEquityReferenceBetaPass ? "is-close" : "is-off";

  renderBreakdown("regionBreakdown", summarizeBy("region"));
  renderBreakdown("assetClassBreakdown", summarizeBy("assetClass"));
  renderBreakdown("themeBreakdown", summarizeBy("theme"));
  validateStyleConstraints(assetSummary, factorSummary, regionSummary, tickerSummary);
  refreshProposedPortfolioQualityFromHoldings();
  renderEquitySleeveBuilder();
  renderActualHoldings();
  updateBlendedPolicyBenchmark();
  updateBacktestResults();
}

function renderHoldings() {
  const body = el("holdingRows");
  const template = el("holdingTemplate");
  body.replaceChildren();

  if (!state.holdings.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.textContent = "No proposed equity holdings yet. Search a ticker, choose a sleeve, and add holdings in the system.";
    row.append(cell);
    body.append(row);
    updatePortfolio();
    return;
  }

  state.holdings.forEach((holding, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const region = row.querySelector(".holding-region");
    const styleFactor = row.querySelector(".holding-style-factor");
    const theme = row.querySelector(".holding-theme");
    const symbol = row.querySelector(".holding-symbol");
    const weight = row.querySelector(".holding-weight");
    const beta = row.querySelector(".holding-beta");
    const betaMethod = row.querySelector(".holding-beta-method");
    const lockedWeight = row.querySelector(".holding-lock-weight");
    const contribution = row.querySelector(".holding-contribution");
    const remove = row.querySelector(".holding-remove");

    holding.assetClass = "Equity";
    applyBetaPolicy(holding);
    symbol.setAttribute("list", "tickerSuggestionList");
    symbol.placeholder = "Type ticker or name";
    region.value = holding.region;
    styleFactor.value = holding.styleFactor;
    theme.value = holding.theme;
    symbol.value = holding.symbol;
    weight.value = holding.weight;
    beta.value = holding.beta;
    betaMethod.value = holding.betaMethod;
    lockedWeight.checked = Boolean(holding.lockedWeight);
    beta.readOnly = !betaIsEditable(holding);
    beta.title = beta.readOnly ? `Auto beta is tied to ${betaBenchmarkLabelForHolding(holding)}. Use Manual equity override to edit.` : "Editable beta";
    contribution.textContent = ((Number(holding.weight || 0) / 100) * Number(holding.beta || 0)).toFixed(2);

    region.addEventListener("change", () => {
      if (!requirePermission("execution", "edit proposed holding region")) { region.value = holding.region; return; }
      holding.region = region.value; markVersionChanged("Holding region changed"); updatePortfolio();
    });
    styleFactor.addEventListener("change", () => {
      if (!requirePermission("execution", "edit proposed holding style factor")) { styleFactor.value = holding.styleFactor; return; }
      holding.styleFactor = styleFactor.value; markVersionChanged("Holding style factor changed"); updatePortfolio();
    });
    theme.addEventListener("change", () => {
      if (!requirePermission("execution", "edit proposed holding theme")) { theme.value = holding.theme; return; }
      holding.theme = theme.value; markVersionChanged("Holding theme changed"); updatePortfolio();
    });
    const syncTickerSelection = ({ finalize = false } = {}) => {
      const nextSymbol = String(symbol.value || "").trim().toUpperCase();
      const matchedTicker = tickerBySymbol(nextSymbol);
      const ticker = matchedTicker?.assetClass === "Equity" ? matchedTicker : null;
      if (!ticker && !finalize) return false;

      const changed = holding.symbol !== nextSymbol;
      holding.symbol = nextSymbol;
      holding.assetClass = "Equity";
      symbol.value = nextSymbol;
      if (ticker) {
        holding.region = ticker.region;
        holding.styleFactor = ticker.styleFactor;
        holding.theme = ticker.theme;
        holding.betaMethod = "Auto from market benchmark";
        region.value = holding.region;
        styleFactor.value = holding.styleFactor;
        theme.value = holding.theme;
        betaMethod.value = holding.betaMethod;
      }
      if (changed) markVersionChanged("Holding ticker changed");
      calculateBetaEstimates();
      applyBetaPolicy(holding);
      betaMethod.value = holding.betaMethod;
      beta.value = holding.beta;
      contribution.textContent = ((Number(holding.weight || 0) / 100) * Number(holding.beta || 0)).toFixed(2);
      updatePortfolio();
      return Boolean(ticker);
    };
    symbol.addEventListener("input", () => {
      if (!actorCan("execution")) return;
      syncTickerSelection();
    });
    symbol.addEventListener("change", () => {
      if (!requirePermission("execution", "edit proposed holding ticker")) { symbol.value = holding.symbol; return; }
      syncTickerSelection({ finalize: true });
    });
    weight.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit proposed holding weight"); weight.value = holding.weight; return; }
      holding.weight = readNumber(weight);
      markVersionChanged("Holding weight changed");
      contribution.textContent = ((Number(holding.weight || 0) / 100) * Number(holding.beta || 0)).toFixed(2);
      updatePortfolio();
    });
    betaMethod.addEventListener("change", () => {
      if (!requirePermission("execution", "edit proposed holding beta method")) { betaMethod.value = holding.betaMethod; return; }
      holding.betaMethod = betaMethod.value;
      markVersionChanged("Holding beta method changed");
      applyBetaPolicy(holding);
      beta.value = holding.beta;
      beta.readOnly = !betaIsEditable(holding);
      contribution.textContent = ((Number(holding.weight || 0) / 100) * Number(holding.beta || 0)).toFixed(2);
      updatePortfolio();
    });
    beta.addEventListener("input", () => {
      if (!actorCan("execution")) { denyPermission("execution", "edit proposed holding beta"); beta.value = holding.beta; return; }
      holding.beta = readNumber(beta);
      markVersionChanged("Holding beta changed");
      contribution.textContent = ((Number(holding.weight || 0) / 100) * Number(holding.beta || 0)).toFixed(2);
      updatePortfolio();
    });
    lockedWeight.addEventListener("change", () => {
      if (!requirePermission("execution", "change optimization weight lock")) {
        lockedWeight.checked = Boolean(holding.lockedWeight);
        return;
      }
      holding.lockedWeight = lockedWeight.checked;
      markVersionChanged("Holding optimization lock changed");
      logAudit("Optimization lock changed", `${holding.symbol || "Unnamed holding"} weight lock ${holding.lockedWeight ? "enabled" : "disabled"}`);
      updatePortfolio();
    });
    remove.addEventListener("click", () => {
      if (!requirePermission("execution", "remove proposed holding")) return;
      logAudit("Holding removed", `${holding.symbol || "Unnamed holding"} removed from proposed portfolio`);
      state.holdings.splice(index, 1);
      markVersionChanged("Holding removed");
      renderHoldings();
      updatePortfolio();
    });

    body.append(row);
  });

  updatePortfolio();
}

function addHolding() {
  if (!requirePermission("execution", "add proposed holding")) return;
  markVersionChanged("Holding added");
  logAudit("Holding added", "New proposed holding added");
  state.holdings.push({
    region: "United States",
    assetClass: "Equity",
    styleFactor: "Core",
    theme: "Core",
    symbol: "New",
    weight: 0,
    beta: 1,
    betaMethod: "Auto from market benchmark",
    lockedWeight: false,
  });
  renderHoldings();
}

function addHoldingForSleeve(sleeveKey = activePortfolioSleeve) {
  if (!requirePermission("execution", "add proposed holding to equity sleeve")) return;
  let definition = equityPortfolioSleeveDefinition(sleeveKey);
  const selectedSymbol = String(el("tickerQuickSearch")?.value || "").trim().toUpperCase();
  const selectedRecord = tickerBySymbol(selectedSymbol);
  let ticker = selectedTickerForEquitySleeve(definition);
  if (!ticker && selectedRecord?.assetClass === "Equity") {
    activePortfolioSleeve = equitySleeveKey(selectedRecord.region);
    definition = equityPortfolioSleeveDefinition(activePortfolioSleeve);
    ticker = selectedRecord;
  }
  if (!ticker) ticker = defaultTickerForEquitySleeve(definition);
  markVersionChanged(`${definition.label} holding added`);
  logAudit("Sleeve holding added", `${ticker?.ticker || "New"} added to ${definition.label}`);
  state.holdings.push({
    region: ticker?.region || definition.region,
    assetClass: "Equity",
    styleFactor: ticker?.styleFactor || "Core",
    theme: ticker?.theme || "Core",
    symbol: ticker?.ticker || "New",
    weight: 0,
    beta: 1,
    betaMethod: "Auto from market benchmark",
    lockedWeight: false,
  });
  renderHoldings();
}

function refreshSelectedOutlook(outlookBand) {
  if (document.activeElement === el("selectedOutlookRate")) return;
  el("selectedOutlookRate").value = selectedOutlookRateFromBand(outlookBand).toFixed(2);
}

function configuredAllocationBase(scenario) {
  const base = structuredClone(defaults.allocationRecommendations[scenario] || defaults.allocationRecommendations.balanced);
  const config = normalizeAllocationDefaults(state.systemConfig?.businessParameters?.allocationDefaults)?.[scenario];
  if (!config) return base;
  allocationAssetKeys.forEach((asset) => {
    const configuredWeight = Number(config.assets?.[asset]?.weight);
    if (Number.isFinite(configuredWeight)) base.assets[asset].weight = configuredWeight;
  });
  allocationRegionKeys.forEach((region) => {
    const configuredShare = Number(config.regions?.[region]?.share);
    if (Number.isFinite(configuredShare)) base.regions[region].share = configuredShare;
  });
  return base;
}

function selectedEquityReturnAllocationMethod() {
  const method = state.systemConfig?.businessParameters?.equityReturnAllocationMethod;
  return Object.keys(equityReturnAllocationMethodLabels).includes(method) ? method : "baselineGap";
}

function equityReturnAllocationMethodDescription(method, recommendation, finalTarget, isTargetValid) {
  const baselineReturn = recommendedBaselineReturn(recommendation);
  const bondContribution = (recommendation.assets.bond.weight / 100) * recommendation.assets.bond.return;
  const alternativeContribution = (recommendation.assets.alternative.weight / 100) * recommendation.assets.alternative.return;
  const cashContribution = (recommendation.assets.cash.weight / 100) * recommendation.assets.cash.return;
  const nonEquityContribution = bondContribution + alternativeContribution + cashContribution;
  if (method === "pureProRata") {
    const residual = isTargetValid ? finalTarget - nonEquityContribution : null;
    return isTargetValid
      ? `Method: ${equityReturnAllocationMethodLabels[method]}. Non-equity contribution is ${percent(nonEquityContribution)}; remaining equity target contribution ${percent(residual)} is split by equity-market share.`
      : `Method: ${equityReturnAllocationMethodLabels[method]}. Complete a valid annual target before calculating the equity residual.`;
  }
  if (method === "manual") {
    return `Method: ${equityReturnAllocationMethodLabels[method]}. The suggestion updates weights and reference returns, while equity contribution inputs stay manually controlled by the Execution Team.`;
  }
  const rawTargetGap = isTargetValid ? finalTarget - baselineReturn : null;
  const shortfallGap = rawTargetGap === null ? null : Math.max(0, rawTargetGap);
  const expectedBuffer = rawTargetGap === null ? null : Math.max(0, -rawTargetGap);
  return isTargetValid
    ? `Method: ${equityReturnAllocationMethodLabels[method]}. Historical baseline return is ${percent(baselineReturn)}; only a positive shortfall gap ${percent(shortfallGap)} is allocated across equity markets. Expected buffer above the approved floor is ${percent(expectedBuffer)}.`
    : `Method: ${equityReturnAllocationMethodLabels[method]}. Complete a valid annual target before calculating any positive shortfall gap.`;
}

function currentAllocationRecommendation() {
  const approvedRecommendation = approvedAnnualDecisionSnapshot()?.allocationRecommendation;
  if (approvedRecommendation?.assets && approvedRecommendation?.regions) {
    return structuredClone(approvedRecommendation);
  }
  const scenario = selectedScenario();
  const imported = marketStatisticsRecommendations?.[scenario] || null;
  const base = configuredAllocationBase(scenario);
  return mergeRecommendationWithFallbacks(imported, base);
}

function fallbackNumber(id, defaultValue) {
  const node = document.getElementById(id);
  if (!node) return defaultValue;
  const value = Number.parseFloat(node.value);
  return Number.isFinite(value) ? value : defaultValue;
}

function mergeRecommendationWithFallbacks(imported, base) {
  const manualAssetReturn = {
    bond: fallbackNumber("manualBondFallbackReturn", base.assets.bond.return),
    alternative: fallbackNumber("manualAlternativeFallbackReturn", base.assets.alternative.return),
    cash: fallbackNumber("manualCashFallbackReturn", base.assets.cash.return),
  };
  const manualRegionReturn = {
    developed: fallbackNumber("developedEquityCma", base.regions.developed.return),
    emerging: fallbackNumber("emergingEquityCma", base.regions.emerging.return),
  };
  const assets = {};
  ["equity", "bond", "alternative", "cash"].forEach((key) => {
    const importedAsset = imported?.assets?.[key] || null;
    assets[key] = { ...base.assets[key], ...(importedAsset || {}) };
    if (!importedAsset && manualAssetReturn[key] != null) assets[key].return = manualAssetReturn[key];
    if (importedAsset && !Number.isFinite(importedAsset.return) && manualAssetReturn[key] != null) assets[key].return = manualAssetReturn[key];
  });

  const regions = {};
  equityMarketKeys.forEach((key) => {
    const importedRegion = imported?.regions?.[key] || null;
    regions[key] = { ...base.regions[key], ...(importedRegion || {}) };
    if (!importedRegion && manualRegionReturn[key] != null) regions[key].return = manualRegionReturn[key];
    if (importedRegion && !Number.isFinite(importedRegion.return) && manualRegionReturn[key] != null) regions[key].return = manualRegionReturn[key];
  });

  return {
    note: imported?.note || base.note,
    assets,
    regions,
    fallback: {
      bond: !imported?.assets?.bond,
      alternative: !imported?.assets?.alternative,
      cash: !imported?.assets?.cash,
      developed: !imported?.regions?.developed,
      emerging: !imported?.regions?.emerging,
    },
  };
}

function formatRange(range) {
  return `${percent(range[0])} - ${percent(range[1])}`;
}

function renderAllocationRecommendation(finalTarget, isTargetValid) {
  const recommendation = currentAllocationRecommendation();
  const assetBody = el("assetAllocationRecommendationRows");
  const regionBody = el("regionalAllocationRecommendationRows");
  assetBody.replaceChildren();
  regionBody.replaceChildren();

  Object.values(recommendation.assets).forEach((asset) => {
    const row = document.createElement("tr");
    [
      asset.label,
      percent(asset.return),
      percent(asset.volatility),
      percent(asset.drawdown),
      formatRange(asset.range),
      percent(asset.weight),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    assetBody.append(row);
  });

  const equityWeight = recommendation.assets.equity.weight;
  Object.values(recommendation.regions).forEach((region) => {
    const portfolioWeight = equityWeight * region.share / 100;
    const row = document.createElement("tr");
    [
      region.label,
      percent(region.return),
      percent(region.volatility),
      region.correlation,
      percent(region.share),
      percent(portfolioWeight),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    regionBody.append(row);
  });

  const baselineReturn = recommendedBaselineReturn(recommendation);
  const rawTargetGap = isTargetValid ? finalTarget - baselineReturn : null;
  const shortfallGap = rawTargetGap === null ? null : Math.max(0, rawTargetGap);
  const expectedBuffer = rawTargetGap === null ? null : Math.max(0, -rawTargetGap);
  el("allocationRecommendationSummary").textContent = `${scenarioLabels[selectedScenario()]}: ${recommendation.note}`;
  const sourceLabel = marketStatisticsRecommendations
    ? "approved annual public-data engine statistics"
    : "administrator-configured default historical policy set";
  const method = selectedEquityReturnAllocationMethod();
  const methodDescription = equityReturnAllocationMethodDescription(method, recommendation, finalTarget, isTargetValid);
  updatePublicDataFallbackStatus(recommendation);
  el("allocationRecommendationStatus").textContent = isTargetValid
    ? `${dataQuality.marketStats.status}: using ${sourceLabel}. ${methodDescription}`
    : `${dataQuality.marketStats.status}: ${dataQuality.marketStats.message} Decision Committee can run or upload annual public data before approving the target; target decomposition starts after the target is valid.`;
  el("allocationRecommendationStatus").className = isTargetValid
    ? "validation-message is-valid"
    : "validation-message";
  const methodStatus = el("equityReturnAllocationMethodStatus");
  if (methodStatus) {
    methodStatus.textContent = isTargetValid
      ? `${methodDescription} Approved target is treated as a floor: shortfall ${percent(shortfallGap)}, expected buffer ${percent(expectedBuffer)}.`
      : methodDescription;
    methodStatus.className = isTargetValid ? "validation-message is-valid" : "validation-message";
  }
}

function updatePublicDataFallbackStatus(recommendation) {
  const usingManual = Object.entries(recommendation.fallback || {})
    .filter(([, value]) => value)
    .map(([key]) => key);
  const sourceText = marketStatisticsRecommendations ? "approved annual public-data statistics" : "administrator default historical policy set";
  const gateStatus = el("publicDataGateStatus");
  if (gateStatus) {
    gateStatus.textContent = usingManual.length
      ? `Annual public data status: using ${sourceText}; manual fallback is active for ${usingManual.join(", ")}.`
      : `Annual public data status: using ${sourceText}; no manual fallback is currently required.`;
    gateStatus.className = usingManual.length ? "validation-message is-warning" : "validation-message is-valid";
  }
  const sourceLabels = [
    ["bondFallbackSource", "bond"],
    ["alternativeFallbackSource", "alternative"],
    ["cashFallbackSource", "cash"],
  ];
  sourceLabels.forEach(([id, key]) => {
    const node = el(id);
    if (!node) return;
    node.textContent = recommendation.fallback?.[key]
      ? "Manual fallback is active for this value."
      : "Generated or suggested value is available for this field.";
  });
}

function recommendedBaselineReturn(recommendation) {
  const equityWeight = recommendation.assets.equity.weight;
  const equityContribution = Object.entries(recommendation.regions).reduce((sum, [key, region]) => {
    const referenceReturn = equityTargetReturnReference(key, recommendation);
    return sum + (equityWeight * region.share / 100 / 100) * referenceReturn;
  }, 0);
  return equityContribution
    + (recommendation.assets.bond.weight / 100) * recommendation.assets.bond.return
    + (recommendation.assets.alternative.weight / 100) * recommendation.assets.alternative.return
    + (recommendation.assets.cash.weight / 100) * recommendation.assets.cash.return;
}

function equityTargetReturnReference(key, recommendation) {
  if (key === "us") return selectedMarketReturn();
  const regionReturn = Number(recommendation?.regions?.[key]?.return);
  if (Number.isFinite(regionReturn)) return regionReturn;
  return marketCmaForSleeve(key);
}

function applyAllocationRecommendation() {
  if (!requirePermission("annualData", "accept annual historical allocation recommendation")) return;
  const recommendation = currentAllocationRecommendation();
  const finalTarget = currentFinalTargetReturn ?? readNumber(el("finalTargetRate"));
  const equityWeight = recommendation.assets.equity.weight;
  const equityWeights = Object.fromEntries(equityMarketKeys.map((key) => [
    key,
    equityWeight * recommendation.regions[key].share / 100,
  ]));
  const bondWeight = recommendation.assets.bond.weight;
  const alternativeWeight = recommendation.assets.alternative.weight;
  const cashWeight = recommendation.assets.cash.weight;
  const baselineReturn = recommendedBaselineReturn(recommendation);
  const rawTargetGap = finalTarget - baselineReturn;
  const targetShortfallGap = Math.max(0, rawTargetGap);
  const expectedBuffer = Math.max(0, -rawTargetGap);
  const equityGapBase = Math.max(Object.values(equityWeights).reduce((sum, value) => sum + value, 0), 0.01);
  const nonEquityContribution = (bondWeight / 100) * recommendation.assets.bond.return
    + (alternativeWeight / 100) * recommendation.assets.alternative.return
    + (cashWeight / 100) * recommendation.assets.cash.return;
  const method = selectedEquityReturnAllocationMethod();
  const equityResidualContribution = Math.max(0, finalTarget - nonEquityContribution);
  const equityContributions = Object.fromEntries(equityMarketKeys.map((key) => {
    const weight = equityWeights[key];
    const referenceReturn = equityTargetReturnReference(key, recommendation);
    const contribution = method === "pureProRata"
      ? equityResidualContribution * (weight / equityGapBase)
      : (weight / 100) * referenceReturn + targetShortfallGap * (weight / equityGapBase);
    return [key, contribution];
  }));

  equityMarketKeys.forEach((key) => {
    const config = equityMarketInputConfig[key];
    el(config.targetWeightId).value = equityWeights[key].toFixed(2);
    if (config.cmaId) el(config.cmaId).value = recommendation.regions[key].return.toFixed(2);
    if (method !== "manual") el(config.contributionId).value = equityContributions[key].toFixed(2);
  });
  el("bondTargetWeight").value = bondWeight.toFixed(2);
  el("bondReferenceReturn").value = recommendation.assets.bond.return.toFixed(2);
  el("alternativeTargetWeight").value = alternativeWeight.toFixed(2);
  el("alternativeReferenceReturn").value = recommendation.assets.alternative.return.toFixed(2);
  el("cashTargetWeight").value = cashWeight.toFixed(2);
  el("cashReferenceReturn").value = recommendation.assets.cash.return.toFixed(2);

  resetTargetApproval({ preserveVersionNote: true });
  const auditDetail = method === "pureProRata"
    ? `${scenarioLabels[selectedScenario()]} suggestion applied; positive equity residual ${percent(equityResidualContribution)} allocated by equity-market share.`
    : method === "manual"
      ? `${scenarioLabels[selectedScenario()]} suggestion applied; equity contribution inputs preserved for manual allocation.`
      : `${scenarioLabels[selectedScenario()]} suggestion applied; positive shortfall gap ${percent(targetShortfallGap)} allocated across equity regions; expected buffer ${percent(expectedBuffer)}.`;
  logAudit("Annual historical allocation recommendation accepted", auditDetail);
  calculate();
  const sourceText = marketStatisticsRecommendations ? "historical public-data engine output" : "administrator default historical policy set";
  const appliedMessage = `${scenarioLabels[selectedScenario()]} annual recommendation accepted from ${sourceText}; approved weights and reference returns are now available for execution workflow.`;
  const summaryItems = [
    ["U.S. equity", equityWeights.us],
    ["Developed ex-U.S. equity", equityWeights.developed],
    ["Emerging markets equity", equityWeights.emerging],
    ["Bond", bondWeight],
    ["Alternative", alternativeWeight],
    ["Cash", cashWeight],
  ];
  if (el("allocationRecommendationStatus")) {
    el("allocationRecommendationStatus").textContent = appliedMessage;
    el("allocationRecommendationStatus").className = "validation-message is-valid";
  }
  if (el("sleeveAllocationOwnerStatus")) {
    el("sleeveAllocationOwnerStatus").textContent = appliedMessage;
    el("sleeveAllocationOwnerStatus").className = "validation-message is-valid";
  }
  const summary = el("appliedSleeveWeightSummary");
  if (summary) {
    summary.replaceChildren();
    summaryItems.forEach(([label, value]) => {
      const item = document.createElement("span");
      const name = document.createElement("b");
      name.textContent = label;
      item.append(name, document.createTextNode(percent(value)));
      summary.append(item);
    });
    summary.hidden = false;
  }
  const targetBox = document.querySelector(".us-equity-target-box");
  if (targetBox) {
    setActiveWorkflowPage("step-target", { scroll: false });
    targetBox.classList.add("is-applied");
    el("step-target")?.scrollIntoView({ block: "start", behavior: "smooth" });
    window.setTimeout(() => targetBox.classList.remove("is-applied"), 1800);
  }
}

function updateUsEquityTargetReturn(finalTarget, isTargetValid) {
  const weight = readNumber(el("usEquityTargetWeight"));
  const contribution = readNumber(el("usEquityReturnContribution"));
  const bondWeight = readNumber(el("bondTargetWeight"));
  const bondReturn = readNumber(el("bondReferenceReturn"));
  const alternativeWeight = readNumber(el("alternativeTargetWeight"));
  const alternativeReturn = readNumber(el("alternativeReferenceReturn"));
  const cashWeight = readNumber(el("cashTargetWeight"));
  const cashReturn = readNumber(el("cashReferenceReturn"));
  const isValid = isTargetValid && weight > 0 && weight <= 100;
  const sleeveTargetReturn = isValid ? contribution / (weight / 100) : null;
  const nonUsTargets = Object.fromEntries(nonUsEquityMarketKeys.map((key) => {
    const config = equityMarketInputConfig[key];
    const marketWeight = readNumber(el(config.targetWeightId));
    const marketContribution = readNumber(el(config.contributionId));
    const cma = marketCmaForSleeve(key);
    const targetReturn = marketWeight > 0 ? marketContribution / (marketWeight / 100) : null;
    return [key, { weight: marketWeight, contribution: marketContribution, cma, targetReturn }];
  }));
  const bondContribution = (bondWeight / 100) * bondReturn;
  const alternativeContribution = (alternativeWeight / 100) * alternativeReturn;
  const cashContribution = (cashWeight / 100) * cashReturn;
  const allocatedTargetReturn = contribution
    + Object.values(nonUsTargets).reduce((sum, target) => sum + target.contribution, 0)
    + bondContribution
    + alternativeContribution
    + cashContribution;
  const allocationGap = isTargetValid ? allocatedTargetReturn - finalTarget : null;

  currentTargetAllocationPass = allocationGap !== null && allocationGap >= -0.05;
  const usRiskFreeRate = sleeveRiskFreeRate("us");
  const usCma = marketCmaForSleeve("us");
  const usBeta = sleeveTargetReturn === null ? { isValid: false } : validateCapmInputs(sleeveTargetReturn, usRiskFreeRate, usCma);
  const nonUsBetas = Object.fromEntries(nonUsEquityMarketKeys.map((key) => {
    const target = nonUsTargets[key];
    return [key, target.targetReturn === null ? { isValid: false } : validateCapmInputs(target.targetReturn, sleeveRiskFreeRate(key), target.cma)];
  }));

  currentEquitySleeveTargets = {
    us: {
	      targetReturn: sleeveTargetReturn,
	      cma: usCma,
	      riskFreeRate: usRiskFreeRate,
	      beta: usBeta.isValid ? usBeta.beta : null,
	      benchmark: selectedBenchmarkLabel(),
	    },
  };
  nonUsEquityMarketKeys.forEach((key) => {
    const config = equityMarketInputConfig[key];
    const target = nonUsTargets[key];
    const beta = nonUsBetas[key];
	    currentEquitySleeveTargets[key] = {
	      targetReturn: target.targetReturn,
	      cma: target.cma,
	      riskFreeRate: sleeveRiskFreeRate(key),
	      beta: beta.isValid ? beta.beta : null,
	      benchmark: config.benchmarkLabel(),
	    };
  });

  currentUsEquityTargetReturn = sleeveTargetReturn;
  el("usEquityTargetReturn").textContent = sleeveTargetReturn === null ? "Invalid" : percent(sleeveTargetReturn);
  el("usEquityTargetReturnValidation").textContent = sleeveTargetReturn === null
    ? "Enter a valid U.S. equity target weight and contribution."
    : `${percent(contribution)} contribution / ${percent(weight)} target weight = ${percent(sleeveTargetReturn)} U.S. equity sleeve target return.`;
  el("usEquityTargetReturnValidation").className = sleeveTargetReturn === null
    ? "validation-message is-invalid"
    : "validation-message is-valid";
	  el("usEquityCmaDisplay").textContent = `${selectedBenchmarkLabel()} ${percent(usCma)}`;
	  if (el("usEquityRiskFreeDisplay")) el("usEquityRiskFreeDisplay").textContent = percent(usRiskFreeRate);
	  el("usEquityAllocationTargetBeta").textContent = usBeta.isValid ? usBeta.beta.toFixed(2) : "Invalid";
	  el("usEquityAllocationTargetBeta").className = usBeta.isValid ? "is-close" : "is-off";
	  nonUsEquityMarketKeys.forEach((key) => {
	    const config = equityMarketInputConfig[key];
	    const target = nonUsTargets[key];
	    const beta = nonUsBetas[key];
	    el(config.targetReturnId).textContent = target.targetReturn === null ? "Invalid" : `${percent(target.targetReturn)} target return`;
	    const riskFreeDisplayId = `${key}EquityRiskFreeDisplay`;
	    if (el(riskFreeDisplayId)) el(riskFreeDisplayId).textContent = percent(sleeveRiskFreeRate(key));
	    el(config.targetBetaId).textContent = beta.isValid ? beta.beta.toFixed(2) : "Invalid";
	    el(config.targetBetaId).className = beta.isValid ? "is-close" : "is-off";
	  });
  el("bondReturnContribution").textContent = percent(bondContribution);
  el("alternativeReturnContribution").textContent = percent(alternativeContribution);
  el("cashReturnContribution").textContent = percent(cashContribution);
  el("allocatedTargetReturn").textContent = percent(allocatedTargetReturn);
	  el("allocationValidation").textContent = currentTargetAllocationPass
	    ? `Allocated weighted return meets or exceeds the approved target floor. Buffer ${percent(Math.max(0, allocationGap || 0))}.`
	    : `Allocated weighted return is below the approved target floor. Shortfall ${allocationGap === null ? "Invalid" : percent(Math.abs(allocationGap))}.`;
  el("allocationValidation").className = currentTargetAllocationPass
    ? "validation-message is-valid"
    : "validation-message is-invalid";
  return sleeveTargetReturn;
}

function updateCapmResult(usEquityTargetReturn, isTargetValid) {
  const riskFreeRate = sleeveRiskFreeRate("us");
  const expectedMarketReturn = marketCmaForSleeve("us");

  if (!isTargetValid || usEquityTargetReturn === null) {
    currentTargetBeta = null;
    el("impliedBeta").textContent = "Invalid";
    el("capmValidation").textContent = "Enter a valid U.S. equity return contribution before using CAPM. This becomes the U.S. equity beta target.";
    el("capmValidation").className = "validation-message is-invalid";
    updatePortfolio();
    return;
  }

  const capmValidation = validateCapmInputs(usEquityTargetReturn, riskFreeRate, expectedMarketReturn);
  if (!capmValidation.isValid) {
    currentTargetBeta = null;
    el("impliedBeta").textContent = "Invalid";
    el("capmValidation").textContent = capmValidation.message;
    el("capmValidation").className = "validation-message is-invalid";
    updatePortfolio();
    return;
  }

  const beta = capmValidation.beta;
  currentTargetBeta = beta;
  el("impliedBeta").textContent = beta.toFixed(2);
  el("capmValidation").textContent = `U.S. equity target beta is calculated against ${selectedBenchmarkLabel()}: (U.S. equity sleeve target return - ${sleeveRiskFreeRateLabel("us")}) / (${selectedBenchmarkLabel()} CMA - ${sleeveRiskFreeRateLabel("us")}). Non-U.S. sleeves use their own market/currency risk-free rates.`;
  el("capmValidation").className = "validation-message is-valid";
  updatePortfolio();
}

function renderBenchmarkControlMap() {
  const body = el("benchmarkControlMapRows");
  if (!body) return;
  body.replaceChildren();
  const selectedBenchmark = selectedBenchmarkLabel();
  const rows = [
    ["U.S. equity sleeve beta", selectedBenchmark, "Hard control", "Target beta, backtest beta, and optimizer control for the U.S. sleeve."],
    ["Developed ex-U.S. equity sleeve beta", "1306.T", "Hard control", "Japan holdings are tested against the local Japan market benchmark."],
    ["Emerging markets equity sleeve beta", "2800.HK 60% + 510300.SS 40%", "Hard control", "Hong Kong and China A holdings are tested against local-market benchmark proxies."],
    ["Whole-portfolio beta", "Blended policy benchmark from approved sleeve weights", "Reference only", "Shown for risk context; it is not a backtest or optimizer pass/fail control."],
    ["Bond, alternative, and cash sleeves", "Reference returns and drawdown/liquidity controls", "Non-CAPM controls", "Governed by weights, reference returns, liquidity, duration/credit risk, and drawdown."],
  ];

  rows.forEach((item) => {
    const row = document.createElement("tr");
    item.forEach((value, index) => {
      const cell = document.createElement(index === 2 ? "th" : "td");
      cell.textContent = value;
      if (index === 2) {
        cell.className = value === "Hard control" ? "is-close" : (value === "Reference only" ? "is-warning" : "");
      }
      row.append(cell);
    });
    body.append(row);
  });

  const status = el("benchmarkControlMapStatus");
  if (status) {
    status.textContent = currentTargetBeta !== null
      ? "Sleeve beta controls use locked benchmarks. Whole-portfolio beta remains a reference monitor only."
      : `Select valid CAPM inputs to activate the U.S. equity hard-control benchmark.`;
    status.className = currentTargetBeta !== null ? "validation-message is-valid" : "validation-message is-warning";
  }
}

function calculate(options = {}) {
  const cost = readNumber(el("costRate"));
  const cpi = chosenRate("cpi");
  updateCpiValidation();
  const base = cost + cpi;
  const outlook = marketOutlookBand();
  const targetBand = addToBand(base, outlook);
  const capital = readNumber(el("capital"));
  const scenario = selectedScenario();

  if (options.resetManualTarget) refreshSelectedOutlook(outlook);

  applySelectedOutlookConstraints(outlook);
  applyFinalTargetConstraints(targetBand);
  const selectedOutlook = readNumber(el("selectedOutlookRate"));
  const isOutlookValid = isTargetInsideBand(selectedOutlook, outlook);
  const computedFinalTarget = base + selectedOutlook;
  const lockedApprovedTarget = backendState.approvedTargetPackage && Number.isFinite(Number(backendState.approvedTargetPackage.finalTargetReturn));
  const finalTarget = lockedApprovedTarget ? Number(backendState.approvedTargetPackage.finalTargetReturn) : computedFinalTarget;
  const isValid = lockedApprovedTarget || (isOutlookValid && isTargetInsideBand(computedFinalTarget, targetBand));
  const outlookBandText = formatBand(outlook);
  el("finalTargetRate").value = finalTarget.toFixed(2);
  currentFinalTargetReturn = isValid ? finalTarget : null;
  el("selectedOutlookRate").setCustomValidity(isOutlookValid ? "" : formatBandRequirement(outlook));
  el("finalTargetRate").setCustomValidity(isValid ? "" : formatBandRequirement(targetBand));

  el("costPreview").textContent = percent(cost);
  el("cpiPreview").textContent = percent(cpi);
  el("formulaTargetPreview").textContent = percent(finalTarget);
  el("selectedOutlookPreview").textContent = percent(selectedOutlook);
  el("selectedOutlookBand").value = outlookBandText;
  el("targetRate").textContent = percent(finalTarget);
  el("targetRateLarge").textContent = percent(finalTarget);
  el("targetBandSummary").textContent = formatBand(targetBand);
  el("costSummary").textContent = percent(cost);
  el("cpiSummary").textContent = percent(cpi);
  el("outlookSummary").textContent = isOutlookValid ? `${percent(selectedOutlook)} within ${outlookBandText}` : outlookBandText;
  el("scenarioSummary").textContent = scenarioLabels[scenario];
  el("outlookValidation").textContent = isOutlookValid ? "Within the selected scenario range" : formatBandRequirement(outlook);
  el("outlookValidation").className = isOutlookValid ? "validation-message is-valid" : "validation-message is-invalid";
  el("targetValidation").textContent = lockedApprovedTarget
    ? "Loaded from approved backend target package."
    : (isValid ? "Operating cost + CPI + selected market outlook value." : "Select a valid market outlook value before approving the annual target.");
  el("targetValidation").className = isValid ? "validation-message is-valid" : "validation-message is-invalid";
  el("profitTarget").textContent = isValid ? currency.format(capital * finalTarget / 100) : "Invalid target";
  renderAllocationRecommendation(finalTarget, isValid);
  updateBenchmarkReference();
  const usEquityTargetReturn = updateUsEquityTargetReturn(finalTarget, isValid);
  const equityBaseTargetReturn = approvedEquityTargetReturn();
  updateTargetDrawdown(equityBaseTargetReturn ?? usEquityTargetReturn, isValid && (equityBaseTargetReturn !== null || usEquityTargetReturn !== null));
  updateCapmResult(usEquityTargetReturn, isValid);
  renderBenchmarkControlMap();
  updateBlendedPolicyBenchmark();
  updateTargetApprovalDecision();
}

function addSource(type) {
  if (!requirePermission("decision", "add forecast source")) return;
  state[type].push({
    name: "New Source",
    rate: 0,
    sourceDate: "2026-06-20",
    enteredBy: "Manual decision input",
    note: "",
    status: "Included in calculation",
    selected: state[type].length === 0,
  });
  logAudit("Forecast source added", `${type.toUpperCase()} source added`);
  renderSources(type);
  resetTargetApproval();
  calculate({ resetManualTarget: true });
}

function addManualCpiSourceFromInputs() {
  if (!requirePermission("decision", "add manual CPI source")) return;
  const name = String(el("manualCpiSourceName").value || "").trim();
  const rate = Number.parseFloat(el("manualCpiSourceRate").value);
  const sourceDate = el("manualCpiSourceDate").value || todayIso();
  const note = String(el("manualCpiSourceNote").value || "").trim();
  const status = el("manualCpiSourceStatus");
  if (!name || !Number.isFinite(rate)) {
    status.textContent = "Manual CPI source needs a source name and numeric forecast rate.";
    status.className = "validation-message is-invalid";
    return;
  }
  state.cpi.push({
    name,
    rate,
    sourceDate,
    enteredBy: currentAuditActor(),
    note,
    sourceUrl: extractFirstUrl(note),
    status: "Included in calculation",
    selected: false,
  });
  el("manualCpiSourceName").value = "";
  el("manualCpiSourceRate").value = "";
  el("manualCpiSourceDate").value = todayIso();
  el("manualCpiSourceNote").value = "";
  status.textContent = `Manual CPI source added and included in the average: ${name} ${percent(rate)}.`;
  status.className = "validation-message is-valid";
  logAudit("Manual CPI source added", `${name}: ${percent(rate)} by ${currentAuditActor()}`);
  renderSources("cpi");
  resetTargetApproval();
  calculate({ resetManualTarget: true });
}

function resetAll() {
  if (!requirePermission("admin", "reset system")) return;
  state.cpi = structuredClone(defaults.cpi);
  state.holdings = structuredClone(defaults.holdings);
  state.proposal = structuredClone(defaults.proposal);
  state.portfolioVersion = structuredClone(defaults.portfolioVersion);
  state.targetCommittee = structuredClone(defaults.targetCommittee);
  state.committee = structuredClone(defaults.committee);
  state.rebalanceException = structuredClone(defaults.rebalanceException);
  state.rebalanceExceptionCommittee = structuredClone(defaults.rebalanceExceptionCommittee);
  state.tradeOrders = structuredClone(defaults.tradeOrders);
  state.systemAdmin = defaults.systemAdmin;
  state.currentUser = defaults.currentUser;
  state.users = structuredClone(defaults.users);
  state.userCredentials = structuredClone(defaults.userCredentials);
  state.investmentStyle = defaults.investmentStyle;
  state.optimizerScopeRegion = defaults.optimizerScopeRegion;
  state.optimizerScopeAssetClass = defaults.optimizerScopeAssetClass;
  state.optimizerScopeStyle = defaults.optimizerScopeStyle;
  optimizerOptions = [];
  selectedOptimizationOptionId = "";
  state.rebalanceLowerDrift = defaults.rebalanceLowerDrift;
  state.rebalanceUpperDrift = defaults.rebalanceUpperDrift;
  state.rebalanceCompletionDays = defaults.rebalanceCompletionDays;
  state.rebalanceActionStatus = defaults.rebalanceActionStatus;
  state.rebalancePlanChoice = defaults.rebalancePlanChoice;
  state.rebalanceAcceptedPlan = structuredClone(defaults.rebalanceAcceptedPlan);
  state.rebalanceCheckFrequency = defaults.rebalanceCheckFrequency;
  state.rebalanceFormalCheckDate = defaults.rebalanceFormalCheckDate;
  state.rebalanceFormalCheckOpen = defaults.rebalanceFormalCheckOpen;
  state.rebalanceOwner = defaults.rebalanceOwner;
  state.tradeApprovalLimit = defaults.tradeApprovalLimit;
  state.nonEquityNav = structuredClone(defaults.nonEquityNav);
  state.systemConfig = structuredClone(defaults.systemConfig);
  priceHistory = [];
  betaEstimates = {};
  publicDataCacheAutoLoadAttempted = false;
  marketStatisticsRecommendations = null;
  actualHoldings = [];
  actualTrades = [];
  cashFlows = [];
  actualEquityValueHistory = [];
  dataLoadRecords = [];
  dataLoadErrors = [];
  rebalanceFollowUps = [];
	  dataQuality = {
	    price: { status: "Missing", ok: false, message: "Historical price CSV has not been loaded." },
	    publicData: { status: "Missing", ok: false, message: "Public data engine has not been run." },
	    marketStats: { status: "Default", ok: true, message: "Using built-in historical allocation reference statistics." },
	    tickerUniverse: { status: "Pass", ok: true, message: "Default ticker universe loaded." },
	    proposedPortfolio: { status: "Missing", ok: false, message: "No proposed portfolio has been built in the system." },
	    actualHoldings: { status: "Missing", ok: true, message: "Actual holdings are not required before implementation." },
	    actualTrades: { status: "Missing", ok: true, message: "Actual trades are not required before execution." },
	    cashFlows: { status: "Missing", ok: true, message: "External cash flows are optional." },
	  };
  currentTargetReturnApproved = false;
  currentPortfolioBacktestPass = false;
  currentUsEquityReferenceBetaPass = false;
  currentTargetAllocationPass = false;
  currentEquitySleeveTargets = {};
  currentUsEquityTargetReturn = null;
  approvedVersionSnapshot = null;
  state.initialPrincipal = defaults.initialPrincipal;
  el("costRate").value = "4.00";
  el("capital").value = "1000000";
  el("usEquityTargetWeight").value = "45.00";
  el("usEquityReturnContribution").value = "3.60";
  el("developedEquityTargetWeight").value = "7.50";
  el("developedEquityReturnContribution").value = "0.44";
  el("developedEquityCma").value = "5.80";
  el("emergingEquityTargetWeight").value = "12.50";
  el("emergingEquityReturnContribution").value = "0.81";
  el("emergingEquityCma").value = "6.44";
  el("bondTargetWeight").value = "25.00";
  el("bondReferenceReturn").value = "4.00";
  el("manualBondFallbackReturn").value = "4.00";
  el("alternativeTargetWeight").value = "5.00";
  el("alternativeReferenceReturn").value = "3.00";
  el("manualAlternativeFallbackReturn").value = "3.00";
  el("cashTargetWeight").value = "5.00";
  el("cashReferenceReturn").value = "2.00";
  el("manualCashFallbackReturn").value = "2.00";
  el("riskFreeRateSource").value = defaults.riskFreeRateSource;
  el("manualRiskFreeRate").value = defaults.manualRiskFreeRate.toFixed(2);
  el("marketBenchmark").value = defaults.marketBenchmark;
  el("manualMarketReturn").value = defaults.manualMarketReturn.toFixed(2);
  el("outlookSourceDate").value = "2026-06-20";
  el("outlookSourceNote").value = "";
  el("publicSourceStatus").textContent = "Fetch public CPI sources or add manual CPI sources before approving the annual target.";
  el("publicSourceStatus").className = "validation-message";
  el("manualCpiSourceName").value = "";
  el("manualCpiSourceRate").value = "";
  el("manualCpiSourceDate").value = todayIso();
  el("manualCpiSourceNote").value = "";
  el("manualCpiSourceStatus").textContent = "Manual CPI source is available when public data cannot be read automatically.";
  el("manualCpiSourceStatus").className = "validation-message";
  el("capmSourceDate").value = "2026-06-20";
  el("capmEnteredBy").value = "Execution Team";
  el("capmSourceNote").value = "";
  el("capmSourceStatus").value = "Active";
  el("drawdownRatioLow").value = defaults.drawdownRatioLow.toFixed(2);
  el("drawdownRatioHigh").value = defaults.drawdownRatioHigh.toFixed(2);
  el("investmentStyle").value = defaults.investmentStyle;
  el("maxSingleSecurityWeight").value = defaults.maxSingleSecurityWeight;
  el("rebalanceLowerDrift").value = defaults.rebalanceLowerDrift;
  el("rebalanceUpperDrift").value = defaults.rebalanceUpperDrift;
  el("rebalanceCompletionDays").value = defaults.rebalanceCompletionDays;
  if (el("configTestDateOverride")) el("configTestDateOverride").value = "";
  el("rebalanceActionStatus").value = defaults.rebalanceActionStatus;
  el("rebalancePlanChoice").value = defaults.rebalancePlanChoice;
  updateAcceptedRebalancePlanStatus();
  el("rebalanceCheckFrequency").value = defaults.rebalanceCheckFrequency;
  el("rebalanceOwner").value = defaults.rebalanceOwner;
  el("exceptionTicker").value = defaults.rebalanceException.ticker;
  el("exceptionReason").value = defaults.rebalanceException.reason;
  el("tradeApprovalLimit").value = defaults.tradeApprovalLimit;
  el("executionManager").value = defaults.proposal.executionManager;
  el("proposalStatus").value = defaults.proposal.proposalStatus;
  el("proposalNote").value = defaults.proposal.proposalNote;
  applyStylePreset(defaults.investmentStyle);
  el("priceCsvInput").value = "";
  el("marketStatsInput").value = "";
  el("betaFrequency").value = "weekly";
  el("betaLookback").value = "36";
  el("backtestFrequency").value = "weekly";
  el("backtestLookback").value = "36";
  el("tickerUniverseInput").value = "";
  el("actualHoldingsInput").value = "";
  el("actualTradesInput").value = "";
  el("reportPeriod").value = defaults.reportPeriod;
  el("reportStartDate").value = "";
  el("reportEndDate").value = "";
  el("reportBeginningValue").value = String(defaults.initialPrincipal);
  el("reportEndingValue").value = "0";
  el("nonEquityNavAsOfDate").value = "";
  el("nonEquityBondNav").value = "0";
  el("nonEquityAlternativeNav").value = "0";
  el("nonEquityCashNav").value = "0";
  el("cashFlowInput").value = "";
  el("reportDistributionStatus").value = defaults.reportDistributionStatus;
  el("reportDistributionDate").value = defaults.reportDistributionDate;
  el("reportRecipientGroup").value = defaults.reportRecipientGroup;
  el("systemAdminName").value = defaults.systemAdmin;
  el("currentUserName").value = defaults.currentUser;
  initializeAuthGate();
  updateReportDistributionSummary();
  el("optimizerSelectionStatus").textContent = "No option selected.";
  renderOptimizationOptions();
  renderDataLoadRegistry();
  renderDataLoadErrorReport();
  renderRebalanceFollowUps();
  renderCashFlows();
  renderNonEquityNavReview();
  updateTickerUniverseStatus();
  renderActualHoldings();
  el("cpiMethod").value = "average";
  el("bullLow").value = defaults.scenarioBands.bull.low.toFixed(2);
  el("bullHigh").value = defaults.scenarioBands.bull.high.toFixed(2);
  el("balancedLow").value = defaults.scenarioBands.balanced.low.toFixed(2);
  el("balancedHigh").value = defaults.scenarioBands.balanced.high.toFixed(2);
  el("bearLow").value = defaults.scenarioBands.bear.low.toFixed(2);
  el("bearHigh").value = defaults.scenarioBands.bear.high.toFixed(2);
  document.querySelector(`input[name='marketScenario'][value='${defaults.scenario}']`).checked = true;
  renderSources("cpi");
  renderUsers();
  renderSystemConfig();
  renderTargetCommittee();
  renderCommittee();
  renderExceptionCommittee();
  renderTradeOrders();
  renderTradeReconciliation();
  renderPortfolioVersion();
  renderHoldings();
  updatePermissionVisibility();
  logAudit("System reset", "Application state reset to defaults");
  calculate({ resetManualTarget: true });
  renderEquityValuePanels();
}

el("costRate").addEventListener("input", () => {
  resetTargetApproval();
  calculate({ resetManualTarget: true });
});
el("capital").addEventListener("input", handlePrincipalInput);
el("activatePrincipalButton").addEventListener("click", activatePrincipal);
[
  "usEquityTargetWeight",
  "usEquityReturnContribution",
  "developedEquityTargetWeight",
  "developedEquityReturnContribution",
  "developedEquityCma",
  "emergingEquityTargetWeight",
  "emergingEquityReturnContribution",
  "emergingEquityCma",
  "bondTargetWeight",
  "bondReferenceReturn",
  "alternativeTargetWeight",
  "alternativeReferenceReturn",
  "cashTargetWeight",
  "cashReferenceReturn",
].forEach((id) => {
  el(id).addEventListener("input", () => {
    calculate();
  });
});

[
  "manualBondFallbackReturn",
  "manualAlternativeFallbackReturn",
  "manualCashFallbackReturn",
].forEach((id) => {
  el(id).addEventListener("input", () => {
    calculate();
    updatePublicDataFallbackStatus(currentAllocationRecommendation());
  });
});
el("selectedOutlookRate").addEventListener("input", () => {
  resetTargetApproval();
  calculate();
});
el("riskFreeRateSource").addEventListener("change", calculate);
el("manualRiskFreeRate").addEventListener("input", calculate);
el("marketBenchmark").addEventListener("change", () => {
  calculateBetaEstimates();
  updateBenchmarkReference();
  ensureBenchmarkReferenceData();
  renderHoldings();
  calculate();
});
el("manualMarketReturn").addEventListener("input", calculate);
[
  "outlookSourceDate",
  "outlookSourceNote",
].forEach((id) => {
  el(id).addEventListener("input", resetTargetApproval);
  el(id).addEventListener("change", resetTargetApproval);
});
el("drawdownRatioLow").addEventListener("input", calculate);
el("drawdownRatioHigh").addEventListener("input", calculate);
el("executionManager").addEventListener("input", updateProposalFromInputs);
el("proposalStatus").addEventListener("change", updateProposalFromInputs);
el("proposalNote").addEventListener("input", updateProposalFromInputs);
el("systemAdminName").addEventListener("change", () => {
  if (!requirePermission("admin", "change system administrator")) {
    el("systemAdminName").value = state.systemAdmin;
    return;
  }
  state.systemAdmin = el("systemAdminName").value;
  state.currentUser = state.systemAdmin;
  el("currentUserName").value = state.currentUser;
  logAudit("System administrator changed", `System administrator set to ${state.systemAdmin}`);
  updatePermissionStatus(`Current acting user updated to ${currentAuditActor()}.`, true);
  updatePermissionVisibility();
  refreshGovernanceAfterUserChange();
});
el("currentUserName").addEventListener("input", () => {
  state.currentUser = el("currentUserName").value;
  updatePermissionStatus(`Current acting user set to ${currentAuditActor()}.`, true);
  updatePermissionVisibility();
  refreshSelfProfileForm();
});
el("backendLoginButton").addEventListener("click", loginBackendUser);
el("backendPullAuditButton").addEventListener("click", pullBackendAuditLog);
el("backendSubmitTargetButton").addEventListener("click", submitTargetPackageFromConsole);
el("backendApproveTargetDecisionButton").addEventListener("click", () => approveTargetFromConsole("committee-1", state.userCredentials.decision.username));
el("backendSubmitPortfolioButton").addEventListener("click", submitPortfolioFromConsole);
el("backendApprovePortfolioDecisionButton").addEventListener("click", () => approvePortfolioFromConsole("committee-1", state.userCredentials.decision.username));
el("authGate").addEventListener("click", handleAuthGateClick);
el("openSystemAdminLoginButton").addEventListener("click", openAdminLogin);
el("openSystemDecisionLoginButton").addEventListener("click", openDecisionLogin);
el("openSystemExecutionLoginButton").addEventListener("click", openExecutionLogin);
el("unlockUserSetupButton").addEventListener("click", unlockUserSetup);
el("continueToRoleLoginButton").addEventListener("click", continueToRoleLogin);
el("backToAdminLoginButton").addEventListener("click", backToAdminLogin);
el("openDecisionLoginButton").addEventListener("click", openDecisionLogin);
el("openExecutionLoginButton").addEventListener("click", openExecutionLogin);
el("decisionLoginBackButton").addEventListener("click", backToRoleSelection);
el("executionLoginBackButton").addEventListener("click", backToRoleSelection);
el("enterDecisionSystemButton").addEventListener("click", () => enterControlCenter("decision"));
el("enterExecutionSystemButton").addEventListener("click", () => enterControlCenter("execution"));
el("saveSelfProfileButton").addEventListener("click", saveSelfProfile);
el("nextTargetReturnButton").addEventListener("click", () => setActiveWorkflowPage(profileNextWorkflowPage()));
el("previousWorkflowButton").addEventListener("click", () => moveWorkflowStep(-1));
el("nextWorkflowButton").addEventListener("click", () => moveWorkflowStep(1));
el("switchRoleButton").addEventListener("click", switchRoleLogin);
el("cleanViewButton").addEventListener("click", () => setUiMode("clean"));
el("detailViewButton").addEventListener("click", () => setUiMode("detail"));
["gateDecisionUser", "gateExecutionUser"].forEach((id) => {
  el(id).addEventListener("input", updateGateLoginUserLabels);
});
el("runSampleDemoButton").addEventListener("click", runSampleDemoFlow);
el("applyAllocationRecommendationButton").addEventListener("click", applyAllocationRecommendation);
el("investmentStyle").addEventListener("change", () => {
  if (!requirePermission("execution", "change investment style")) {
    el("investmentStyle").value = state.investmentStyle || defaults.investmentStyle;
    return;
  }
  state.investmentStyle = el("investmentStyle").value;
  applyStylePreset(el("investmentStyle").value);
  updatePortfolio();
});
[
  "equityMin",
  "equityMax",
  "bondMin",
  "bondMax",
  "alternativeMin",
  "alternativeMax",
  "cashMin",
  "cashMax",
  "cyclicalMin",
  "cyclicalMax",
  "growthStyleMin",
  "growthStyleMax",
  "activeMin",
  "activeMax",
  "usRegionMin",
  "usRegionMax",
  "japanRegionMin",
  "japanRegionMax",
  "hongKongRegionMin",
  "hongKongRegionMax",
  "chinaARegionMin",
  "chinaARegionMax",
  "globalRegionMin",
  "globalRegionMax",
  "maxSingleSecurityWeight",
].forEach((id) => {
  el(id).addEventListener("input", () => {
    el("investmentStyle").value = "custom";
    updatePortfolio();
  });
});
el("priceCsvInput").addEventListener("change", (event) => loadPriceCsv(event.target.files[0]));
el("marketStatsInput").addEventListener("change", (event) => markMarketStatsFileSelected(event.target.files[0]));
el("tickerUniverseInput").addEventListener("change", (event) => loadTickerUniverse(event.target.files[0]));
el("actualHoldingsInput").addEventListener("change", (event) => loadActualHoldings(event.target.files[0]));
el("actualTradesInput").addEventListener("change", (event) => loadActualTrades(event.target.files[0]));
el("loadSamplePricesButton").addEventListener("click", () => loadSampleCsv("./data/sample_prices_demo.csv", "sample_prices_demo.csv", loadPriceCsv, "betaEngineStatus"));
el("uploadMarketStatsButton").addEventListener("click", uploadSelectedMarketStatistics);
el("runPublicDataEngineButton").addEventListener("click", runPublicDataEngine);
el("loadSampleTickerUniverseButton").addEventListener("click", () => loadSampleCsv("./data/sample_ticker_universe.csv", "sample_ticker_universe.csv", loadTickerUniverse, "tickerUniverseStatus"));
el("loadAssumedPortfolioButton").addEventListener("click", loadAssumedTestPortfolio);
el("tickerQuickSearch").addEventListener("input", () => {
  renderTickerLookupResults();
  renderEquitySleeveBuilder();
});
el("loadSampleHoldingsButton").addEventListener("click", () => loadSampleCsv("./data/standard_actual_holdings.csv", "standard_actual_holdings.csv", loadActualHoldings, "actualHoldingsStatus"));
el("loadSampleTradesButton").addEventListener("click", loadAuthorizedTradeTestFill);
el("rebalanceLowerDrift").addEventListener("change", () => {
  if (!requirePermission("admin", "change rebalance lower corridor")) { el("rebalanceLowerDrift").value = state.rebalanceLowerDrift; return; }
  state.rebalanceLowerDrift = readNumber(el("rebalanceLowerDrift"));
  renderActualHoldings();
});
el("rebalanceUpperDrift").addEventListener("change", () => {
  if (!requirePermission("admin", "change rebalance upper corridor")) { el("rebalanceUpperDrift").value = state.rebalanceUpperDrift; return; }
  state.rebalanceUpperDrift = readNumber(el("rebalanceUpperDrift"));
  renderActualHoldings();
});
el("rebalanceCompletionDays").addEventListener("change", () => {
  if (!requirePermission("admin", "change rebalance completion deadline")) {
    el("rebalanceCompletionDays").value = state.rebalanceCompletionDays;
    return;
  }
  state.rebalanceCompletionDays = Math.max(1, readNumber(el("rebalanceCompletionDays")) || 1);
  el("rebalanceCompletionDays").value = state.rebalanceCompletionDays;
  renderActualHoldings();
});
el("rebalanceActionStatus").addEventListener("change", () => {
  if (!requirePermission("execution", "change rebalance action status")) { el("rebalanceActionStatus").value = state.rebalanceActionStatus; return; }
  state.rebalanceActionStatus = el("rebalanceActionStatus").value;
  renderActualHoldings();
});
el("rebalancePlanChoice").addEventListener("change", () => {
  if (!requirePermission("execution", "choose rebalance plan")) { el("rebalancePlanChoice").value = state.rebalancePlanChoice; return; }
  state.rebalancePlanChoice = el("rebalancePlanChoice").value;
  resetAcceptedRebalancePlan();
  renderActualHoldings();
});
el("acceptRebalancePlanButton").addEventListener("click", acceptRebalancePlan);
el("rebalanceCheckFrequency").addEventListener("change", () => {
  if (!requirePermission("execution", "change rebalance check frequency")) { el("rebalanceCheckFrequency").value = state.rebalanceCheckFrequency; return; }
  state.rebalanceCheckFrequency = el("rebalanceCheckFrequency").value;
  renderActualHoldings();
});
el("rebalanceOwner").addEventListener("change", () => {
  if (!requirePermission("execution", "change rebalance monitoring owner")) { el("rebalanceOwner").value = state.rebalanceOwner; return; }
  state.rebalanceOwner = el("rebalanceOwner").value.trim() || defaults.rebalanceOwner;
  el("rebalanceOwner").value = state.rebalanceOwner;
  renderActualHoldings();
});
el("addRebalanceFollowUpButton").addEventListener("click", addRebalanceFollowUp);
el("exceptionTicker").addEventListener("input", updateRebalanceExceptionFromInputs);
el("exceptionReason").addEventListener("input", updateRebalanceExceptionFromInputs);
el("tradeApprovalLimit").addEventListener("change", () => {
  if (!requirePermission("execution", "change trade authorization limit")) { el("tradeApprovalLimit").value = state.tradeApprovalLimit; return; }
  state.tradeApprovalLimit = readNumber(el("tradeApprovalLimit"));
  renderTradeOrders();
});
el("reportPeriod").addEventListener("change", updatePerformanceReport);
el("reportStartDate").addEventListener("input", updatePerformanceReport);
el("reportEndDate").addEventListener("input", updatePerformanceReport);
el("reportBeginningValue").addEventListener("input", updatePerformanceReport);
el("reportEndingValue").addEventListener("input", updatePerformanceReport);
[
  "nonEquityNavAsOfDate",
  "nonEquityBondNav",
  "nonEquityAlternativeNav",
  "nonEquityCashNav",
].forEach((id) => {
  el(id).addEventListener("input", updateNonEquityNavDraftFromInputs);
});
el("submitNonEquityNavButton").addEventListener("click", submitNonEquityNavReview);
el("approveNonEquityNavButton").addEventListener("click", approveNonEquityNavReview);
el("rejectNonEquityNavButton").addEventListener("click", rejectNonEquityNavReview);
el("cashFlowInput").addEventListener("change", (event) => loadCashFlows(event.target.files[0]));
el("loadSampleCashFlowsButton").addEventListener("click", () => loadSampleCsv("./data/standard_cash_flows.csv", "standard_cash_flows.csv", loadCashFlows, "cashFlowStatus"));
el("reportDistributionStatus").addEventListener("change", updateReportDistributionFromInputs);
el("reportDistributionDate").addEventListener("input", updateReportDistributionFromInputs);
el("reportRecipientGroup").addEventListener("input", updateReportDistributionFromInputs);
el("exportReportButton").addEventListener("click", exportPerformanceReport);
el("exportCommitteePackButton").addEventListener("click", exportCommitteeReviewPack);
el("exportAuditLogButton").addEventListener("click", exportAuditLog);
el("addCpiConfigSourceButton").addEventListener("click", addConfiguredCpiSource);
el("saveSystemConfigButton").addEventListener("click", saveSystemConfig);
el("activateSystemConfigButton").addEventListener("click", saveSystemConfig);
el("betaFrequency").addEventListener("change", () => {
  calculateBetaEstimates();
  renderHoldings();
  calculate();
});
el("betaLookback").addEventListener("change", () => {
  calculateBetaEstimates();
  renderHoldings();
  calculate();
});
el("backtestFrequency").addEventListener("change", () => {
  updatePortfolio();
});
el("backtestLookback").addEventListener("change", () => {
  updatePortfolio();
});
el("cpiMethod").addEventListener("change", () => {
  resetTargetApproval();
  calculate({ resetManualTarget: true });
});
el("findPublicSourcesButton").addEventListener("click", findLatestPublicSources);
el("resetButton").addEventListener("click", resetAll);
el("addManualCpiSourceButton").addEventListener("click", addManualCpiSourceFromInputs);
el("approveTargetReturnButton").addEventListener("click", () => setTargetReturnApproval("Approve"));
el("rejectTargetReturnButton").addEventListener("click", () => setTargetReturnApproval("Reject"));
el("newVersionButton").addEventListener("click", createNewPortfolioVersion);
el("addHoldingButton").addEventListener("click", addHolding);
el("addSleeveHoldingButton").addEventListener("click", () => addHoldingForSleeve(activePortfolioSleeve));
document.querySelectorAll("[data-sleeve-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activePortfolioSleeve = button.dataset.sleeveTab || "us";
    renderEquitySleeveBuilder();
  });
});
el("optimizeWeightsButton").addEventListener("click", scheduleOptimizeWeights);
el("acceptTickerReplacementPlanButton").addEventListener("click", acceptTickerReplacementPlan);
el("submitOptimizationOptionButton").addEventListener("click", submitSelectedOptimizationOption);
el("optimizerAdvice").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-optimization-option]");
  if (button) selectOptimizationOption(button.dataset.selectOptimizationOption);
});
el("addTradeOrderButton").addEventListener("click", addTradeOrder);
el("addUserButton").addEventListener("click", addUser);
document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => addSource(button.dataset.add));
});
document.querySelectorAll("input[name='marketScenario']").forEach((input) => {
  input.addEventListener("change", () => {
    resetTargetApproval();
    calculate({ resetManualTarget: true });
  });
});
["bullLow", "bullHigh", "balancedLow", "balancedHigh", "bearLow", "bearHigh"].forEach((id) => {
  el(id).addEventListener("input", () => {
    resetTargetApproval();
    calculate({ resetManualTarget: true });
  });
});

[
  "costRate",
  "capital",
  "cpiMethod",
  "selectedOutlookRate",
  "outlookSourceDate",
  "outlookSourceNote",
].forEach((id) => protectField(id, "decision", `change ${id}`));
protectRadioGroup("marketScenario", "decision", "change market scenario");

[
  "usEquityTargetWeight",
  "usEquityReturnContribution",
  "developedEquityTargetWeight",
  "developedEquityReturnContribution",
  "developedEquityCma",
  "emergingEquityTargetWeight",
  "emergingEquityReturnContribution",
  "emergingEquityCma",
  "bondTargetWeight",
  "bondReferenceReturn",
  "alternativeTargetWeight",
  "alternativeReferenceReturn",
  "cashTargetWeight",
  "cashReferenceReturn",
  "riskFreeRateSource",
  "manualRiskFreeRate",
  "marketBenchmark",
  "manualMarketReturn",
  "capmSourceDate",
  "capmEnteredBy",
  "capmSourceNote",
  "capmSourceStatus",
  "drawdownRatioLow",
  "drawdownRatioHigh",
  "equityMin",
  "equityMax",
  "bondMin",
  "bondMax",
  "alternativeMin",
  "alternativeMax",
  "cashMin",
  "cashMax",
  "cyclicalMin",
  "cyclicalMax",
  "growthStyleMin",
  "growthStyleMax",
  "activeMin",
  "activeMax",
  "usRegionMin",
  "usRegionMax",
  "japanRegionMin",
  "japanRegionMax",
  "hongKongRegionMin",
  "hongKongRegionMax",
  "chinaARegionMin",
  "chinaARegionMax",
  "globalRegionMin",
  "globalRegionMax",
  "maxSingleSecurityWeight",
  "nonEquityNavAsOfDate",
  "nonEquityBondNav",
  "nonEquityAlternativeNav",
  "nonEquityCashNav",
].forEach((id) => protectField(id, "execution", `change ${id}`));

[
  "manualBondFallbackReturn",
  "manualAlternativeFallbackReturn",
  "manualCashFallbackReturn",
].forEach((id) => protectField(id, "annualData", `change ${id}`));

restoreUserCredentialSnapshot();
renderSources("cpi");
renderUsers();
renderSystemConfig();
renderTargetCommittee();
renderCommittee();
renderExceptionCommittee();
renderTradeOrders();
renderTradeReconciliation();
renderCashFlows();
renderNonEquityNavReview();
renderDataLoadRegistry();
renderDataLoadErrorReport();
renderRebalanceFollowUps();
renderAuditLog();
initializeAuthGate();
setUiMode(defaults.uiMode);
updateEstimationPeriod();
initializeCurrentWorkflowTracker();
updatePermissionStatus(`Current acting user set to ${currentAuditActor()}.`, true);
updatePermissionVisibility();
renderTickerSuggestions();
renderHoldings();
renderPortfolioVersion();
syncPrincipalDisplay();
calculate({ resetManualTarget: true });
renderEquityValuePanels();
updateBackendWorkflowStatus();
restoreBackendSession().finally(() => hydrateRoleUsersFromBackend());
setupHoverRevealUi();
