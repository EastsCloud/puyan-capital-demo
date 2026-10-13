import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ProposedPortfolioEditor } from "./ProposedPortfolioEditor";
import { SecuritiesPage } from "./SecuritiesPage";
import { apiErrorMessage } from "./api-error";
import { HistoryCoveragePanel, type HistoryReport } from "./HistoryCoveragePanel";
import type { Holding } from "./proposed-portfolio-model";
import {
  Bell, CheckCircle2, ChevronRight, ClipboardCheck, CloudDownload, Database, FileBarChart,
  CalendarCheck, FileUp, Gauge, KeyRound, LoaderCircle, LogOut, Menu, ReceiptText, Send, Settings, ShieldCheck, Users, X,
} from "lucide-react";

type Locale = "zh-CN" | "en";
type Role = "system_admin" | "decision_committee" | "execution_team";
type Page = "overview" | "annual" | "portfolio" | "monitoring" | "reports" | "users" | "parameters" | "sources" | "connections" | "audit" | "securities";

interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  locale: Locale;
  mustChangePassword: boolean;
}

interface ManagedUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: Role;
  status: "invited" | "active" | "locked" | "disabled";
  locale: Locale;
  must_change_password: boolean;
}

interface ParameterResponse {
  source: "system_default" | "organization";
  parameterSet: { version: number; parameters: Record<string, any>; effective_from?: string; created_at: string };
}

interface PortfolioRecord {
  id: string;
  code: string;
  name: string;
  base_currency: string;
  initial_principal: string | number | null;
  principal_effective_at: string | null;
}

interface AnnualWorkflow {
  id: string;
  business_year: number;
  current_step: string;
  status: string;
  portfolio_name: string;
  base_currency: string;
}

interface SourceItem {
  code: string;
  display_name: string;
  authority_name: string;
  authority_tier: number;
  category: string;
  public_url: string;
  enabled: boolean;
  priority: number;
}

interface SourceResponse {
  version: number;
  source: "organization" | "system_default";
  settings: Record<string, { enabled: boolean; priority: number }>;
  sources: SourceItem[];
}

interface ExternalDataConnection {
  providerCode: "eodhd";
  displayName: string;
  configured: boolean;
  enabled: boolean;
  maskedToken: string | null;
  lastTestedAt: string | null;
  lastTestStatus: "succeeded" | "failed" | null;
  lastTestMessage: string | null;
  updatedAt: string | null;
}

interface AnnualDataPackage {
  id: string;
  version: number;
  as_of_date: string;
  scenario: "bull" | "balanced" | "bear";
  model_version: string;
  source_manifest: Array<{
    code: string; displayName: string; authorityName: string; priority: number;
    publicUrl: string; observationCount: number; firstObservation: string; lastObservation: string;
    licenseNote?: string | null;
    attempts?: Array<{ code: string; displayName: string; status: "succeeded" | "failed"; message?: string }>;
  }>;
  recommendation: {
    scenarioSampleMonths: number;
    historyStartDate: string;
    asOfDate: string;
    assetWeights: Record<"equity" | "bond" | "alternative" | "cash", number>;
    sleeveWeights: Record<"us" | "developedNonUs" | "emerging", number>;
    marketWeights: Record<"us" | "japan" | "chinaA" | "hongKong", number>;
    latestIndicators: { inflationYearOverYear: number; usTenYearYield: number; usTBillYield: number; globalEquityMomentum12m: number };
    objective: { expectedReturn: number; expectedVolatility: number; riskAversion: number };
  };
  accepted_at: string | null;
}

interface ApprovalRound { id: string; status: string; proposed_action: string }

interface TargetReturnContext {
  context: {
    scenario: "bull" | "balanced" | "bear";
    band: { low: number; high: number };
    operatingCostRate: number;
    expectedCpiRate: number;
    publicDataExpectedReturn: number;
    minimumEconomicFloor: number;
    suggestedTargetReturnRate: number;
  };
  targetReturnVersion: { id: string; version: number; target_return_rate: string | number; approved_at: string | null } | null;
}

interface SleeveTargetContext {
  context: {
    targetReturnRate: number;
    decomposition: { baselineReturn: number; expectedBuffer: number; shortfallAllocatedToEquity: number };
    equityTargets: Array<{
      key: "us" | "developedNonUs" | "emerging";
      withinEquityWeight: number;
      targetReturn: number;
      targetBeta: number;
      betaControlActive: boolean;
      riskFreeRate: number;
      maximumDrawdownLimit: number;
    }>;
  };
  sleeveTargetVersion: { id: string; version: number } | null;
}

interface TickerItem {
  id: string;
  ticker: string;
  exchange_code: string;
  name_en: string;
  name_zh: string;
  market: "US" | "JP" | "HK" | "CN_A";
  sleeve: "us" | "developedNonUs" | "emerging";
  style: "growth" | "value";
  source_url: string;
}

interface ProposedPortfolioContext {
  universe: TickerItem[];
  approvedSleeveWeights?: Partial<Record<"us" | "developedNonUs" | "emerging", number>>;
  policy: { maxSingleSecurityWeightPct: number; styleTickerMin: number; styleTickerMax: number };
  recommendedHoldings: Array<{ tickerUniverseId: string; weight: number }>;
  proposedPortfolioVersion: {
    id: string;
    version: number;
    holdings?: Array<{ ticker: string; exchange_code: string; weight: string | number }>;
  } | null;
}

interface BacktestRun {
  id: string;
  run_number: number;
  start_date: string;
  end_date: string;
  hard_control_pass: boolean;
  data_manifest: { provider: string; primaryProvider: string; primaryProviderStatus: string; symbols: string[]; coverageReport?: HistoryReport };
  metrics: { sleeves: Array<{
    sleeve: "us" | "developedNonUs" | "emerging";
    observationCount: number;
    annualizedReturn: number;
    targetReturn: number;
    returnControl: { status: "pass" | "review" | "fail" };
    beta: number;
    targetBeta: number;
    betaControl: { status: "pass" | "review" | "fail" };
    maximumDrawdown: number;
    maximumDrawdownLimit: number;
    drawdownControl: { status: "pass" | "fail" };
    hardPass: boolean;
  }> };
}

interface BacktestContext {
  policy: { months: number; frequency: string; betaRelative: number; returnShortfall: number; drawdownExcess: number };
  backtestRun: BacktestRun | null;
}

interface OptimizationCandidate {
  key: string;
  label: string;
  phase: "weight_only" | "minimum_ticker_replacement";
  tickerReplacements: number;
  turnover: number;
  sleeveResults?: Array<{
    sleeve: "us" | "developedNonUs" | "emerging";
    phase: "weight_only" | "minimum_ticker_replacement";
    tickerReplacements: number;
    turnover: number;
    metrics: { annualizedReturn: number; beta: number; maximumDrawdown: number };
    holdings: Array<{ ticker: string; currentWeight: number; proposedWeight: number }>;
  }>;
  sleeve?: "us" | "developedNonUs" | "emerging";
  metrics?: { annualizedReturn: number; beta: number; maximumDrawdown: number };
  holdings?: Array<{ ticker: string; currentWeight: number; proposedWeight: number }>;
}

interface OptimizationRun {
  id: string;
  run_number: number;
  constraints: { failedSleeves: Array<"us" | "developedNonUs" | "emerging">; phaseOrder: string[] };
  candidates: OptimizationCandidate[];
  selected_candidate_key: string | null;
}

function optimizationSleeveResults(candidate: OptimizationCandidate): NonNullable<OptimizationCandidate["sleeveResults"]> {
  if (candidate.sleeveResults) return candidate.sleeveResults;
  if (!candidate.sleeve || !candidate.metrics || !candidate.holdings) return [];
  return [{
    sleeve: candidate.sleeve,
    phase: candidate.phase,
    tickerReplacements: candidate.tickerReplacements,
    turnover: candidate.turnover,
    metrics: candidate.metrics,
    holdings: candidate.holdings,
  }];
}

interface PortfolioApprovalContext {
  portfolio: {
    id: string;
    version: number;
    status: string;
    start_date: string;
    end_date: string;
    targets: { equityTargets?: Array<{ key: "us" | "developedNonUs" | "emerging"; weight: number; targetReturn: number; targetBeta: number }> };
    metrics: BacktestRun["metrics"];
    holdings: Array<{ ticker: string; exchange_code: string; market: "US" | "JP" | "HK" | "CN_A"; sleeve: "us" | "developedNonUs" | "emerging"; style: string; weight: string | number }>;
  };
}

interface ImplementationContext {
  approvedPortfolio: { id: string; version: number; principal: number; currency: string };
  orders: Array<{
    ticker: string; market: string; sleeve: "us" | "developedNonUs" | "emerging"; style: string;
    side: "BUY"; sleeveWeight: number; portfolioWeight: number; targetValue: number; currency: string;
  }>;
  executionAction: {
    id: string; status: "pending_review" | "approved" | "rejected"; submitted_by: string;
    submitted_by_name: string; reviewed_by_name: string | null;
  } | null;
}

interface MonitoringContext {
  workflowStep: string;
  approvedHoldings: Array<{ ticker: string; exchangeCode: string; sleeve: "us" | "developedNonUs" | "emerging"; style: "growth" | "value"; weight: string | number }>;
  curve: Array<{ business_date: string; market_value: string | number; currency: string }>;
  latestSnapshot: null | {
    id: string; business_date: string; adapter_name: string; original_filename: string;
    lines: Array<{ ticker: string; exchangeCode: string; quantity: string | number; marketPrice: string | number; marketValue: string | number; classification: { sleeve: string; style: string } }>;
  };
  latestCheck: null | {
    id: string; check_date: string; triggered: boolean; corridor_lower_relative: string | number; corridor_upper_relative: string | number;
    results: Array<{ key: string; sleeve: string; style: string; targetWeight: number; currentWeight: number; lowerWeight: number; upperWeight: number; status: "within" | "below" | "above"; minimumTradeValue: number; tradeSide: "BUY" | "SELL" | null }>;
  };
  plans: Array<{
    id: string; option_key: string; label: string; status: "proposed" | "accepted" | "completed" | "overdue" | "cancelled"; completion_due_date: string;
    orders: Array<{ ticker: string; exchangeCode: string; sleeve: string; style: string; side: "BUY" | "SELL"; value: number }>;
  }>;
  latestFollowup: null | {
    id: string; verification_date: string; status: "completed" | "overdue"; option_key: string; completion_due_date: string;
    results: Array<{ key: string; status: "within" | "below" | "above" }>;
  };
}

interface UserNotification {
  id: string; category: string; title_key: string; body_key: string; read_at: string | null; created_at: string;
  context: { dueDate?: string; verificationDate?: string; breachedGroups?: string[] };
}

interface AuditEvent {
  id: string | number; action: string; entity_type: string; entity_id: string | null; outcome: "allowed" | "denied" | "failed";
  detail: Record<string, unknown>; occurred_at: string; actor_name: string | null; actor_username: string | null;
}

interface NonEquityNavContext {
  workflowStep: string; principal: number; currency: string;
  assetWeights: { bond: number; alternative: number; cash: number };
  latestEquityBusinessDate: string | null;
  navVersion: null | { id: string; version: number; as_of_date: string; bond_nav: string | number; alternative_nav: string | number; cash_nav: string | number; source_note: string; status: "submitted" | "approved" | "rejected" };
}

interface ReportData {
  asOfDate: string; currency: string; principal: number; totalNav: number; totalReturn: number; targetReturn: number; targetAchieved: boolean;
  equityCurve: Array<{ date: string; value: number }>;
  sleeveMetrics: Array<{ key: "us" | "developedNonUs" | "emerging"; observationCount: number; periodReturn: number | null; annualizedReturn: number | null; sharpe: number | null; sortino: number | null; maximumDrawdown: number | null }>;
  assetClassContributions: Array<{ key: "equity" | "bond" | "alternative" | "cash"; targetWeight: number; initialValue: number; endingValue: number; profitLoss: number; contributionPct: number }>;
  attribution: {
    marketEffect: number | null; allocationEffect: number; selectionEffect: number; interactionEffect: number | null;
    nonEquityEffect: number; openingAllocationEffect: number; totalContribution: number; pureSelectionAvailable: boolean;
    benchmarkVersion?: number; methodology: string;
  };
  dataQuality: { equityObservationCount: number; sleeveMetricsAvailable: boolean; nonEquityNavApproved: boolean; benchmarkAttributionAvailable: boolean };
  externalCashFlows: Array<{ flow_date: string; amount: number; currency: string; flow_type: "contribution" | "withdrawal"; reference?: string; note?: string }>;
  netExternalFlow: number;
  returnMethod: "simple" | "modified_dietz";
}

interface ReportContext {
  workflowStep: string;
  report: null | { id: string; version: number; status: "draft" | "published"; as_of_date: string; report_data: ReportData };
}

interface ExecutionEvidenceContext {
  workflowStep: string;
  approvedOrders: Array<{ ticker: string; exchangeCode: string; side: "BUY" | "SELL"; targetValue: number; currency: string }>;
  securityOptions: Array<{ ticker: string; exchange_code: string; name_en: string; name_zh: string; market: string }>;
  latestFillBatch: null | {
    id: string; business_date: string; status: "matched" | "exceptions"; original_filename: string;
    imported_by: string; review_status: "pending_review" | "approved" | "rejected"; reviewed_by_name: string | null;
    summary: { plannedOrders: number; importedFills: number; matched: number; exceptions: number; valueTolerancePct: number };
    lines: Array<{ ticker: string; exchangeCode: string; side: string; quantity: string | number; price: string | number; tradeValue: string | number; plannedValue: string | number; varianceValue: string | number; varianceRate: string | number | null; status: "matched" | "exception" | "unplanned" }>;
  };
  cashFlows: Array<{ id: string; flow_date: string; amount: string | number; currency: string; flow_type: "contribution" | "withdrawal"; reference: string | null; note: string | null }>;
}

interface ExecutionFillDraft {
  selected: boolean;
  ticker: string;
  exchangeCode: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  externalTradeId?: string;
  tradeValue: number;
  plannedValue: number;
  varianceValue: number;
  status: "matched" | "exception" | "unplanned" | "excluded" | "needs_review";
}

interface ExecutionFillPreview {
  importedLines: Array<Omit<ExecutionFillDraft, "selected" | "status"> & { status: "matched" | "exception" | "unplanned" }>;
  missingPlannedLines: Array<Omit<ExecutionFillDraft, "selected" | "status"> & { status: "exception" }>;
  summary: { plannedOrders: number; importedFills: number; matched: number; exceptions: number; valueTolerancePct: number };
}

interface SourceFileRecord {
  id: string; source_type: string; original_filename: string; content_type: string; byte_size: string | number; sha256: string;
  business_date: string | null; imported_at: string; retain_until: string; imported_by_name: string;
}

const parameterSpecs = [
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.operatingCostPct", zh: "运营成本率 (%)", en: "Operating cost rate (%)", step: 0.1 },
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.bandsPct.bull.low", zh: "牛市目标下限 (%)", en: "Bull target minimum (%)", step: 0.1 },
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.bandsPct.bull.high", zh: "牛市目标上限 (%)", en: "Bull target maximum (%)", step: 0.1 },
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.bandsPct.balanced.low", zh: "平衡市目标下限 (%)", en: "Balanced target minimum (%)", step: 0.1 },
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.bandsPct.balanced.high", zh: "平衡市目标上限 (%)", en: "Balanced target maximum (%)", step: 0.1 },
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.bandsPct.bear.low", zh: "熊市目标下限 (%)", en: "Bear target minimum (%)", step: 0.1 },
  { group: "目标收益率", groupEn: "Target return", path: "targetReturn.bandsPct.bear.high", zh: "熊市目标上限 (%)", en: "Bear target maximum (%)", step: 0.1 },
  { group: "年度配置模型", groupEn: "Annual allocation model", path: "annualAllocation.calibrationYears", zh: "历史校准年数", en: "Calibration years", step: 1 },
  { group: "年度配置模型", groupEn: "Annual allocation model", path: "annualAllocation.minimumScenarioMonths", zh: "情景最少样本月数", en: "Minimum regime sample months", step: 1 },
  { group: "年度配置模型", groupEn: "Annual allocation model", path: "annualAllocation.bullThresholdPct", zh: "牛市动量阈值 (%)", en: "Bull momentum threshold (%)", step: 0.1 },
  { group: "年度配置模型", groupEn: "Annual allocation model", path: "annualAllocation.bearThresholdPct", zh: "熊市动量阈值 (%)", en: "Bear momentum threshold (%)", step: 0.1 },
  { group: "年度配置模型", groupEn: "Annual allocation model", path: "annualAllocation.allocationStepPct", zh: "配置计算步长 (%)", en: "Allocation grid step (%)", step: 1 },
  ...(["bull", "balanced", "bear"] as const).flatMap((scenario) =>
    (["equity", "bond", "alternative", "cash"] as const).flatMap((asset) => [
      { group: "大类资产上下限", groupEn: "Asset-class bounds", path: `annualAllocation.assetBoundsPct.${scenario}.${asset}.min`, zh: `${scenario} / ${asset} 下限 (%)`, en: `${scenario} / ${asset} minimum (%)`, step: 1 },
      { group: "大类资产上下限", groupEn: "Asset-class bounds", path: `annualAllocation.assetBoundsPct.${scenario}.${asset}.max`, zh: `${scenario} / ${asset} 上限 (%)`, en: `${scenario} / ${asset} maximum (%)`, step: 1 },
    ]),
  ),
  ...(["us", "japan", "chinaA", "hongKong"] as const).flatMap((market) => [
    { group: "股票市场上下限", groupEn: "Equity-market bounds", path: `annualAllocation.marketBoundsPct.${market}.min`, zh: `${market} 下限 (%)`, en: `${market} minimum (%)`, step: 1 },
    { group: "股票市场上下限", groupEn: "Equity-market bounds", path: `annualAllocation.marketBoundsPct.${market}.max`, zh: `${market} 上限 (%)`, en: `${market} maximum (%)`, step: 1 },
  ]),
  ...(["bull", "balanced", "bear"] as const).map((scenario) => ({
    group: "风险厌恶系数", groupEn: "Risk aversion", path: `annualAllocation.riskAversion.${scenario}`,
    zh: `${scenario} 风险厌恶系数`, en: `${scenario} risk aversion`, step: 0.05,
  })),
  { group: "回测", groupEn: "Backtest", path: "backtest.betaRelativeTolerance", zh: "Beta 相对容差", en: "Beta relative tolerance", step: 0.01 },
  { group: "回测", groupEn: "Backtest", path: "backtest.returnShortfallTolerance", zh: "收益下限容差", en: "Return floor tolerance", step: 0.01 },
  { group: "回测", groupEn: "Backtest", path: "backtest.drawdownExcessTolerance", zh: "最大回撤相对容差", en: "Drawdown relative tolerance", step: 0.01 },
  { group: "组合限制", groupEn: "Portfolio limits", path: "portfolioConstruction.maxSingleSecurityWeightPct", zh: "单一证券上限 (%)", en: "Single security cap (%)", step: 1 },
  { group: "组合限制", groupEn: "Portfolio limits", path: "portfolioConstruction.styleTickerMin", zh: "每种风格最少证券数", en: "Minimum securities per style", step: 1 },
  { group: "组合限制", groupEn: "Portfolio limits", path: "portfolioConstruction.styleTickerMax", zh: "每种风格最多证券数", en: "Maximum securities per style", step: 1 },
  { group: "再平衡", groupEn: "Rebalancing", path: "rebalance.lowerRelativeDriftPct", zh: "Corridor 下限 (%)", en: "Corridor lower bound (%)", step: 1 },
  { group: "再平衡", groupEn: "Rebalancing", path: "rebalance.upperRelativeDriftPct", zh: "Corridor 上限 (%)", en: "Corridor upper bound (%)", step: 1 },
  { group: "再平衡", groupEn: "Rebalancing", path: "rebalance.completionTradingDays", zh: "完成期限（交易日）", en: "Completion deadline (trading days)", step: 1 },
  { group: "无风险利率", groupEn: "Risk-free rates", path: "riskFreeRatesPct.us", zh: "美国 (%)", en: "United States (%)", step: 0.1 },
  { group: "无风险利率", groupEn: "Risk-free rates", path: "riskFreeRatesPct.japan", zh: "日本 (%)", en: "Japan (%)", step: 0.1 },
  { group: "无风险利率", groupEn: "Risk-free rates", path: "riskFreeRatesPct.hongKong", zh: "香港 (%)", en: "Hong Kong (%)", step: 0.1 },
  { group: "无风险利率", groupEn: "Risk-free rates", path: "riskFreeRatesPct.chinaA", zh: "中国 A 股 (%)", en: "China A-share (%)", step: 0.1 },
] as const;

function valueAt(source: Record<string, any>, path: string): number {
  return path.split(".").reduce<any>((value, key) => value?.[key], source) ?? 0;
}

function withValue(source: Record<string, any>, path: string, value: number): Record<string, any> {
  const changed = structuredClone(source);
  const parts = path.split(".");
  let cursor: Record<string, any> = changed;
  parts.slice(0, -1).forEach((part) => { cursor = cursor[part]; });
  cursor[parts.at(-1)!] = value;
  return changed;
}

const copy = {
  "zh-CN": {
    signIn: "登录 isater", username: "用户名", password: "密码", submit: "登录", signingIn: "正在登录",
    invalid: "用户名或密码不正确。", unavailable: "账号已锁定或停用，请联系系统管理员。", welcome: "工作台",
    currentTask: "当前待办", noTask: "当前没有待处理事项", noTaskNote: "新的审批、复核或数据任务会显示在这里。",
    overview: "总览", annual: "年度流程", portfolio: "投资组合", monitoring: "监控", reports: "报告",
    users: "用户", parameters: "参数", sources: "数据源", connections: "数据连接", audit: "审计", logout: "退出", principal: "组合本金", baseCurrency: "基础货币",
    workflow: "年度流程状态", awaiting: "尚未启动", dataStatus: "市场数据", pending: "等待首次更新", roleLabel: "当前角色",
    changePassword: "设置新密码", changePasswordNote: "首次登录必须修改临时密码，然后才能进入系统。", currentPassword: "临时密码",
    newPassword: "新密码", confirmPassword: "确认新密码", passwordRule: "至少 12 位，并同时包含字母和数字。", savePassword: "保存并进入系统",
    passwordMismatch: "两次输入的新密码不一致。", passwordFailed: "密码不符合要求，或临时密码不正确。",
    userManagement: "用户管理", addUser: "新增用户", displayName: "姓名", email: "邮箱（可选）", role: "角色",
    temporaryPassword: "临时密码", createUser: "创建用户", creating: "正在创建", status: "状态", firstLogin: "首次改密",
    yes: "是", no: "否", noUsers: "尚未创建用户。", userCreated: "用户已创建，首次登录时必须修改临时密码。",
    duplicateUser: "用户名已存在，或资料不符合要求。", placeholderPage: "此模块将在后续业务流程中接入真实数据。",
    roles: { system_admin: "系统管理员", decision_committee: "决策委员会", execution_team: "执行小组" },
    statuses: { invited: "待首次登录", active: "正常", locked: "已锁定", disabled: "已停用" },
  },
  en: {
    signIn: "Sign in to isater", username: "Username", password: "Password", submit: "Sign in", signingIn: "Signing in",
    invalid: "The username or password is incorrect.", unavailable: "The account is locked or disabled. Contact the administrator.", welcome: "Workspace",
    currentTask: "Current task", noTask: "No action is due", noTaskNote: "New approvals, reviews and data tasks will appear here.",
    overview: "Overview", annual: "Annual cycle", portfolio: "Portfolio", monitoring: "Monitoring", reports: "Reports",
    users: "Users", parameters: "Parameters", sources: "Data sources", connections: "Data connections", audit: "Audit", logout: "Sign out", principal: "Portfolio principal", baseCurrency: "Base currency",
    workflow: "Annual cycle status", awaiting: "Not started", dataStatus: "Market data", pending: "Awaiting first update", roleLabel: "Current role",
    changePassword: "Set a new password", changePasswordNote: "You must replace the temporary password before entering the system.", currentPassword: "Temporary password",
    newPassword: "New password", confirmPassword: "Confirm new password", passwordRule: "At least 12 characters with letters and numbers.", savePassword: "Save and enter",
    passwordMismatch: "The new passwords do not match.", passwordFailed: "The password does not meet policy, or the temporary password is incorrect.",
    userManagement: "User management", addUser: "Add user", displayName: "Name", email: "Email (optional)", role: "Role",
    temporaryPassword: "Temporary password", createUser: "Create user", creating: "Creating", status: "Status", firstLogin: "Password change due",
    yes: "Yes", no: "No", noUsers: "No users have been created.", userCreated: "User created. The temporary password must be changed at first sign-in.",
    duplicateUser: "The username already exists, or the details are invalid.", placeholderPage: "This module will receive live data as the business workflow is implemented.",
    roles: { system_admin: "System Administrator", decision_committee: "Decision Committee", execution_team: "Execution Team" },
    statuses: { invited: "First sign-in due", active: "Active", locked: "Locked", disabled: "Disabled" },
  },
} as const;

let activeApiRequests = 0;
function reportApiActivity(delta: 1 | -1) {
  activeApiRequests = Math.max(0, activeApiRequests + delta);
  window.dispatchEvent(new CustomEvent("isater:api-activity", { detail: activeApiRequests }));
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  reportApiActivity(1);
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(path, { credentials: "include", ...init, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(apiErrorMessage(body, `HTTP ${response.status}`)), { code: body.error, body });
    return body as T;
  } finally {
    reportApiActivity(-1);
  }
}

function LanguageSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return <div className="language-switch" role="group" aria-label="Language">
    <button className={locale === "zh-CN" ? "active" : ""} onClick={() => onChange("zh-CN")}>中文</button>
    <button className={locale === "en" ? "active" : ""} onClick={() => onChange("en")}>EN</button>
  </div>;
}

function Brand({ inverted = false }: { inverted?: boolean }) {
  return <div className={inverted ? "brand-lockup inverted" : "brand-lockup"}>
    <div className="brand-mark" aria-hidden="true">I</div><div><strong>isater</strong><span>Puyan Capital</span></div>
  </div>;
}

function Login({ locale, onLocale, onAuthenticated }: { locale: Locale; onLocale: (locale: Locale) => void; onAuthenticated: (user: User) => void }) {
  const text = copy[locale];
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { onAuthenticated((await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) })).user); }
    catch (reason) { setError((reason as { code?: string }).code === "account_unavailable" ? text.unavailable : text.invalid); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <header className="login-header"><Brand /><LanguageSwitch locale={locale} onChange={onLocale} /></header>
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-context"><span className="context-line" /><p>Puyan Capital</p><h1>isater</h1></div>
      <form onSubmit={submit} className="login-form">
        <h2 id="login-title">{text.signIn}</h2>
        <label><span>{text.username}</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
        <label><span>{text.password}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? text.signingIn : text.submit}{!busy && <ChevronRight size={18} />}</button>
      </form>
    </section><footer className="login-footer">© 2026 Puyan Capital</footer>
  </main>;
}

function ChangePassword({ user, locale, onLocale, onChanged }: { user: User; locale: Locale; onLocale: (locale: Locale) => void; onChanged: () => void }) {
  const text = copy[locale];
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (newPassword !== confirm) return setError(text.passwordMismatch);
    setBusy(true);
    try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); onChanged(); }
    catch { setError(text.passwordFailed); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <header className="login-header"><Brand /><LanguageSwitch locale={locale} onChange={onLocale} /></header>
    <section className="password-panel">
      <div><span className="section-label">{user.displayName}</span><h1>{text.changePassword}</h1><p>{text.changePasswordNote}</p></div>
      <form className="login-form" onSubmit={submit}>
        <label><span>{text.currentPassword}</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
        <label><span>{text.newPassword}</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
        <label><span>{text.confirmPassword}</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
        <small className="form-note">{text.passwordRule}</small>{error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{text.savePassword}</button>
      </form>
    </section><footer className="login-footer">© 2026 Puyan Capital</footer>
  </main>;
}

function Overview({ locale, user }: { locale: Locale; user: User }) {
  const text = copy[locale];
  const zh = locale === "zh-CN";
  const [portfolio, setPortfolio] = useState<PortfolioRecord | null>(null);
  const [workflow, setWorkflow] = useState<AnnualWorkflow | null>(null);
  const [annualPackage, setAnnualPackage] = useState<AnnualDataPackage | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const loadPortfolio = () => api<{ portfolio: PortfolioRecord | null }>("/api/portfolio/current").then((result) => setPortfolio(result.portfolio));
  const loadOverview = async () => {
    const active = await api<{ workflow: AnnualWorkflow | null }>("/api/workflows/annual/active");
    setWorkflow(active.workflow);
    if (active.workflow) {
      const data = await api<{ annualDataPackage: AnnualDataPackage | null }>(`/api/workflows/${active.workflow.id}/annual-data/latest`);
      setAnnualPackage(data.annualDataPackage);
    }
  };
  useEffect(() => { void loadPortfolio(); void loadOverview(); }, []);
  async function activatePrincipal(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    try {
      await api("/api/portfolio/current/principal", { method: "POST", body: JSON.stringify({ amount: Number(amount) }) });
      await loadPortfolio(); setAmount(""); setMessage(zh ? "本金已经生效。" : "Principal is effective.");
    } catch { setMessage(zh ? "本金必须是大于零的有效金额。" : "Principal must be a valid amount above zero."); }
  }
  const principal = portfolio?.initial_principal == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: portfolio.base_currency, maximumFractionDigits: 0 }).format(Number(portfolio.initial_principal));
  const stepLabels: Record<string, [string, string]> = {
    annual_data: ["年度公开数据", "Annual public data"], target_return: ["目标收益率", "Target return"], sleeve_targets: ["Sleeve 目标", "Sleeve targets"],
    proposed_portfolio: ["拟投资组合", "Proposed portfolio"], backtest: ["回测", "Backtest"], optimization: ["优化", "Optimization"],
    portfolio_approval: ["组合审批", "Portfolio approval"], implementation: ["组合实施", "Implementation"], monitoring: ["监控与再平衡", "Monitoring"],
    non_equity_nav: ["非股票净值", "Non-equity NAV"], reporting: ["报告与归因", "Reporting"],
  };
  const workflowLabel = workflow ? (stepLabels[workflow.current_step]?.[zh ? 0 : 1] ?? workflow.current_step) : text.awaiting;
  const dataAsOf = annualPackage?.as_of_date?.slice(0, 10);
  const dataLabel = annualPackage ? (zh ? `已更新至 ${dataAsOf}` : `Updated through ${dataAsOf}`) : text.pending;
  return <>
    <section className="task-band"><div><span className="section-label">{text.currentTask}</span><h2>{text.noTask}</h2><p>{text.noTaskNote}</p></div><CheckCircle2 size={30} /></section>
    <section className="metrics-grid"><article><span>{text.principal}</span><strong>{principal}</strong><small>{text.baseCurrency}: {portfolio?.base_currency ?? "USD"}</small></article><article><span>{text.workflow}</span><strong>{workflowLabel}</strong><small>{workflow?.business_year ?? new Date().getFullYear()}</small></article><article><span>{text.dataStatus}</span><strong>{dataLabel}</strong><small>{annualPackage ? `${annualPackage.source_manifest.length} ${zh ? "个来源" : "sources"}` : "—"}</small></article></section>
    {user.role === "decision_committee" && portfolio?.initial_principal == null && <form className="principal-band" onSubmit={activatePrincipal}><label><span>{zh ? "初始本金（USD）" : "Initial principal (USD)"}</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><button className="primary-button">{zh ? "生效" : "Activate"}</button>{message && <p role="status">{message}</p>}</form>}
    {message && portfolio?.initial_principal != null && <p className="form-message overview-message" role="status">{message}</p>}
    <section className="role-line"><span>{text.roleLabel}</span><strong>{text.roles[user.role]}</strong></section>
    {user.role === "system_admin" && <DemoResetPanel locale={locale} />}
  </>;
}

function DemoResetPanel({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN"; const [enabled, setEnabled] = useState(false); const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { api<{ enabled: boolean }>("/api/admin/demo-reset/status").then((result) => setEnabled(result.enabled)).catch(() => setEnabled(false)); }, []);
  if (!enabled) return null;
  async function reset() {
    if (confirmation !== "RESET DEMO") return;
    setBusy(true); setMessage(null);
    try { await api("/api/admin/demo-reset", { method: "POST", body: JSON.stringify({ confirmation }) }); setConfirmation(""); setMessage(zh ? "演示业务数据已清空；用户、参数、外部数据连接和审计记录均已保留。刷新后可重新开始。" : "Demo business data were cleared; users, configuration, external data connection and audit were preserved."); }
    catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  return <section className="demo-reset-panel"><div><span className="section-label">{zh ? "仅演示环境" : "Demo environment only"}</span><h3>{zh ? "一键重置业务流程" : "Reset demo workflow"}</h3><p>{zh ? "清除年度流程、成交、持仓、现金流和报告；不会删除用户、业务参数、EODHD 凭证或审计记录。" : "Clears workflows, fills, positions, cash flows and reports. Users, policy, EODHD credentials and audit remain."}</p></div><div><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET DEMO" /><button className="text-danger-button confirm" onClick={reset} disabled={busy || confirmation !== "RESET DEMO"}>{busy ? (zh ? "正在重置" : "Resetting") : (zh ? "确认重置" : "Confirm reset")}</button></div>{message && <p className="form-message">{message}</p>}</section>;
}

function UsersPage({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState({ username: "", displayName: "", email: "", role: "decision_committee" as Role, temporaryPassword: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const load = () => api<{ users: ManagedUser[] }>("/api/admin/users").then((result) => setUsers(result.users));
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...form, email: form.email || undefined, locale }) });
      setForm({ username: "", displayName: "", email: "", role: "decision_committee", temporaryPassword: "" });
      setMessage(text.userCreated); await load();
    } catch { setMessage(text.duplicateUser); }
    finally { setBusy(false); }
  }
  async function resetUserPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetUserId) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/admin/users/${resetUserId}/reset-password`, { method: "POST", body: JSON.stringify({ temporaryPassword: resetPassword }) });
      setResetUserId(null); setResetPassword(""); await load();
      setMessage(locale === "zh-CN" ? "临时密码已生效，用户下次登录必须改密。" : "The temporary password is active and must be changed at next sign-in.");
    } catch { setMessage(locale === "zh-CN" ? "重置失败，请检查密码规则。" : "Reset failed. Check the password policy."); }
    finally { setBusy(false); }
  }
  return <section className="management-page">
    <header className="page-heading"><div><span className="section-label">{text.users}</span><h2>{text.userManagement}</h2></div></header>
    <form className="user-form" onSubmit={submit}>
      <h3>{text.addUser}</h3>
      <label><span>{text.username}</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
      <label><span>{text.displayName}</span><input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
      <label><span>{text.email}</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label><span>{text.role}</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="decision_committee">{text.roles.decision_committee}</option><option value="execution_team">{text.roles.execution_team}</option><option value="system_admin">{text.roles.system_admin}</option></select></label>
      <label className="wide"><span>{text.temporaryPassword}</span><input type="password" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} required /><small>{text.passwordRule}</small></label>
      <button className="primary-button form-submit" disabled={busy}>{busy ? text.creating : text.createUser}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
    <div className="table-wrap"><table><thead><tr><th>{text.username}</th><th>{text.displayName}</th><th>{text.role}</th><th>{text.status}</th><th>{text.firstLogin}</th><th>{locale === "zh-CN" ? "操作" : "Action"}</th></tr></thead><tbody>
      {users.map((item) => <tr key={item.id}><td>{item.username}</td><td>{item.display_name}</td><td>{text.roles[item.role]}</td><td>{text.statuses[item.status]}</td><td>{item.must_change_password ? text.yes : text.no}</td><td><button className="icon-text-button" title={locale === "zh-CN" ? "重置密码" : "Reset password"} onClick={() => { setResetUserId(item.id); setResetPassword(""); }}><KeyRound size={16} />{locale === "zh-CN" ? "重置密码" : "Reset"}</button></td></tr>)}
      {!users.length && <tr><td colSpan={6}>{text.noUsers}</td></tr>}
    </tbody></table></div>
    {resetUserId && <form className="reset-password-band" onSubmit={resetUserPassword}><label><span>{locale === "zh-CN" ? "新临时密码" : "New temporary password"}</span><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} required autoFocus /><small>{text.passwordRule}</small></label><div><button type="button" className="secondary-button" onClick={() => setResetUserId(null)}>{locale === "zh-CN" ? "取消" : "Cancel"}</button><button className="primary-button compact" disabled={busy}>{locale === "zh-CN" ? "确认重置" : "Confirm reset"}</button></div></form>}
  </section>;
}

function ParametersPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const [record, setRecord] = useState<ParameterResponse | null>(null);
  const [parameters, setParameters] = useState<Record<string, any> | null>(null);
  const [summary, setSummary] = useState(zh ? "首次启用经确认的系统默认值" : "Initial activation of approved system defaults");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = () => api<ParameterResponse>("/api/parameters/effective").then((result) => { setRecord(result); setParameters(result.parameterSet.parameters); });
  useEffect(() => { void load(); }, []);
  async function activate(event: FormEvent) {
    event.preventDefault();
    if (!parameters) return;
    setBusy(true); setMessage(null);
    try {
      await api("/api/admin/parameters/activate", { method: "POST", body: JSON.stringify({ parameters, changeSummary: summary }) });
      await load(); setMessage(zh ? "参数新版本已经生效。" : "The new parameter version is effective.");
    } catch { setMessage(zh ? "参数未能生效，请检查输入。" : "Parameters were not activated. Check the entries."); }
    finally { setBusy(false); }
  }
  if (!record || !parameters) return <section className="placeholder"><p>{zh ? "正在读取参数" : "Loading parameters"}</p></section>;
  const groups = Array.from(new Set(parameterSpecs.map((item) => zh ? item.group : item.groupEn)));
  return <section className="management-page">
    <header className="page-heading"><div><span className="section-label">{zh ? "业务规则" : "Business rules"}</span><h2>{zh ? "参数维护" : "Parameter maintenance"}</h2></div><div className="version-mark"><strong>v{record.parameterSet.version}</strong><span>{record.source === "system_default" ? (zh ? "系统默认值" : "System default") : (zh ? "机构生效值" : "Effective")}</span></div></header>
    <form onSubmit={activate} className="parameter-form">
      {groups.map((group) => <section className="parameter-section" key={group}><h3>{group}</h3><div className="parameter-grid">
        {parameterSpecs.filter((item) => (zh ? item.group : item.groupEn) === group).map((item) => <label key={item.path}><span>{zh ? item.zh : item.en}</span><input type="number" step={item.step} value={valueAt(parameters, item.path)} onChange={(e) => setParameters(withValue(parameters, item.path, Number(e.target.value)))} /></label>)}
      </div></section>)}
      <div className="activation-bar"><label><span>{zh ? "版本说明" : "Version note"}</span><input value={summary} onChange={(e) => setSummary(e.target.value)} required /></label><button className="primary-button" disabled={busy}>{busy ? (zh ? "正在生效" : "Activating") : (zh ? "生效" : "Activate")}</button></div>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  </section>;
}

function SourcesPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const [record, setRecord] = useState<SourceResponse | null>(null);
  const [settings, setSettings] = useState<SourceResponse["settings"]>({});
  const [summary, setSummary] = useState(zh ? "确认官方来源优先顺序" : "Confirm official-source priority");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = () => api<SourceResponse>("/api/data-sources/effective").then((result) => { setRecord(result); setSettings(result.settings); });
  useEffect(() => { void load(); }, []);
  async function activate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await api("/api/admin/data-sources/activate", { method: "POST", body: JSON.stringify({ settings, changeSummary: summary }) });
      await load(); setMessage(zh ? "数据源顺序新版本已经生效。" : "The new source-order version is effective.");
    } catch { setMessage(zh ? "数据源设置未能生效。" : "The data-source settings were not activated."); }
    finally { setBusy(false); }
  }
  if (!record) return <section className="placeholder"><p>{zh ? "正在读取数据源" : "Loading data sources"}</p></section>;
  return <section className="management-page">
    <header className="page-heading"><div><span className="section-label">{zh ? "外部数据" : "External data"}</span><h2>{zh ? "数据源优先级" : "Data-source priority"}</h2></div><div className="version-mark"><strong>v{record.version}</strong><span>{record.source === "system_default" ? (zh ? "系统默认值" : "System default") : (zh ? "机构生效值" : "Effective")}</span></div></header>
    <form className="source-form" onSubmit={activate}>
      <div className="table-wrap"><table><thead><tr><th>{zh ? "启用" : "Enabled"}</th><th>{zh ? "顺序" : "Priority"}</th><th>{zh ? "数据" : "Dataset"}</th><th>{zh ? "权威机构" : "Authority"}</th></tr></thead><tbody>
        {record.sources.map((source) => <tr key={source.code}>
          <td><input aria-label={`${source.display_name} ${zh ? "启用" : "enabled"}`} type="checkbox" checked={settings[source.code]?.enabled ?? false} onChange={(event) => setSettings({ ...settings, [source.code]: { ...settings[source.code], enabled: event.target.checked } })} /></td>
          <td><input aria-label={`${source.display_name} ${zh ? "顺序" : "priority"}`} className="priority-input" type="number" min="1" value={settings[source.code]?.priority ?? source.priority} onChange={(event) => setSettings({ ...settings, [source.code]: { ...settings[source.code], priority: Number(event.target.value) } })} /></td>
          <td><a href={source.public_url} target="_blank" rel="noreferrer">{source.display_name}</a><small>{source.code}</small></td>
          <td>{source.authority_name}</td>
        </tr>)}
      </tbody></table></div>
      <div className="activation-bar"><label><span>{zh ? "版本说明" : "Version note"}</span><input value={summary} onChange={(event) => setSummary(event.target.value)} required /></label><button className="primary-button" disabled={busy}>{busy ? (zh ? "正在生效" : "Activating") : (zh ? "生效" : "Activate")}</button></div>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  </section>;
}

function SourceFileRegistry({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN"; const [files, setFiles] = useState<SourceFileRecord[]>([]); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ sourceFiles: SourceFileRecord[] }>("/api/admin/source-files").then((result) => setFiles(result.sourceFiles)).catch((reason) => setError((reason as Error).message)); }, []);
  return <section className="management-page source-registry"><header className="page-heading"><div><span className="section-label">{zh ? "Puyan 迁移能力" : "Migrated from Puyan"}</span><h2>{zh ? "数据导入台账" : "Data load registry"}</h2><p>{zh ? "记录文件来源、业务日期、操作人、内容指纹与保留期限，便于追查每个结果来自哪里。" : "Tracks source, business date, operator, content fingerprint and retention for every imported file."}</p></div><strong>{files.length} {zh ? "批" : "loads"}</strong></header>{error ? <p className="form-error">{error}</p> : files.length ? <div className="table-wrap"><table><thead><tr><th>{zh ? "类型 / 文件" : "Type / file"}</th><th>{zh ? "业务日期" : "Business date"}</th><th>{zh ? "导入人" : "Imported by"}</th><th>{zh ? "大小" : "Size"}</th><th>SHA-256</th><th>{zh ? "保留至" : "Retain until"}</th><th>{zh ? "导入时间" : "Imported at"}</th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td><strong>{file.source_type}</strong><small>{file.original_filename}</small></td><td>{file.business_date?.slice(0, 10) ?? "—"}</td><td>{file.imported_by_name}</td><td>{Math.ceil(Number(file.byte_size) / 1024)} KB</td><td><code>{file.sha256.slice(0, 12)}…</code></td><td>{file.retain_until.slice(0, 10)}</td><td>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.imported_at))}</td></tr>)}</tbody></table></div> : <p className="readonly-note">{zh ? "尚无文件导入记录。" : "No file imports yet."}</p>}</section>;
}

function ExternalDataConnectionsPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const [connection, setConnection] = useState<ExternalDataConnection | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => {
    const result = await api<{ connections: ExternalDataConnection[] }>("/api/admin/external-data-connections");
    const record = result.connections.find((item) => item.providerCode === "eodhd")!;
    setConnection(record); setEnabled(record.enabled);
  };
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy("save"); setMessage(null);
    try {
      const body = { enabled, ...(apiToken.trim() ? { apiToken: apiToken.trim() } : {}) };
      const result = await api<{ connection: ExternalDataConnection }>("/api/admin/external-data-connections/eodhd", { method: "PUT", body: JSON.stringify(body) });
      setConnection(result.connection); setEnabled(result.connection.enabled); setApiToken("");
      setMessage(zh ? "EODHD 连接设置已保存。请执行连接测试。" : "EODHD settings were saved. Run the connection test next.");
    } catch { setMessage(zh ? "保存失败。首次配置时必须填写有效的 API Token。" : "Save failed. A valid API Token is required for first-time setup."); }
    finally { setBusy(null); }
  }
  async function testConnection() {
    setBusy("test"); setMessage(null);
    try {
      const result = await api<{ connection: ExternalDataConnection }>("/api/admin/external-data-connections/eodhd/test", { method: "POST", body: "{}" });
      setConnection(result.connection);
      setMessage(zh ? "连接测试成功，EODHD 已返回真实复权价格。" : "Connection succeeded and EODHD returned live adjusted prices.");
    } catch (reason) {
      const refreshed = await api<{ connections: ExternalDataConnection[] }>("/api/admin/external-data-connections");
      const record = refreshed.connections.find((item) => item.providerCode === "eodhd")!;
      setConnection(record); setEnabled(record.enabled);
      const detail = record.lastTestMessage ?? (reason as Error).message;
      setMessage(zh ? `连接测试失败：${detail}` : `Connection test failed: ${detail}`);
    } finally { setBusy(null); }
  }
  async function clearCredential() {
    setBusy("clear"); setMessage(null);
    try {
      const result = await api<{ connection: ExternalDataConnection }>("/api/admin/external-data-connections/eodhd/credential", { method: "DELETE" });
      setConnection(result.connection); setEnabled(false); setApiToken(""); setConfirmClear(false);
      setMessage(zh ? "已删除 API Token，EODHD 已停用。" : "The API Token was removed and EODHD is disabled.");
    } catch { setMessage(zh ? "API Token 未能删除。" : "The API Token could not be removed."); }
    finally { setBusy(null); }
  }
  if (!connection) return <section className="placeholder"><p>{zh ? "正在读取外部数据连接" : "Loading external data connections"}</p></section>;
  const statusLabel = !connection.configured ? (zh ? "未配置" : "Not configured")
    : connection.lastTestStatus === "succeeded" ? (zh ? "连接正常" : "Connected")
      : connection.lastTestStatus === "failed" ? (zh ? "测试失败" : "Test failed") : (zh ? "等待测试" : "Test required");
  return <section className="management-page connection-page">
    <header className="page-heading"><div><span className="section-label">EODHD</span><h2>{zh ? "外部数据连接" : "External data connection"}</h2><p>{zh ? "用于个股、ETF 和指数的历史复权价格。宏观官方数据仍由公开数据引擎独立获取。" : "Used for adjusted price history of securities, ETFs and indices. Official macro data remain on the public-data engine."}</p></div><span className={`connection-status ${connection.lastTestStatus ?? "pending"}`}>{statusLabel}</span></header>
    <form className="connection-form" onSubmit={save}>
      <div className="connection-summary"><div><span>{zh ? "服务商" : "Provider"}</span><strong>EODHD</strong></div><div><span>{zh ? "凭证" : "Credential"}</span><strong>{connection.maskedToken ?? "—"}</strong></div><div><span>{zh ? "用途" : "Use"}</span><strong>{zh ? "历史价格首选源" : "Primary price-history source"}</strong></div></div>
      <label className="connection-token"><span>{zh ? "API Token" : "API Token"}</span><input type="password" autoComplete="new-password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder={connection.configured ? (zh ? "留空表示保留现有 Token" : "Leave blank to keep the saved token") : (zh ? "收到后在此录入" : "Enter the token when received")} /><small>{zh ? "这里只录入 EODHD API Token，不录入网站登录密码。Token 加密保存在后台，前端只显示末四位。" : "Enter the EODHD API Token, not the website password. It is encrypted server-side; only the final four characters are shown."}</small></label>
      <label className="connection-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>{zh ? "启用 EODHD 作为证券历史价格首选源" : "Use EODHD as the primary security price-history source"}</span></label>
      <div className="connection-actions"><button className="primary-button compact" disabled={Boolean(busy) || (!connection.configured && !apiToken.trim())}>{busy === "save" ? (zh ? "正在保存" : "Saving") : (zh ? "保存设置" : "Save settings")}</button><button type="button" className="secondary-button" onClick={testConnection} disabled={Boolean(busy) || !connection.configured}>{busy === "test" ? (zh ? "正在测试" : "Testing") : (zh ? "测试连接" : "Test connection")}</button>{connection.configured && !confirmClear && <button type="button" className="text-danger-button" onClick={() => setConfirmClear(true)} disabled={Boolean(busy)}>{zh ? "删除 Token" : "Delete token"}</button>}{connection.configured && confirmClear && <><button type="button" className="text-danger-button confirm" onClick={clearCredential} disabled={Boolean(busy)}>{busy === "clear" ? (zh ? "正在删除" : "Deleting") : (zh ? "确认删除" : "Confirm delete")}</button><button type="button" className="text-danger-button" onClick={() => setConfirmClear(false)} disabled={Boolean(busy)}>{zh ? "取消" : "Cancel"}</button></>}</div>
      {connection.lastTestedAt && <div className="connection-result"><strong>{connection.lastTestStatus === "succeeded" ? (zh ? "最近测试成功" : "Last test succeeded") : (zh ? "最近测试失败" : "Last test failed")}</strong><span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.lastTestedAt))}</span><p>{connection.lastTestMessage}</p></div>}
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  </section>;
}

function AuditPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ auditEvents: AuditEvent[] }>("/api/admin/audit-events").then((result) => setEvents(result.auditEvents)).catch((reason) => setError((reason as Error).message)).finally(() => setLoading(false)); }, []);
  const actionLabels: Record<string, [string, string]> = {
    "auth.login": ["用户登录", "User signed in"], "auth.logout": ["用户退出", "User signed out"], "auth.change_password": ["修改密码", "Password changed"],
    "admin.user.create": ["创建用户", "User created"], "admin.user.reset_password": ["重置用户密码", "User password reset"],
    "positions.import": ["导入持仓", "Position import"], "rebalance.monthly_check": ["月度再平衡检查", "Monthly rebalance check"],
    "rebalance.plan.accept": ["接受再平衡方案", "Rebalance plan accepted"], "annual_data.run": ["运行公开数据引擎", "Public-data engine run"],
    "data_sources.activate": ["生效数据源设置", "Data-source settings activated"], "parameters.activate": ["生效业务参数", "Business parameters activated"],
    "external_data.connection.save": ["保存外部数据连接", "External data connection saved"], "external_data.connection.test": ["测试外部数据连接", "External data connection tested"],
    "external_data.connection.clear": ["删除外部数据凭证", "External data credential removed"],
    "portfolio.principal.activate": ["生效组合本金", "Portfolio principal activated"], "workflow.annual.create": ["启动年度流程", "Annual workflow started"],
    "target_return.prepare": ["准备目标收益率", "Target return prepared"], "sleeve_targets.generate": ["生成 Sleeve 目标", "Sleeve targets generated"],
    "proposed_portfolio.submit": ["提交拟投资组合", "Proposed portfolio submitted"], "backtest.run": ["运行组合回测", "Portfolio backtest run"],
    "optimization.run": ["运行组合优化", "Portfolio optimization run"], "optimization.select": ["选择优化方案", "Optimization selected"],
    "approval.open": ["发起审批", "Approval opened"], "approval.vote": ["审批表决", "Approval vote"],
    "execution.submit": ["提交交易计划复核", "Execution plan submitted"], "execution.review": ["复核交易计划", "Execution plan reviewed"],
    "workflow.open_non_equity_nav": ["进入非股票净值环节", "Non-equity NAV stage opened"], "non_equity_nav.submit": ["提交非股票净值", "Non-equity NAV submitted"],
    "report.generate": ["生成报告", "Report generated"], "workflow.publish_report": ["发布报告", "Report published"],
  };
  const entityLabels: Record<string, [string, string]> = {
    position_snapshot: ["持仓快照", "Position snapshot"], rebalance_check: ["再平衡检查", "Rebalance check"], rebalance_plan: ["再平衡方案", "Rebalance plan"],
    workflow_case: ["年度流程", "Annual workflow"], report_version: ["报告版本", "Report version"], user: ["用户", "User"], session: ["登录会话", "Sign-in session"],
    parameter_set: ["参数版本", "Parameter version"], portfolio: ["投资组合", "Portfolio"], annual_data_package: ["年度数据包", "Annual data package"],
    data_source_setting_version: ["数据源设置版本", "Data-source settings"], target_return_version: ["目标收益率版本", "Target-return version"],
    sleeve_target_version: ["Sleeve 目标版本", "Sleeve-target version"], proposed_portfolio_version: ["拟投资组合版本", "Proposed-portfolio version"],
    backtest_run: ["回测结果", "Backtest run"], optimization_run: ["优化结果", "Optimization run"], approval_round: ["审批事项", "Approval item"],
    maker_checker_action: ["双人复核事项", "Maker-checker item"], non_equity_nav_version: ["非股票净值版本", "Non-equity NAV version"],
    external_data_connection: ["外部数据连接", "External data connection"],
  };
  if (loading) return <section className="placeholder"><p>{zh ? "正在读取审计记录" : "Loading audit records"}</p></section>;
  return <section className="audit-page management-page"><header className="page-heading"><div><span className="section-label">{zh ? "不可篡改记录" : "Immutable records"}</span><h2>{zh ? "系统审计" : "System audit"}</h2><p>{zh ? "按时间倒序显示最近 200 条操作记录。" : "The latest 200 events are shown in reverse chronological order."}</p></div><strong>{events.length} {zh ? "条" : "events"}</strong></header>{error ? <p className="form-error">{error}</p> : <div className="table-wrap"><table><thead><tr><th>{zh ? "业务动作" : "Action"}</th><th>{zh ? "操作人" : "Actor"}</th><th>{zh ? "业务对象" : "Object"}</th><th>{zh ? "结果" : "Outcome"}</th><th>{zh ? "时间" : "Time"}</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><strong>{actionLabels[event.action]?.[zh ? 0 : 1] ?? event.action}</strong><details className="audit-detail"><summary>{zh ? "查看记录详情" : "View details"}</summary><pre>{JSON.stringify(event.detail, null, 2)}</pre></details></td><td>{event.actor_name ?? (zh ? "系统" : "System")}<small>{event.actor_username}</small></td><td>{entityLabels[event.entity_type]?.[zh ? 0 : 1] ?? event.entity_type}<small>{event.entity_id?.slice(0, 8) ?? "—"}</small></td><td><span className={`audit-outcome ${event.outcome}`}>{event.outcome === "allowed" ? (zh ? "成功" : "Success") : event.outcome === "denied" ? (zh ? "拒绝" : "Denied") : (zh ? "失败" : "Failed")}</span></td><td>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}</td></tr>)}</tbody></table></div>}</section>;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-()（）]/g, "");
}

function parsePositionCsv(content: string, approvedHoldings: MonitoringContext["approvedHoldings"]) {
  const rows = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one holding");
  const headers = rows[0].map(normalizedHeader);
  const aliases: Record<string, string[]> = {
    ticker: ["ticker", "code", "stockcode", "symbol", "股票代码", "代码"],
    exchange: ["exchange", "exchangecode", "market", "市场", "交易所"],
    quantity: ["quantity", "qty", "position", "持仓数量", "数量"],
    price: ["marketprice", "price", "currentprice", "现价", "当前价", "市价"],
    value: ["marketvalue", "value", "市值", "持仓市值"],
    currency: ["currency", "币种", "货币"],
  };
  const column = (key: string) => {
    const index = headers.findIndex((header) => aliases[key].includes(header));
    if (index < 0) throw new Error(`Missing CSV column: ${key}`);
    return index;
  };
  const tickerIndex = column("ticker"); const quantityIndex = column("quantity");
  const priceIndex = column("price"); const valueIndex = column("value"); const currencyIndex = column("currency");
  const exchangeIndex = headers.findIndex((header) => aliases.exchange.includes(header));
  const byTicker = new Map(approvedHoldings.map((holding) => [holding.ticker.toUpperCase(), holding]));
  const number = (raw: string) => Number(raw.replace(/[$¥￥,]/g, ""));
  return rows.slice(1).map((row) => {
    const rawTicker = row[tickerIndex].toUpperCase();
    const ticker = rawTicker.includes(".") ? rawTicker.split(".").at(-1)! : rawTicker;
    const approved = byTicker.get(ticker);
    if (!approved) throw new Error(`Ticker is not in the approved portfolio: ${ticker}`);
    return {
      ticker,
      exchangeCode: exchangeIndex >= 0 && row[exchangeIndex] ? row[exchangeIndex].toUpperCase() : approved.exchangeCode,
      quantity: number(row[quantityIndex]), marketPrice: number(row[priceIndex]), marketValue: number(row[valueIndex]),
      currency: row[currencyIndex].toUpperCase(),
    };
  });
}

function EquityCurve({ points, locale }: { points: MonitoringContext["curve"]; locale: Locale }) {
  if (points.length === 0) return <div className="curve-empty">{locale === "zh-CN" ? "导入第一份持仓后生成曲线" : "The curve begins after the first position import"}</div>;
  const values = points.map((point) => Number(point.market_value));
  const minimum = Math.min(...values); const maximum = Math.max(...values); const range = maximum - minimum || 1;
  const coordinates = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${88 - ((value - minimum) / range) * 72}`).join(" ");
  const dateOnly = (value: string) => value.includes("T") ? value.slice(0, 10) : value;
  return <div className="equity-curve"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={locale === "zh-CN" ? "股票市值曲线" : "Equity value curve"}><polyline points={coordinates} /></svg><div><span>{dateOnly(points[0].business_date)}</span><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: points.at(-1)?.currency ?? "USD", maximumFractionDigits: 0 }).format(values.at(-1) ?? 0)}</strong><span>{dateOnly(points.at(-1)?.business_date ?? "")}</span></div></div>;
}

function parseExecutionFillCsv(content: string) {
  const rows = content.trim().split(/\r?\n/).filter(Boolean).map((row) => row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  if (rows.length < 2) throw new Error("Execution CSV is empty");
  const headers = rows[0].map((item) => item.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const at = (row: string[], names: string[]) => row[headers.findIndex((header) => names.includes(header))] ?? "";
  return rows.slice(1).map((row) => ({
    ticker: at(row, ["ticker", "symbol"]), exchangeCode: at(row, ["exchange", "exchangecode", "market"]),
    side: at(row, ["side", "action"]).toUpperCase(), quantity: Number(at(row, ["quantity", "qty"])),
    price: Number(at(row, ["price", "fillprice", "averageprice"])), externalTradeId: at(row, ["externaltradeid", "tradeid", "orderid"]) || undefined,
  })).map((fill) => {
    if (!fill.ticker || !fill.exchangeCode || !["BUY", "SELL"].includes(fill.side) || !Number.isFinite(fill.quantity) || !Number.isFinite(fill.price)) throw new Error("Execution CSV columns are invalid");
    return { ...fill, side: fill.side as "BUY" | "SELL" };
  });
}

function serializeExecutionFills(fills: ExecutionFillDraft[]) {
  const cell = (value: string | number | undefined) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return ["Ticker,Exchange,Side,Quantity,Price,ExternalTradeId", ...fills.map((fill) => [
    fill.ticker, fill.exchangeCode, fill.side, fill.quantity, fill.price, fill.externalTradeId,
  ].map(cell).join(","))].join("\n");
}

function ExecutionEvidencePanel({ locale, user, workflow, readOnly }: { locale: Locale; user: User; workflow: AnnualWorkflow; readOnly: boolean }) {
  const zh = locale === "zh-CN";
  const [context, setContext] = useState<ExecutionEvidenceContext | null>(null);
  const [file, setFile] = useState<File | null>(null); const [pasted, setPasted] = useState("");
  const [fillDrafts, setFillDrafts] = useState<ExecutionFillDraft[]>([]);
  const [missingPlanned, setMissingPlanned] = useState<ExecutionFillPreview["missingPlannedLines"]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [tolerance, setTolerance] = useState(2);
  const [flowDate, setFlowDate] = useState(new Date().toISOString().slice(0, 10)); const [flowAmount, setFlowAmount] = useState(0);
  const [flowType, setFlowType] = useState<"contribution" | "withdrawal">("contribution"); const [flowReference, setFlowReference] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const load = () => api<ExecutionEvidenceContext>(`/api/workflows/${workflow.id}/execution-evidence/context`).then(setContext);
  useEffect(() => { void load(); }, [workflow.id]);
  async function requestPreview(drafts: ExecutionFillDraft[]) {
    const selectedIndexes = drafts.map((draft, index) => draft.selected ? index : -1).filter((index) => index >= 0);
    if (selectedIndexes.length === 0) throw new Error(zh ? "请至少勾选一笔成交。" : "Select at least one fill.");
    const selected = selectedIndexes.map((index) => drafts[index]);
    if (selected.some((fill) => !fill.ticker.trim() || !fill.exchangeCode.trim() || !Number.isFinite(fill.quantity) || !Number.isFinite(fill.price))) {
      throw new Error(zh ? "请完善已勾选成交的股票、交易所、数量和价格。" : "Complete ticker, exchange, quantity and price for every selected fill.");
    }
    const content = serializeExecutionFills(selected);
    const result = await api<{ preview: ExecutionFillPreview }>(`/api/workflows/${workflow.id}/execution-fills/preview`, {
      method: "POST",
      body: JSON.stringify({ businessDate: date, filename: file?.name ?? `execution-fills-${date}.csv`, content, fills: selected.map(({ selected: _selected, tradeValue: _tradeValue, plannedValue: _plannedValue, varianceValue: _varianceValue, status: _status, ...fill }) => fill), valueTolerancePct: tolerance }),
    });
    const next: ExecutionFillDraft[] = drafts.map((draft) => draft.selected ? { ...draft, status: "needs_review" } : { ...draft, status: "excluded" });
    result.preview.importedLines.forEach((line, offset) => {
      const index = selectedIndexes[offset];
      next[index] = { ...next[index], ...line, selected: true };
    });
    setFillDrafts(next);
    setMissingPlanned(result.preview.missingPlannedLines);
    setPreviewReady(true);
  }
  async function prepareFillPreview() {
    if (!file && !pasted.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const content = file ? await file.text() : pasted.trim();
      const fills = parseExecutionFillCsv(content);
      const drafts = fills.map((fill) => ({ ...fill, selected: true, tradeValue: 0, plannedValue: 0, varianceValue: 0, status: "needs_review" as const }));
      setFillDrafts(drafts);
      await requestPreview(drafts);
      setMessage(zh ? "预览已生成。请核对、修正并勾选需要导入的成交。" : "Preview ready. Review, correct and select the fills to import.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function refreshFillPreview() {
    setBusy(true); setMessage(null);
    try {
      await requestPreview(fillDrafts);
      setMessage(zh ? "预览已重新核对，未选择或缺失的计划交易仍会列为异常。" : "Preview refreshed; excluded or missing planned trades remain exceptions.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  function updateFillDraft(index: number, changes: Partial<ExecutionFillDraft>) {
    setFillDrafts((current) => current.map((draft, rowIndex) => rowIndex === index ? { ...draft, ...changes, status: changes.selected === false ? "excluded" : "needs_review" } : draft));
    setPreviewReady(false);
  }
  function chooseTicker(index: number, ticker: string) {
    if (!context) return;
    const normalized = ticker.trim().toUpperCase();
    const approved = context.approvedOrders.find((item) => item.ticker.toUpperCase() === normalized);
    const options = context.securityOptions.filter((item) => item.ticker.toUpperCase() === normalized);
    const match = approved ?? (options.length === 1 ? { ticker: options[0].ticker, exchangeCode: options[0].exchange_code } : null);
    updateFillDraft(index, { ticker: normalized, ...(match ? { exchangeCode: match.exchangeCode } : {}) });
  }
  function addFillDraft() {
    setFillDrafts((current) => [...current, { selected: true, ticker: "", exchangeCode: "", side: "BUY", quantity: 0, price: 0, externalTradeId: "", tradeValue: 0, plannedValue: 0, varianceValue: 0, status: "needs_review" }]);
    setPreviewReady(false);
  }
  async function uploadFills() {
    const selected = fillDrafts.filter((fill) => fill.selected);
    if (!previewReady || selected.length === 0) return;
    setBusy(true); setMessage(null);
    try {
      const content = serializeExecutionFills(selected);
      const fills = selected.map(({ selected: _selected, tradeValue: _tradeValue, plannedValue: _plannedValue, varianceValue: _varianceValue, status: _status, ...fill }) => fill);
      await api(`/api/workflows/${workflow.id}/execution-fills`, { method: "POST", body: JSON.stringify({ businessDate: date, filename: file?.name ?? `execution-fills-${date}.csv`, content, fills, valueTolerancePct: tolerance }) });
      await load(); setFile(null); setPasted(""); setFillDrafts([]); setMissingPlanned([]); setPreviewReady(false); setMessage(zh ? "所选成交已保存，并与双人复核后的交易计划完成核对。" : "Selected fills were saved and reconciled to the maker-checker plan.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function reviewFills(decision: "approve" | "reject") {
    if (!context?.latestFillBatch) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/execution-fill-batches/${context.latestFillBatch.id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
      await load();
      setMessage(decision === "approve" ? (zh ? "成交回单复核已同意。" : "The execution fills were approved.") : (zh ? "成交回单复核已不同意。" : "The execution fills were rejected."));
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function deleteFills() {
    if (!context?.latestFillBatch) return;
    const confirmed = window.confirm(zh ? "确认删除本次成交回单导入？原始文件台账和审计记录仍会保留。" : "Delete this fill import? The source-file registry and audit record will be retained.");
    if (!confirmed) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/execution-fill-batches/${context.latestFillBatch.id}`, { method: "DELETE" });
      await load();
      setMessage(zh ? "本次成交回单导入已删除。" : "The fill import was deleted.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function addCashFlow() {
    if (!(flowAmount > 0)) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/workflows/${workflow.id}/cash-flows`, { method: "POST", body: JSON.stringify({ flowDate, amount: flowAmount, currency: "USD", flowType, reference: flowReference || undefined }) });
      await load(); setFlowAmount(0); setFlowReference(""); setMessage(zh ? "外部现金流已登记，报告收益率将采用资金加权时间处理。" : "Cash flow recorded; reporting will apply cash-flow timing.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  if (!context) return <section className="placeholder"><p>{zh ? "正在读取执行凭证" : "Loading execution evidence"}</p></section>;
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  const securityName = (ticker: string, exchangeCode: string) => {
    const option = context.securityOptions.find((item) => item.ticker.toUpperCase() === ticker.toUpperCase() && item.exchange_code.toUpperCase() === exchangeCode.toUpperCase());
    return option ? (zh ? option.name_zh : option.name_en) : "";
  };
  const selectedFillCount = fillDrafts.filter((fill) => fill.selected).length;
  return <section className="execution-evidence annual-data-panel">
    <header><div><span className="section-label">{zh ? "Puyan 迁移能力 · 实施后" : "Migrated from Puyan · Post implementation"}</span><h3>{zh ? "成交回单与计划核对" : "Execution fills and plan reconciliation"}</h3><p>{zh ? "这里只登记实际成交，不改变已批准组合，也不绕过双人复核。" : "Actual fills are evidence only; they do not alter approval or bypass maker-checker."}</p></div><ReceiptText size={26} /></header>
    {!readOnly && user.role === "execution_team" && <div className="evidence-entry-grid"><label><span>{zh ? "成交日期" : "Trade date"}</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreviewReady(false); }} /></label><label><span>{zh ? "允许金额偏差 (%)" : "Value tolerance (%)"}</span><input type="number" min="0" max="25" step="0.1" value={tolerance} onChange={(event) => { setTolerance(Number(event.target.value)); setPreviewReady(false); }} /></label><label className="file-picker"><input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPasted(""); setFillDrafts([]); setMissingPlanned([]); setPreviewReady(false); }} /><span>{file?.name ?? (zh ? "选择成交 CSV" : "Choose fills CSV")}</span></label><a className="secondary-button compact" href="/templates/execution-fills-template.csv" download>{zh ? "下载成交模板" : "Download fills template"}</a><label className="csv-paste wide"><span>{zh ? "或粘贴：Ticker, Exchange, Side, Quantity, Price, ExternalTradeId" : "Or paste: Ticker, Exchange, Side, Quantity, Price, ExternalTradeId"}</span><textarea rows={3} value={pasted} onChange={(event) => { setPasted(event.target.value); setFile(null); setFillDrafts([]); setMissingPlanned([]); setPreviewReady(false); }} /></label><button className="primary-button compact" disabled={busy || (!file && !pasted.trim())} onClick={prepareFillPreview}>{zh ? "生成导入预览" : "Preview import"}</button></div>}
    {fillDrafts.length > 0 && <section className="fill-import-preview"><header><div><span className="section-label">{zh ? "导入前检查" : "Pre-import review"}</span><h4>{zh ? `已选择 ${selectedFillCount}/${fillDrafts.length} 笔成交` : `${selectedFillCount}/${fillDrafts.length} fills selected`}</h4><p>{zh ? "输入股票代码会提示系统证券；选择后自动补充交易所。修改或取消勾选后需要重新核对。" : "Ticker input suggests system securities and fills the exchange. Recheck after editing or changing selections."}</p></div><div className="preview-actions"><button className="secondary-button compact" onClick={addFillDraft} disabled={busy}>{zh ? "新增一行" : "Add row"}</button><button className="secondary-button compact" onClick={refreshFillPreview} disabled={busy || selectedFillCount === 0}>{zh ? "重新核对" : "Recheck"}</button></div></header><datalist id="execution-security-options">{context.securityOptions.map((item) => <option key={`${item.ticker}-${item.exchange_code}`} value={item.ticker} label={`${item.exchange_code} · ${zh ? item.name_zh : item.name_en}`} />)}</datalist><datalist id="execution-exchange-options">{Array.from(new Set(context.securityOptions.map((item) => item.exchange_code))).map((exchange) => <option key={exchange} value={exchange} />)}</datalist><div className="table-wrap"><table className="fill-preview-table"><thead><tr><th>{zh ? "导入" : "Use"}</th><th>{zh ? "股票" : "Security"}</th><th>{zh ? "交易所" : "Exchange"}</th><th>{zh ? "方向" : "Side"}</th><th>{zh ? "数量" : "Quantity"}</th><th>{zh ? "价格" : "Price"}</th><th>{zh ? "计划/实际" : "Planned / actual"}</th><th>{zh ? "预览结果" : "Preview result"}</th></tr></thead><tbody>{fillDrafts.map((fill, index) => <tr key={`${index}-${fill.externalTradeId ?? "fill"}`} className={!fill.selected ? "excluded" : fill.status}><td><input type="checkbox" checked={fill.selected} aria-label={zh ? `选择第 ${index + 1} 笔成交` : `Select fill ${index + 1}`} onChange={(event) => updateFillDraft(index, { selected: event.target.checked })} /></td><td><input list="execution-security-options" value={fill.ticker} placeholder={zh ? "输入代码" : "Ticker"} onChange={(event) => chooseTicker(index, event.target.value)} /><small>{securityName(fill.ticker, fill.exchangeCode) || (zh ? "请选择对应证券" : "Select a security")}</small></td><td><input list="execution-exchange-options" value={fill.exchangeCode} onChange={(event) => updateFillDraft(index, { exchangeCode: event.target.value.toUpperCase() })} /></td><td><select value={fill.side} onChange={(event) => updateFillDraft(index, { side: event.target.value as "BUY" | "SELL" })}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></td><td><input type="number" min="0" value={fill.quantity} onChange={(event) => updateFillDraft(index, { quantity: Number(event.target.value) })} /></td><td><input type="number" min="0" step="any" value={fill.price} onChange={(event) => updateFillDraft(index, { price: Number(event.target.value) })} /></td><td><small>{money(fill.plannedValue)}</small><strong>{money(fill.tradeValue)}</strong></td><td><strong className={fill.status === "matched" ? "result-pass" : fill.status === "excluded" ? "pending-note" : "result-fail"}>{fill.status === "needs_review" ? (zh ? "需重新核对" : "RECHECK") : fill.status === "excluded" ? (zh ? "不导入" : "EXCLUDED") : fill.status}</strong></td></tr>)}</tbody></table></div>{missingPlanned.length > 0 && <div className="missing-planned-warning"><strong>{zh ? `${missingPlanned.length} 笔计划交易在所选成交中缺失` : `${missingPlanned.length} planned trades are missing from the selection`}</strong><span>{missingPlanned.map((line) => `${line.ticker} · ${line.exchangeCode}`).join("、")}</span><small>{zh ? "这些项目会继续作为异常显示，取消勾选不能隐藏缺失计划。" : "These remain exceptions; unchecking a row cannot hide a missing planned trade."}</small></div>}<div className="preview-confirm"><span>{previewReady ? (zh ? "预览已按当前选择重新计算，可以确认导入。" : "Preview reflects the current selection and is ready.") : (zh ? "内容已变化，请先点击“重新核对”。" : "Content changed; click Recheck first.")}</span><button className="primary-button compact" disabled={busy || !previewReady || selectedFillCount === 0} onClick={uploadFills}>{zh ? "确认导入所选成交" : "Import selected fills"}</button></div></section>}
    {context.latestFillBatch ? <><div className={`evidence-summary ${context.latestFillBatch.status}`}><strong>{context.latestFillBatch.status === "matched" ? (zh ? "全部匹配" : "ALL MATCHED") : (zh ? "存在差异" : "EXCEPTIONS")}</strong><span>{context.latestFillBatch.original_filename} · {context.latestFillBatch.business_date.slice(0, 10)}</span><small>{zh ? `${context.latestFillBatch.summary.matched} 笔匹配，${context.latestFillBatch.summary.exceptions} 笔需复核` : `${context.latestFillBatch.summary.matched} matched, ${context.latestFillBatch.summary.exceptions} to review`}</small><small>{context.latestFillBatch.review_status === "pending_review" ? (zh ? "复核状态：待复核" : "Review: pending") : context.latestFillBatch.review_status === "approved" ? (zh ? `复核状态：已同意${context.latestFillBatch.reviewed_by_name ? `（${context.latestFillBatch.reviewed_by_name}）` : ""}` : `Review: approved${context.latestFillBatch.reviewed_by_name ? ` by ${context.latestFillBatch.reviewed_by_name}` : ""}`) : (zh ? `复核状态：不同意${context.latestFillBatch.reviewed_by_name ? `（${context.latestFillBatch.reviewed_by_name}）` : ""}` : `Review: rejected${context.latestFillBatch.reviewed_by_name ? ` by ${context.latestFillBatch.reviewed_by_name}` : ""}`)}</small></div>{!readOnly && user.role === "execution_team" && <div className="approval-actions">{context.latestFillBatch.review_status === "pending_review" && context.latestFillBatch.imported_by !== user.id && <><button className="secondary-button" disabled={busy} onClick={() => reviewFills("reject")}>{zh ? "复核不同意" : "Reject review"}</button><button className="primary-button compact" disabled={busy} onClick={() => reviewFills("approve")}>{zh ? "复核同意" : "Approve review"}</button></>}{context.latestFillBatch.imported_by === user.id && context.latestFillBatch.review_status !== "approved" && <button className="secondary-button" disabled={busy} onClick={deleteFills}>{zh ? "删除本次导入" : "Delete this import"}</button>}{context.latestFillBatch.review_status === "pending_review" && context.latestFillBatch.imported_by === user.id && <span className="readonly-note">{zh ? "请由另一名执行团队用户完成复核。" : "A different execution-team user must review this import."}</span>}</div>}<div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "方向" : "Side"}</th><th>{zh ? "计划金额" : "Planned"}</th><th>{zh ? "实际金额" : "Actual"}</th><th>{zh ? "差异" : "Variance"}</th><th>{zh ? "结果" : "Result"}</th></tr></thead><tbody>{context.latestFillBatch.lines.map((line) => <tr key={`${line.ticker}-${line.exchangeCode}-${line.side}`}><td><strong>{line.ticker}</strong><small>{line.exchangeCode}</small></td><td>{line.side}</td><td>{money(Number(line.plannedValue))}</td><td>{money(Number(line.tradeValue))}</td><td>{money(Number(line.varianceValue))}</td><td><strong className={line.status === "matched" ? "result-pass" : "result-fail"}>{line.status}</strong></td></tr>)}</tbody></table></div></> : <p className="readonly-note">{zh ? "尚未导入券商成交回单。持仓仍可按原 Iaster 流程每日导入。" : "No broker fills imported yet. Daily positions remain available below."}</p>}
    <div className="cash-flow-ledger"><header><div><span className="section-label">{zh ? "报告调整" : "Reporting adjustment"}</span><h4>{zh ? "外部现金流" : "External cash flows"}</h4></div></header>{!readOnly && user.role === "execution_team" && <div className="cash-flow-form"><input type="date" value={flowDate} onChange={(event) => setFlowDate(event.target.value)} /><select value={flowType} onChange={(event) => setFlowType(event.target.value as typeof flowType)}><option value="contribution">{zh ? "入金" : "Contribution"}</option><option value="withdrawal">{zh ? "出金" : "Withdrawal"}</option></select><input type="number" min="0" placeholder={zh ? "金额" : "Amount"} value={flowAmount || ""} onChange={(event) => setFlowAmount(Number(event.target.value))} /><input placeholder={zh ? "银行/券商参考号（可选）" : "Reference (optional)"} value={flowReference} onChange={(event) => setFlowReference(event.target.value)} /><button className="secondary-button" onClick={addCashFlow} disabled={busy || !(flowAmount > 0)}>{zh ? "登记" : "Record"}</button></div>}<div className="cash-flow-list">{context.cashFlows.length ? context.cashFlows.map((flow) => <span key={flow.id}><b>{flow.flow_date.slice(0, 10)}</b>{flow.flow_type === "contribution" ? (zh ? "入金" : "Contribution") : (zh ? "出金" : "Withdrawal")}<strong className={Number(flow.amount) >= 0 ? "result-pass" : "result-fail"}>{money(Number(flow.amount))}</strong><small>{flow.reference}</small></span>) : <p>{zh ? "本期没有外部现金流。" : "No external cash flows recorded."}</p>}</div></div>
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

function MonitoringPanel({ locale, user, workflow, onWorkflowChanged, readOnly = false }: { locale: Locale; user: User; workflow: AnnualWorkflow; onWorkflowChanged: () => Promise<void> | void; readOnly?: boolean }) {
  const zh = locale === "zh-CN";
  const [context, setContext] = useState<MonitoringContext | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pastedCsv, setPastedCsv] = useState("");
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const load = () => api<MonitoringContext>(`/api/workflows/${workflow.id}/monitoring/context`).then(setContext);
  useEffect(() => { void load(); }, [workflow.id]);
  async function upload() {
    if ((!file && !pastedCsv.trim()) || !context) return;
    setBusy(true); setMessage(null);
    try {
      const content = file ? await file.text() : pastedCsv.trim();
      const holdings = parsePositionCsv(content, context.approvedHoldings);
      const filename = file?.name ?? `futu-positions-${businessDate}.csv`;
      await api(`/api/workflows/${workflow.id}/position-imports`, { method: "POST", body: JSON.stringify({ businessDate, filename, content, holdings }) });
      await load(); setFile(null); setPastedCsv(""); setMessage(zh ? "持仓已核验并生效。" : "Positions were validated and activated.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setMessage(null);
    try { await api(`/api/workflows/${workflow.id}/rebalance-checks`, { method: "POST", body: "{}" }); await load(); setMessage(zh ? "月度 corridor 检查已完成。" : "The monthly corridor check is complete."); }
    catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function accept(planId: string) {
    setBusy(true); setMessage(null);
    try { await api(`/api/rebalance-plans/${planId}/accept`, { method: "POST", body: "{}" }); await load(); setMessage(zh ? "再平衡方案已接受，进入三交易日完成期限。" : "The plan is accepted and the three-trading-day completion window has begun."); }
    catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function openNonEquityNav() {
    setBusy(true); setMessage(null);
    try {
      await api(`/api/workflows/${workflow.id}/actions`, { method: "POST", body: JSON.stringify({ action: "open_non_equity_nav", payload: {} }) });
      await onWorkflowChanged();
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  if (!context) return <section className="placeholder"><p>{zh ? "正在读取监控数据" : "Loading monitoring data"}</p></section>;
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: context.latestSnapshot?.lines[0]?.marketValue ? "USD" : "USD", maximumFractionDigits: 0 }).format(value);
  const dateOnly = (value: string) => value.includes("T") ? value.slice(0, 10) : value;
  const latestValue = context.curve.at(-1);
  return <section className="monitoring-page">
    <ExecutionEvidencePanel locale={locale} user={user} workflow={workflow} readOnly={readOnly} />
    <div className="monitoring-summary"><div><span>{zh ? "股票市值" : "Equity value"}</span><strong>{latestValue ? money(Number(latestValue.market_value)) : "—"}</strong><small>{context.latestSnapshot ? `${dateOnly(context.latestSnapshot.business_date)} · ${context.latestSnapshot.original_filename}` : (zh ? "尚未导入" : "Not imported")}</small></div><div className="curve-panel"><EquityCurve points={context.curve} locale={locale} /></div></div>
    <div className="monitoring-grid">
      <section className="operational-panel"><header><FileUp size={20} /><div><span className="section-label">{zh ? "每日" : "Daily"}</span><h3>{zh ? "导入富途持仓" : "Import Futu positions"}</h3></div></header>
        {!readOnly && user.role === "execution_team" ? <div className="upload-controls"><label><span>{zh ? "业务日期（YYYY-MM-DD）" : "Business date (YYYY-MM-DD)"}</span><input type="text" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" aria-label={zh ? "业务日期" : "Business date"} value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label><label className="file-picker"><input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPastedCsv(""); }} /><span>{file?.name ?? (zh ? "选择 CSV 文件" : "Choose CSV file")}</span></label><a className="secondary-button compact" href="/templates/position-holdings-template.csv" download>{zh ? "下载持仓模板" : "Download holdings template"}</a><label className="csv-paste"><span>{zh ? "或粘贴富途 CSV" : "Or paste Futu CSV"}</span><textarea aria-label={zh ? "粘贴富途 CSV" : "Paste Futu CSV"} rows={4} value={pastedCsv} onChange={(event) => { setPastedCsv(event.target.value); setFile(null); }} placeholder={zh ? "包含 Ticker、Exchange、Quantity、MarketPrice、MarketValue、Currency" : "Include Ticker, Exchange, Quantity, MarketPrice, MarketValue and Currency"} /></label><button className="primary-button compact" disabled={(!file && !pastedCsv.trim()) || busy} onClick={upload}>{zh ? "上传并生效" : "Upload and activate"}</button></div> : <p className="readonly-note">{zh ? "只读：每日持仓由执行小组导入。" : "Read only: the execution team imports daily positions."}</p>}
      </section>
      <section className="operational-panel"><header><CalendarCheck size={20} /><div><span className="section-label">{zh ? "每月" : "Monthly"}</span><h3>{zh ? "风格层 Corridor" : "Style-level corridor"}</h3></div></header>
        {context.latestCheck ? <><div className="check-result"><strong className={context.latestCheck.triggered ? "result-fail" : "result-pass"}>{context.latestCheck.triggered ? (zh ? "需要再平衡" : "REBALANCE REQUIRED") : (zh ? "范围内" : "WITHIN RANGE")}</strong><span>{dateOnly(context.latestCheck.check_date)}</span></div><div className="corridor-list">{context.latestCheck.results.map((result) => <div key={result.key} className={`corridor-row ${result.status}`}><span>{result.key.replace("developedNonUs", zh ? "日股" : "Japan").replace("emerging", zh ? "新兴市场" : "Emerging").replace("us", zh ? "美股" : "US")}</span><strong>{(result.currentWeight * 100).toFixed(1)}%</strong><small>{(result.lowerWeight * 100).toFixed(1)}% – {(result.upperWeight * 100).toFixed(1)}%</small>{result.status !== "within" && <b>{result.tradeSide === "BUY" ? (zh ? "最少买入" : "Min buy") : (zh ? "最少卖出" : "Min sell")} {money(result.minimumTradeValue)}</b>}</div>)}</div></> : <p>{zh ? "导入持仓后运行本月检查。" : "Import positions before running this month's check."}</p>}
        {!readOnly && user.role === "execution_team" && <button className="secondary-button compact" disabled={!context.latestSnapshot || busy} onClick={check}>{zh ? "运行本月检查" : "Run monthly check"}</button>}
      </section>
    </div>
    {context.plans.some((plan) => plan.status !== "cancelled") && <section className="rebalance-options"><header><span className="section-label">{zh ? "系统方案" : "System plans"}</span><h3>{zh ? "选择一套实施方案" : "Select an implementation plan"}</h3></header><div>{context.plans.filter((plan) => plan.status !== "cancelled").map((plan) => <article key={plan.id}><div><strong>{plan.option_key === "minimum" ? (zh ? "方案一：最少交易" : "Plan 1: Minimum trade") : (zh ? "方案二：回到目标" : "Plan 2: Return to target")}</strong><span>{zh ? `完成期限 ${dateOnly(plan.completion_due_date)}` : `Due ${dateOnly(plan.completion_due_date)}`}</span></div><p>{plan.orders.length} {zh ? "笔标准化买卖建议" : "standardized orders"} · {money(plan.orders.reduce((sum, order) => sum + order.value, 0))}</p>{plan.status === "proposed" && !readOnly && user.role === "execution_team" ? <button className="primary-button compact" onClick={() => accept(plan.id)} disabled={busy}>{zh ? "接受方案" : "Accept plan"}</button> : <strong className={plan.status === "overdue" ? "result-fail" : "result-pass"}>{plan.status === "accepted" ? (zh ? "已接受" : "Accepted") : plan.status === "completed" ? (zh ? "已完成" : "Completed") : plan.status === "overdue" ? (zh ? "已逾期" : "Overdue") : plan.status}</strong>}</article>)}</div></section>}
    {context.latestFollowup && <section className={`rebalance-followup ${context.latestFollowup.status}`}><div><span className="section-label">{zh ? "到期复核记录" : "Deadline verification"}</span><h3>{context.latestFollowup.status === "completed" ? (zh ? "持仓已回到允许范围" : "Positions are back within corridor") : (zh ? "持仓仍未回到允许范围" : "Positions remain outside corridor")}</h3><p>{zh ? `期限 ${dateOnly(context.latestFollowup.completion_due_date)} · 复核 ${dateOnly(context.latestFollowup.verification_date)}` : `Due ${dateOnly(context.latestFollowup.completion_due_date)} · Verified ${dateOnly(context.latestFollowup.verification_date)}`}</p></div><strong className={context.latestFollowup.status === "completed" ? "result-pass" : "result-fail"}>{context.latestFollowup.status === "completed" ? (zh ? "完成" : "COMPLETED") : (zh ? "逾期提醒已发送" : "OVERDUE ALERT SENT")}</strong></section>}
    {!readOnly && user.role === "execution_team" && context.latestSnapshot && <div className="monitoring-next"><button className="primary-button compact" onClick={openNonEquityNav} disabled={busy}>{zh ? "进入非股票净值" : "Continue to non-equity NAV"}</button></div>}
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

function NonEquityNavPanel({ locale, user, workflow, onWorkflowChanged, readOnly = false }: { locale: Locale; user: User; workflow: AnnualWorkflow; onWorkflowChanged: () => Promise<void> | void; readOnly?: boolean }) {
  const zh = locale === "zh-CN";
  const [context, setContext] = useState<NonEquityNavContext | null>(null);
  const [round, setRound] = useState<ApprovalRound | null>(null);
  const [asOfDate, setAsOfDate] = useState("");
  const [bondNav, setBondNav] = useState(0); const [alternativeNav, setAlternativeNav] = useState(0); const [cashNav, setCashNav] = useState(0);
  const [sourceNote, setSourceNote] = useState(zh ? "经执行小组核对的期末净值" : "Period-end NAV verified by the execution team");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const load = async () => {
    const [nav, approval] = await Promise.all([
      api<NonEquityNavContext>(`/api/workflows/${workflow.id}/non-equity-nav/context`),
      api<{ approvalRound: ApprovalRound | null }>(`/api/workflows/${workflow.id}/approval-rounds/open`),
    ]);
    setContext(nav); setRound(approval.approvalRound);
    if (!nav.navVersion || ["approved", "rejected"].includes(nav.navVersion.status)) {
      setAsOfDate(nav.latestEquityBusinessDate ?? "");
      setBondNav(nav.principal * nav.assetWeights.bond);
      setAlternativeNav(nav.principal * nav.assetWeights.alternative);
      setCashNav(nav.principal * nav.assetWeights.cash);
    }
  };
  useEffect(() => { void load(); }, [workflow.id]);
  async function submit() {
    setBusy(true); setMessage(null);
    try {
      const saved = await api<{ navVersion: { id: string } }>(`/api/workflows/${workflow.id}/non-equity-nav/versions`, { method: "POST", body: JSON.stringify({ asOfDate, bondNav, alternativeNav, cashNav, sourceNote }) });
      await api(`/api/workflows/${workflow.id}/approval-rounds`, { method: "POST", body: JSON.stringify({ action: "approve_non_equity_nav", payload: { nonEquityNavVersionId: saved.navVersion.id } }) });
      await load(); setMessage(zh ? "非股票净值已提交委员会审批。" : "Non-equity NAV was submitted for committee approval.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function vote(decision: "approve" | "reject") {
    if (!round) return; setBusy(true); setMessage(null);
    try { await api(`/api/approval-rounds/${round.id}/votes`, { method: "POST", body: JSON.stringify({ decision }) }); await onWorkflowChanged(); await load(); }
    catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  if (!context) return <section className="placeholder"><p>{zh ? "正在读取非股票净值" : "Loading non-equity NAV"}</p></section>;
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: context.currency, maximumFractionDigits: 0 }).format(value);
  const canStartNewVersion = context.workflowStep === "non_equity_nav" && (!context.navVersion || ["approved", "rejected"].includes(context.navVersion.status));
  return <section className="non-equity-panel annual-data-panel"><header><div><span className="section-label">{zh ? "报告前置" : "Before reporting"}</span><h3>{zh ? "非股票资产净值" : "Non-equity asset NAV"}</h3></div>{context.navVersion && <strong className={context.navVersion.status === "approved" ? "result-pass" : "pending-note"}>v{context.navVersion.version} · {context.navVersion.status}</strong>}</header>
    {canStartNewVersion && !readOnly && user.role === "execution_team" ? <div className="nav-entry-grid"><label><span>{zh ? "净值日期（与最新持仓一致）" : "NAV date (aligned with latest positions)"}</span><input type="date" value={asOfDate} readOnly /></label><label><span>{zh ? "债券净值" : "Bond NAV"}</span><input type="number" min="0" value={bondNav} onChange={(event) => setBondNav(Number(event.target.value))} /></label><label><span>{zh ? "另类资产净值" : "Alternative NAV"}</span><input type="number" min="0" value={alternativeNav} onChange={(event) => setAlternativeNav(Number(event.target.value))} /></label><label><span>{zh ? "现金净值" : "Cash NAV"}</span><input type="number" min="0" value={cashNav} onChange={(event) => setCashNav(Number(event.target.value))} /></label><label className="wide"><span>{zh ? "来源说明" : "Source note"}</span><input value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} /></label><button className="primary-button compact" onClick={submit} disabled={busy || !asOfDate}>{zh ? "提交委员会审批" : "Submit for committee approval"}</button></div> : context.navVersion ? <div className="nav-review"><span>{zh ? "债券" : "Bonds"}<strong>{money(Number(context.navVersion.bond_nav))}</strong></span><span>{zh ? "另类" : "Alternatives"}<strong>{money(Number(context.navVersion.alternative_nav))}</strong></span><span>{zh ? "现金" : "Cash"}<strong>{money(Number(context.navVersion.cash_nav))}</strong></span><span>{zh ? "日期" : "Date"}<strong>{context.navVersion.as_of_date}</strong></span></div> : <p className="readonly-note">{zh ? "等待执行小组提交。" : "Waiting for execution-team submission."}</p>}
    {!readOnly && context.navVersion?.status === "submitted" && user.role === "decision_committee" && round && <div className="approval-actions"><button className="secondary-button" onClick={() => vote("reject")} disabled={busy}>{zh ? "退回" : "Reject"}</button><button className="primary-button compact" onClick={() => vote("approve")} disabled={busy}>{zh ? "批准净值并生成报告" : "Approve NAV for reporting"}</button></div>}
    {!readOnly && context.navVersion?.status === "submitted" && user.role === "execution_team" && <p className="readonly-note">{zh ? "等待委员会批准。" : "Waiting for committee approval."}</p>}
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

function ReportPanel({ locale, user, workflow, onWorkflowChanged, readOnly = false }: { locale: Locale; user: User; workflow: AnnualWorkflow; onWorkflowChanged: () => Promise<void> | void; readOnly?: boolean }) {
  const zh = locale === "zh-CN"; const [context, setContext] = useState<ReportContext | null>(null); const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [distributions, setDistributions] = useState<Array<{ id: string; channel: string; recipients: string; status: string; note: string | null; distributed_at: string; distributed_by_name: string }>>([]);
  const [recipients, setRecipients] = useState(""); const [distributionChannel, setDistributionChannel] = useState("email"); const [distributionNote, setDistributionNote] = useState("");
  const load = () => api<ReportContext>(`/api/workflows/${workflow.id}/reports/context`).then(setContext);
  useEffect(() => { void load(); }, [workflow.id]);
  useEffect(() => { if (context?.report) void api<{ distributions: typeof distributions }>(`/api/reports/${context.report.id}/distributions`).then((result) => setDistributions(result.distributions)); }, [context?.report?.id]);
  async function generate() { setBusy(true); setMessage(null); try { await api(`/api/workflows/${workflow.id}/reports`, { method: "POST", body: "{}" }); await load(); } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); } }
  async function publish() { if (!context?.report) return; setBusy(true); setMessage(null); try { await api(`/api/workflows/${workflow.id}/actions`, { method: "POST", body: JSON.stringify({ action: "publish_report", payload: { reportVersionId: context.report.id } }) }); await onWorkflowChanged(); await load(); } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); } }
  async function recordDistribution() { if (!context?.report || !recipients.trim()) return; setBusy(true); setMessage(null); try { await api(`/api/reports/${context.report.id}/distributions`, { method: "POST", body: JSON.stringify({ channel: distributionChannel, recipients: recipients.trim(), status: "sent", note: distributionNote || undefined }) }); const result = await api<{ distributions: typeof distributions }>(`/api/reports/${context.report.id}/distributions`); setDistributions(result.distributions); setRecipients(""); setDistributionNote(""); setMessage(zh ? "报告发送记录已写入审计链。" : "Report distribution was recorded in the audit trail."); } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); } }
  if (!context) return <section className="placeholder"><p>{zh ? "正在读取报告" : "Loading report"}</p></section>;
  if (!context.report) return <section className="report-empty annual-data-panel"><FileBarChart size={28} /><h3>{zh ? "批准的数据已就绪" : "Approved data are ready"}</h3><p>{zh ? "生成报告后，前端显示和 PDF 下载同时可用。" : "Generate the report to enable both on-screen review and PDF download."}</p>{!readOnly && user.role === "execution_team" ? <button className="primary-button compact" onClick={generate} disabled={busy}>{zh ? "生成报告" : "Generate report"}</button> : <span className="readonly-note">{zh ? "只读：报告由执行小组生成。" : "Read only: the execution team generates the report."}</span>}</section>;
  const data = context.report.report_data; const pct = (value: number | null) => value == null ? "—" : `${((Math.abs(value) < 0.0000001 ? 0 : value) * 100).toFixed(2)}%`; const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: data.currency, maximumFractionDigits: 0 }).format(value);
  const allocationTotal = data.assetClassContributions.reduce((sum, item) => sum + Math.max(0, item.endingValue), 0) || 1;
  const pie = `conic-gradient(#1b6b56 0 ${(data.assetClassContributions[0].endingValue / allocationTotal) * 100}%, #c08a36 0 ${((data.assetClassContributions[0].endingValue + data.assetClassContributions[1].endingValue) / allocationTotal) * 100}%, #4973a6 0 ${((data.assetClassContributions[0].endingValue + data.assetClassContributions[1].endingValue + data.assetClassContributions[2].endingValue) / allocationTotal) * 100}%, #8b9691 0 100%)`;
  return <section className="report-panel annual-data-panel"><header><div><span className="section-label">{zh ? "投资报告" : "Investment report"}</span><h3>{zh ? `截至 ${data.asOfDate}` : `As of ${data.asOfDate}`}</h3></div><div className="report-actions"><a className="secondary-button compact" href={`/api/reports/${context.report.id}/pdf`}>{zh ? "下载 PDF" : "Download PDF"}</a>{!readOnly && user.role === "execution_team" && <button className="secondary-button compact" onClick={generate} disabled={busy}>{busy ? (zh ? "正在更新" : "Updating") : (zh ? "更新报告" : "Update report")}</button>}{!readOnly && context.report.status === "draft" && user.role === "execution_team" && <button className="primary-button compact" onClick={publish} disabled={busy}>{zh ? "发布报告" : "Publish report"}</button>}</div></header>
    <div className="report-screens"><button className={screen === 1 ? "active" : ""} onClick={() => setScreen(1)}>1 · {zh ? "净值与目标" : "NAV & target"}</button><button className={screen === 2 ? "active" : ""} onClick={() => setScreen(2)}>2 · {zh ? "风险指标" : "Risk metrics"}</button><button className={screen === 3 ? "active" : ""} onClick={() => setScreen(3)}>3 · {zh ? "贡献与归因" : "Contribution"}</button></div>
    {screen === 1 && <div className="report-screen"><div className="report-kpis"><span>{zh ? "初始本金" : "Initial principal"}<strong>{money(data.principal)}</strong></span><span>{zh ? "期末净值" : "Ending NAV"}<strong>{money(data.totalNav)}</strong></span><span>{zh ? "收益率 / 目标" : "Return / target"}<strong className={data.targetAchieved ? "result-pass" : "result-fail"}>{pct(data.totalReturn)} / {pct(data.targetReturn)}</strong></span><span>{zh ? "净外部现金流" : "Net external flow"}<strong>{money(data.netExternalFlow ?? 0)}</strong><small>{data.returnMethod === "modified_dietz" ? "Modified Dietz" : (zh ? "无现金流调整" : "No flow adjustment")}</small></span></div><EquityCurve points={data.equityCurve.map((point) => ({ business_date: point.date, market_value: point.value, currency: data.currency }))} locale={locale} />{data.externalCashFlows?.length > 0 && <div className="cash-flow-list">{data.externalCashFlows.map((flow, index) => <span key={`${flow.flow_date}-${index}`}><b>{flow.flow_date}</b>{flow.flow_type}<strong>{money(flow.amount)}</strong></span>)}</div>}</div>}
    {screen === 2 && <div className="report-screen"><div className="table-wrap"><table><thead><tr><th>Sleeve</th><th>{zh ? "观察数" : "Observations"}</th><th>{zh ? "期间收益" : "Period return"}</th><th>Sharpe</th><th>Sortino</th><th>{zh ? "最大回撤" : "Max drawdown"}</th></tr></thead><tbody>{data.sleeveMetrics.map((metric) => <tr key={metric.key}><td><strong>{metric.key}</strong></td><td>{metric.observationCount}</td><td>{pct(metric.periodReturn)}</td><td>{metric.sharpe?.toFixed(2) ?? "—"}</td><td>{metric.sortino?.toFixed(2) ?? "—"}</td><td>{pct(metric.maximumDrawdown)}</td></tr>)}</tbody></table></div>{!data.dataQuality.sleeveMetricsAvailable && <p className="data-warning">{zh ? "期间收益和回撤已按现有数据计算；Sharpe 与 Sortino 至少需要 20 个有效持仓日。" : "Period return and drawdown use available data; Sharpe and Sortino require at least 20 effective position dates."}</p>}</div>}
    {screen === 3 && <div className="report-screen contribution-screen"><div className="asset-pie" style={{ background: pie }} aria-label={zh ? "大类资产期末净值占比" : "Ending asset mix"} /><div className="asset-contributions">{data.assetClassContributions.map((item) => <span key={item.key}><b>{item.key}</b><strong>{money(item.endingValue)}</strong><small>{zh ? "收益贡献" : "Return contribution"} {pct(item.contributionPct)}</small></span>)}</div>{data.attribution.pureSelectionAvailable ? <><div className="attribution-result"><span>{zh ? "市场贡献" : "Market"}<strong>{pct(data.attribution.marketEffect)}</strong></span><span>{zh ? "配置贡献（决策）" : "Allocation"}<strong>{pct(data.attribution.allocationEffect)}</strong></span><span>{zh ? "择股贡献（执行）" : "Security selection"}<strong>{pct(data.attribution.selectionEffect)}</strong></span><span>{zh ? "交互贡献" : "Interaction"}<strong>{pct(data.attribution.interactionEffect)}</strong></span><span>{zh ? "非股票贡献" : "Non-equity"}<strong>{pct(data.attribution.nonEquityEffect)}</strong></span><span>{zh ? "合计" : "Total"}<strong>{pct(data.attribution.totalContribution)}</strong></span></div><p className="data-note">{zh ? `使用同期间、美元口径的市场基准（基准版本 v${data.attribution.benchmarkVersion}），市场、配置、择股、交互及非股票贡献相加等于组合总收益。` : `Uses matching-period USD benchmark series (version v${data.attribution.benchmarkVersion}); all components reconcile to total portfolio return.`}</p></> : <><div className="attribution-result"><span>{zh ? "配置及非股票贡献" : "Allocation and non-equity"}<strong>{pct(data.attribution.allocationEffect)}</strong></span><span>{zh ? "股票实施贡献（含市场影响）" : "Equity implementation (incl. market)"}<strong>{pct(data.attribution.selectionEffect)}</strong></span><span>{zh ? "合计" : "Total"}<strong>{pct(data.attribution.totalContribution)}</strong></span></div><p className="data-warning">{zh ? "同期间美元基准序列尚未完整，暂不把股票实施贡献标记为纯择股能力。" : "Matching-period USD benchmark series are incomplete, so equity implementation is not labeled as pure selection skill."}</p></>}</div>}
    <section className="report-distribution"><header><div><span className="section-label">{zh ? "正式留痕" : "Formal record"}</span><h4>{zh ? "报告发送记录" : "Report distribution log"}</h4></div><Send size={20} /></header>{!readOnly && user.role === "execution_team" && context.report.status === "published" && <div className="distribution-form"><select value={distributionChannel} onChange={(event) => setDistributionChannel(event.target.value)}><option value="email">Email</option><option value="meeting">{zh ? "会议" : "Meeting"}</option><option value="secure_link">{zh ? "安全链接" : "Secure link"}</option><option value="other">{zh ? "其他" : "Other"}</option></select><input value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder={zh ? "收件人或参会人员" : "Recipients or attendees"} /><input value={distributionNote} onChange={(event) => setDistributionNote(event.target.value)} placeholder={zh ? "说明（可选）" : "Note (optional)"} /><button className="primary-button compact" onClick={recordDistribution} disabled={busy || !recipients.trim()}>{zh ? "记录已发送" : "Record sent"}</button></div>}{context.report.status !== "published" && <p className="readonly-note">{zh ? "发布报告后才能登记正式发送。" : "Publish the report before recording distribution."}</p>}<div className="distribution-list">{distributions.map((item) => <span key={item.id}><strong>{item.recipients}</strong><b>{item.channel} · {item.status}</b><small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.distributed_at))} · {item.distributed_by_name}</small></span>)}</div></section>
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

const annualSteps = ["annual_data", "target_return", "sleeve_targets", "proposed_portfolio", "backtest", "optimization", "portfolio_approval", "implementation", "monitoring", "non_equity_nav", "reporting"] as const;
type AnnualStep = typeof annualSteps[number];

function AnnualPage({ locale, user, onDirtyChange }: { locale: Locale; user: User; onDirtyChange: (dirty: boolean) => void }) {
  const zh = locale === "zh-CN";
  const labels: Record<string, [string, string]> = {
    annual_data: ["年度公开数据", "Annual public data"], target_return: ["目标收益率", "Target return"], sleeve_targets: ["Sleeve 目标", "Sleeve targets"],
    proposed_portfolio: ["拟投资组合", "Proposed portfolio"], backtest: ["回测", "Backtest"], optimization: ["优化", "Optimization"],
    portfolio_approval: ["组合审批", "Portfolio approval"], implementation: ["实施", "Implementation"], monitoring: ["监控与再平衡", "Monitoring and rebalancing"],
    non_equity_nav: ["非股票净值", "Non-equity NAV"], reporting: ["报告与归因", "Reporting and attribution"],
  };
  const [workflow, setWorkflow] = useState<AnnualWorkflow | null>(null);
  const [viewedStep, setViewedStep] = useState<AnnualStep | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [scenario, setScenario] = useState<"bull" | "balanced" | "bear">("balanced");
  const [annualPackage, setAnnualPackage] = useState<AnnualDataPackage | null>(null);
  const [targetContext, setTargetContext] = useState<TargetReturnContext | null>(null);
  const [targetReturnPct, setTargetReturnPct] = useState(0);
  const [sleeveContext, setSleeveContext] = useState<SleeveTargetContext | null>(null);
  const [proposedContext, setProposedContext] = useState<ProposedPortfolioContext | null>(null);
  const [proposalDirty, setProposalDirty] = useState(false);
  const reportProposalDirty = useCallback((dirty: boolean) => { setProposalDirty(dirty); onDirtyChange(dirty); }, [onDirtyChange]);
  const [backtestContext, setBacktestContext] = useState<BacktestContext | null>(null);
  const [historyCoverage, setHistoryCoverage] = useState<HistoryReport | null>(null);
  const [optimizationRun, setOptimizationRun] = useState<OptimizationRun | null>(null);
  const [portfolioApprovalContext, setPortfolioApprovalContext] = useState<PortfolioApprovalContext | null>(null);
  const [implementationContext, setImplementationContext] = useState<ImplementationContext | null>(null);
  const [approvalRound, setApprovalRound] = useState<ApprovalRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const displayStep = viewedStep ?? (workflow?.current_step as AnnualStep | undefined) ?? null;
  useEffect(() => { setHistoryCoverage(null); }, [workflow?.id, displayStep]);
  const viewStep = (step: AnnualStep | null) => {
    if (proposalDirty && step !== displayStep && !window.confirm(zh ? "拟持仓尚未保存，离开会放弃草稿。确定离开？" : "Unsaved proposed holdings will be discarded. Leave this step?")) return;
    setViewedStep(step);
  };
  const load = () => api<{ workflow: AnnualWorkflow | null }>("/api/workflows/annual/active").then((result) => setWorkflow(result.workflow));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!workflow) return;
    void Promise.all([
      api<{ annualDataPackage: AnnualDataPackage | null }>(`/api/workflows/${workflow.id}/annual-data/latest`).then((result) => setAnnualPackage(result.annualDataPackage)),
      api<{ approvalRound: ApprovalRound | null }>(`/api/workflows/${workflow.id}/approval-rounds/open`).then((result) => setApprovalRound(result.approvalRound)),
      displayStep === "target_return"
        ? api<TargetReturnContext>(`/api/workflows/${workflow.id}/target-return/context`).then((result) => {
          setTargetContext(result);
          setTargetReturnPct(Number((Number(result.targetReturnVersion?.target_return_rate ?? result.context.suggestedTargetReturnRate) * 100).toFixed(2)));
        })
        : Promise.resolve(),
      displayStep === "sleeve_targets"
        ? api<SleeveTargetContext>(`/api/workflows/${workflow.id}/sleeve-targets/context`).then(setSleeveContext)
        : Promise.resolve(),
      displayStep === "proposed_portfolio"
        ? api<ProposedPortfolioContext>(`/api/workflows/${workflow.id}/proposed-portfolio/context`).then((result) => {
          setProposedContext(result);
        })
        : Promise.resolve(),
      displayStep === "backtest"
        ? api<BacktestContext>(`/api/workflows/${workflow.id}/backtest/context`).then(setBacktestContext)
        : Promise.resolve(),
      displayStep === "optimization"
        ? api<{ optimizationRun: OptimizationRun | null }>(`/api/workflows/${workflow.id}/optimization/context`).then((result) => setOptimizationRun(result.optimizationRun))
        : Promise.resolve(),
      displayStep === "portfolio_approval"
        ? api<PortfolioApprovalContext>(`/api/workflows/${workflow.id}/portfolio-approval/context`).then(setPortfolioApprovalContext)
        : Promise.resolve(),
      displayStep === "implementation"
        ? api<ImplementationContext>(`/api/workflows/${workflow.id}/implementation/context`).then(setImplementationContext)
        : Promise.resolve(),
    ]);
  }, [workflow?.id, workflow?.current_step, displayStep]);
  async function start(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    try { await api("/api/workflows/annual", { method: "POST", body: JSON.stringify({ businessYear: year }) }); await load(); }
    catch { setMessage(zh ? "年度流程未能启动，请确认本金和参数已经生效。" : "The annual cycle could not start. Confirm principal and parameters are effective."); }
  }
  async function runPublicData() {
    if (!workflow) return;
    setBusy(true); setMessage(zh ? "正在读取并核验官方历史数据，请稍候。" : "Retrieving and validating official history.");
    try {
      const result = await api<{ annualDataPackage: AnnualDataPackage }>(`/api/workflows/${workflow.id}/annual-data/runs`, { method: "POST", body: JSON.stringify({ scenario }) });
      setAnnualPackage(result.annualDataPackage); setApprovalRound(null);
      setMessage(zh ? "公开数据运行成功，系统建议已生成。" : "The public-data run succeeded and the recommendation is ready.");
    } catch (reason) {
      setMessage(zh ? `运行失败：${(reason as Error).message}。系统没有使用样例数据。` : `Run failed: ${(reason as Error).message}. No sample data was used.`);
    } finally { setBusy(false); }
  }
  async function openApproval() {
    if (!workflow || !annualPackage) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ approvalRound: ApprovalRound }>(`/api/workflows/${workflow.id}/approval-rounds`, { method: "POST", body: JSON.stringify({ action: "accept_annual_data", payload: { annualDataPackageId: annualPackage.id } }) });
      setApprovalRound(result.approvalRound); setMessage(zh ? "建议已经提交委员会表决。" : "The recommendation is open for committee voting.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function vote(decision: "approve" | "reject") {
    if (!approvalRound) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/approval-rounds/${approvalRound.id}/votes`, { method: "POST", body: JSON.stringify({ decision }) });
      await load(); setApprovalRound(null);
      const targetVote = approvalRound.proposed_action === "approve_target_return";
      const portfolioVote = approvalRound.proposed_action === "approve_portfolio";
      setMessage(decision === "approve" ? (portfolioVote ? (zh ? "拟投资组合已经委员会批准，进入实施。" : "The proposed portfolio is approved and moves to implementation.") : targetVote ? (zh ? "目标收益率已经批准并生效。" : "The target return is approved and effective.") : (zh ? "年度数据建议已经批准并生效。" : "The annual-data recommendation is approved and effective.")) : (zh ? "建议未获批准。" : "The recommendation was rejected."));
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function submitTargetReturn() {
    if (!workflow || !targetContext) return;
    setBusy(true); setMessage(null);
    try {
      const prepared = await api<{ targetReturnVersion: { id: string } }>(`/api/workflows/${workflow.id}/target-return/versions`, {
        method: "POST", body: JSON.stringify({ targetReturnRate: targetReturnPct / 100 }),
      });
      const opened = await api<{ approvalRound: ApprovalRound }>(`/api/workflows/${workflow.id}/approval-rounds`, {
        method: "POST", body: JSON.stringify({ action: "approve_target_return", payload: { targetReturnVersionId: prepared.targetReturnVersion.id } }),
      });
      setApprovalRound(opened.approvalRound);
      setMessage(zh ? "目标收益率已保存并提交委员会表决。" : "The target return is saved and open for committee voting.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function confirmSleeveTargets() {
    if (!workflow) return;
    setBusy(true); setMessage(null);
    try {
      const generated = await api<{ sleeveTargetVersion: { id: string } }>(`/api/workflows/${workflow.id}/sleeve-targets/versions`, { method: "POST", body: "{}" });
      await api(`/api/workflows/${workflow.id}/actions`, {
        method: "POST", body: JSON.stringify({ action: "complete_sleeve_targets", payload: { sleeveTargetVersionId: generated.sleeveTargetVersion.id } }),
      });
      await load();
      setMessage(zh ? "Sleeve 目标已确认，进入拟投资组合。" : "Sleeve targets are confirmed; the workflow moved to the proposed portfolio.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function submitProposedPortfolio(proposedHoldings: Holding[]) {
    if (!workflow) return;
    setBusy(true); setMessage(null);
    let savedVersion = false;
    try {
      const saved = await api<{ proposedPortfolioVersion: { id: string } }>(`/api/workflows/${workflow.id}/proposed-portfolio/versions`, {
        method: "POST", body: JSON.stringify({ holdings: proposedHoldings }),
      });
      savedVersion = true;
      await api(`/api/workflows/${workflow.id}/actions`, {
        method: "POST", body: JSON.stringify({ action: "submit_proposed_portfolio", payload: { proposedPortfolioVersionId: saved.proposedPortfolioVersion.id } }),
      });
      await load();
      setMessage(zh ? "拟投资组合已提交，进入真实历史回测。" : "The proposed portfolio is submitted for historical backtesting.");
    } catch (reason) {
      if (savedVersion) {
        try { await load(); } catch { /* Keep the original submission error visible. */ }
        setMessage(zh ? `拟持仓新版本已保存，但流程推进或刷新失败，请刷新核对后再操作：${(reason as Error).message}` : `The new portfolio version was saved, but advancing or refreshing the workflow failed. Refresh and review before retrying: ${(reason as Error).message}`);
      } else setMessage((reason as Error).message);
    }
    finally { setBusy(false); }
  }
  async function checkBacktestCoverage() {
    if (!workflow) return;
    setBusy(true); setMessage(null); setHistoryCoverage(null);
    try {
      const result = await api<{ report: HistoryReport }>(`/api/workflows/${workflow.id}/backtest/preflight`, { method: "POST", body: "{}" });
      setHistoryCoverage(result.report);
      setMessage(result.report.ready ? (zh ? "价格覆盖检查通过，可以运行回测；风险控制仍需计算。" : "Price coverage ready. Run the backtest to check risk controls.") : (zh ? "已列出所有数据问题。不会自动放宽100周门槛。" : "All data issues are listed. The 100-week minimum has not been relaxed."));
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  }
  async function runBacktest() {
    if (!workflow) return;
    setBusy(true); setHistoryCoverage(null); setMessage(zh ? "正在取得并核验三个市场的三年周度真实价格。" : "Retrieving and validating three years of weekly market prices.");
    try {
      const result = await api<{ backtestRun: BacktestRun }>(`/api/workflows/${workflow.id}/backtest/runs`, { method: "POST", body: "{}" });
      setBacktestContext((current) => ({ policy: current?.policy ?? { months: 36, frequency: "weekly", betaRelative: 0.05, returnShortfall: 0.05, drawdownExcess: 0.10 }, backtestRun: result.backtestRun }));
      setHistoryCoverage(result.backtestRun.data_manifest.coverageReport ?? null);
      setMessage(result.backtestRun.hard_control_pass ? (zh ? "三个 Sleeve 均通过硬性控制。" : "All sleeves passed hard controls.") : (zh ? "至少一个 Sleeve 未通过，需进入优化。" : "At least one sleeve failed and requires optimization."));
    } catch (reason) {
      const report = (reason as Error & { body?: { report?: HistoryReport } }).body?.report;
      if (report) setHistoryCoverage(report);
      setMessage(zh ? `回测未完成：${(reason as Error).message}。未使用样本价格，也未放宽历史长度要求。` : `Backtest not completed: ${(reason as Error).message}. No sample prices or relaxed history gate were used.`);
    }
    finally { setBusy(false); }
  }
  async function recordBacktestOutcome() {
    if (!workflow || !backtestContext?.backtestRun) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/workflows/${workflow.id}/actions`, {
        method: "POST", body: JSON.stringify({
          action: backtestContext.backtestRun.hard_control_pass ? "record_backtest_pass" : "record_backtest_fail",
          payload: { backtestRunId: backtestContext.backtestRun.id },
        }),
      });
      await load();
      setMessage(backtestContext.backtestRun.hard_control_pass ? (zh ? "回测结果已记录，进入组合审批。" : "Backtest recorded; moving to portfolio approval.") : (zh ? "回测结果已记录，进入逐 Sleeve 优化。" : "Backtest recorded; moving to sleeve-by-sleeve optimization."));
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function runOptimization() {
    if (!workflow) return;
    setBusy(true); setMessage(zh ? "正在按 Sleeve 独立求解，先只调整现有股票权重。" : "Solving each sleeve independently, starting with weight-only changes.");
    try {
      const result = await api<{ optimizationRun: OptimizationRun }>(`/api/workflows/${workflow.id}/optimization/runs`, { method: "POST", body: "{}" });
      setOptimizationRun(result.optimizationRun);
      setMessage(zh ? "已生成三组通过控制的优化方案。" : "Three passing optimization candidates are ready.");
    } catch (reason) { setMessage(zh ? `优化失败：${(reason as Error).message}` : `Optimization failed: ${(reason as Error).message}`); }
    finally { setBusy(false); }
  }
  async function selectOptimization(candidateKey: string) {
    if (!workflow || !optimizationRun) return;
    setBusy(true); setMessage(null);
    try {
      const selected = await api<{ proposedPortfolioVersion: { id: string } }>(`/api/optimization-runs/${optimizationRun.id}/select`, {
        method: "POST", body: JSON.stringify({ candidateKey }),
      });
      await api(`/api/workflows/${workflow.id}/actions`, {
        method: "POST", body: JSON.stringify({ action: "accept_optimization", payload: { optimizationRunId: optimizationRun.id, proposedPortfolioVersionId: selected.proposedPortfolioVersion.id } }),
      });
      await load();
      setMessage(zh ? "执行小组已选择方案，优化后的组合和复核结果已提交委员会审批。" : "The execution team selected a candidate and submitted the validated portfolio for approval.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function submitPortfolioApproval() {
    if (!workflow || !portfolioApprovalContext) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ approvalRound: ApprovalRound }>(`/api/workflows/${workflow.id}/approval-rounds`, {
        method: "POST", body: JSON.stringify({ action: "approve_portfolio", payload: { proposedPortfolioVersionId: portfolioApprovalContext.portfolio.id } }),
      });
      setApprovalRound(result.approvalRound);
      setMessage(zh ? "拟投资组合已由执行小组提交委员会表决。" : "The execution team submitted the proposed portfolio for committee vote.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function submitImplementation() {
    if (!workflow || !implementationContext) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ executionAction: ImplementationContext["executionAction"] }>(`/api/workflows/${workflow.id}/execution-actions`, {
        method: "POST", body: JSON.stringify({
          actionType: "confirm_implementation",
          payload: { approvedPortfolioId: implementationContext.approvedPortfolio.id, orders: implementationContext.orders },
        }),
      });
      setImplementationContext({ ...implementationContext, executionAction: result.executionAction });
      setMessage(zh ? "标准化交易计划已提交，等待另一名执行人员复核。" : "The standardized trade plan awaits a second execution user's review.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function reviewImplementation(decision: "approve" | "reject") {
    if (!workflow || !implementationContext?.executionAction) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/execution-actions/${implementationContext.executionAction.id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
      await load();
      setMessage(decision === "approve" ? (zh ? "交易计划已由第二人复核，进入监控与再平衡。" : "A second user approved the plan; monitoring begins.") : (zh ? "交易计划被退回。" : "The trade plan was rejected."));
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }
  const currentIndex = workflow ? annualSteps.indexOf(workflow.current_step as AnnualStep) : -1;
  const displayedIndex = displayStep ? annualSteps.indexOf(displayStep) : -1;
  const viewIsCurrent = Boolean(workflow && displayStep === workflow.current_step);
  const scenarioLabels = { bull: zh ? "牛市" : "Bull", balanced: zh ? "平衡市" : "Balanced", bear: zh ? "熊市" : "Bear" };
  const assetLabels = { equity: zh ? "股票" : "Equity", bond: zh ? "债券" : "Bonds", alternative: zh ? "另类" : "Alternatives", cash: zh ? "现金" : "Cash" };
  const sleeveLabels = { us: zh ? "美股" : "U.S. equity", developedNonUs: zh ? "发达非美（日本）" : "Developed ex-U.S. (Japan)", emerging: zh ? "新兴市场（A 股及港股）" : "Emerging (China A + Hong Kong)" };
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return <section className="annual-page">
    <header className="page-heading"><div><span className="section-label">{zh ? "年度治理" : "Annual governance"}</span><h2>{zh ? "年度投资流程" : "Annual investment cycle"}</h2></div>{workflow && <div className="version-mark"><strong>{workflow.business_year}</strong><span>{zh ? "进行中" : "Active"}</span></div>}</header>
    {!workflow && <section className="start-cycle-band"><div><h3>{zh ? "尚未启动年度流程" : "The annual cycle has not started"}</h3><p>{zh ? "启动前必须先完成本金和业务参数生效。" : "Principal and business parameters must be effective first."}</p></div>{user.role === "decision_committee" ? <form onSubmit={start}><label><span>{zh ? "年度" : "Year"}</span><input type="number" min="2000" max="2200" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label><button className="primary-button">{zh ? "启动年度流程" : "Start annual cycle"}</button></form> : <strong>{zh ? "等待决策委员会启动" : "Waiting for the committee"}</strong>}</section>}
    {message && <p className="form-error" role="alert">{message}</p>}
    {workflow && <><ol className="workflow-track" aria-label={zh ? "年度流程步骤" : "Annual workflow steps"}>{annualSteps.map((step, index) => {
      const locked = index > currentIndex;
      const state = index === currentIndex ? "current" : index < currentIndex ? "done" : "locked";
      return <li className={`${state} ${index === displayedIndex ? "selected" : ""}`} key={step}><button type="button" disabled={locked || busy} onClick={() => viewStep(step)} aria-current={index === displayedIndex ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span><strong>{labels[step][zh ? 0 : 1]}</strong><small>{state === "current" ? (zh ? "当前" : "Current") : state === "done" ? (zh ? "已完成" : "Completed") : (zh ? "未开始" : "Locked")}</small></button></li>;
    })}</ol>
      <section className={`current-step ${viewIsCurrent ? "" : "history-step"}`}><div><span>{viewIsCurrent ? (zh ? "当前步骤" : "Current step") : (zh ? "历史步骤 · 只读" : "Completed step · read only")}</span><h3>{displayStep ? labels[displayStep][zh ? 0 : 1] : ""}</h3><p>{!viewIsCurrent ? (zh ? "这里显示该步骤已经保存的数据和结果，不提供修改或审批按钮。" : "This view shows saved data and results without action or approval controls.") : displayStep === "annual_data" ? (zh ? "决策委员会运行年度公开数据引擎并审核系统建议。" : "The committee runs the annual public-data engine and reviews the system recommendation.") : displayStep === "target_return" ? (zh ? "决策委员会在管理员维护的范围内确定年度收益率下限。" : "The committee sets the annual return floor inside the administrator-maintained range.") : (zh ? "系统将根据当前角色显示应办事项。" : "The system shows the action due for the current role.")}</p></div>{!viewIsCurrent && <button className="current-step-return" type="button" onClick={() => setViewedStep(null)}>{zh ? "返回当前步骤" : "Return to current step"}<ChevronRight size={16} /></button>}</section>
      {displayStep === "annual_data" && <section className="annual-data-panel">
        <div className="annual-data-toolbar"><div><span className="section-label">{zh ? "未来 12 个月情景" : "12-month scenario"}</span><div className="segmented">{(["bull", "balanced", "bear"] as const).map((value) => <button key={value} className={scenario === value ? "active" : ""} onClick={() => setScenario(value)} disabled={!viewIsCurrent || busy}>{scenarioLabels[value]}</button>)}</div></div>
          {viewIsCurrent && user.role === "decision_committee" && <button className="primary-button compact" onClick={runPublicData} disabled={busy}>{busy ? (zh ? "正在运行" : "Running") : (zh ? "运行公开数据引擎" : "Run public-data engine")}</button>}
        </div>
        {annualPackage && <div className="recommendation">
          <header><div><span className="section-label">{zh ? "系统配置建议" : "System recommendation"}</span><h3>{scenarioLabels[annualPackage.scenario]} · {zh ? "数据截至" : "data through"} {annualPackage.as_of_date.slice(0, 10)}</h3></div><strong>v{annualPackage.version}</strong></header>
          <div className="recommendation-grid"><section><h4>{zh ? "大类资产" : "Asset classes"}</h4>{Object.entries(annualPackage.recommendation.assetWeights).map(([key, value]) => <div className="weight-row" key={key}><span>{assetLabels[key as keyof typeof assetLabels]}</span><div><i style={{ width: pct(value) }} /></div><strong>{pct(value)}</strong></div>)}</section>
            <section><h4>Sleeve</h4>{Object.entries(annualPackage.recommendation.sleeveWeights).map(([key, value]) => <div className="weight-row" key={key}><span>{sleeveLabels[key as keyof typeof sleeveLabels]}</span><div><i style={{ width: pct(value) }} /></div><strong>{pct(value)}</strong></div>)}</section></div>
          <div className="model-facts"><span>{zh ? "历史情景样本" : "Scenario sample"}<strong>{annualPackage.recommendation.scenarioSampleMonths} {zh ? "个月" : "months"}</strong></span><span>{zh ? "组合预期收益" : "Expected return"}<strong>{pct(annualPackage.recommendation.objective.expectedReturn)}</strong></span><span>{zh ? "预期波动" : "Expected volatility"}<strong>{pct(annualPackage.recommendation.objective.expectedVolatility)}</strong></span><span>{zh ? "通胀同比" : "Inflation YoY"}<strong>{pct(annualPackage.recommendation.latestIndicators.inflationYearOverYear)}</strong></span></div>
          <details className="source-details"><summary>{zh ? `查看 ${annualPackage.source_manifest.length} 个真实数据来源` : `View ${annualPackage.source_manifest.length} live sources`}</summary><div className="table-wrap"><table><thead><tr><th>{zh ? "顺序" : "Priority"}</th><th>{zh ? "数据" : "Dataset"}</th><th>{zh ? "权威机构" : "Authority"}</th><th>{zh ? "覆盖" : "Coverage"}</th><th>{zh ? "取数状态" : "Fetch status"}</th></tr></thead><tbody>{annualPackage.source_manifest.map((source) => { const failed = source.attempts?.filter((attempt) => attempt.status === "failed") ?? []; return <tr key={source.code}><td>{source.priority}</td><td><a href={source.publicUrl} target="_blank" rel="noreferrer">{source.displayName}</a></td><td>{source.authorityName}</td><td>{source.firstObservation} – {source.lastObservation}</td><td className="source-status">{failed.length ? <><strong>{zh ? "后备源成功" : "Fallback succeeded"}</strong><span title={failed.map((attempt) => `${attempt.displayName}: ${attempt.message}`).join("\n")}>{zh ? `前 ${failed.length} 个来源失败，悬停查看` : `${failed.length} prior source(s) failed; hover for details`}</span></> : <strong>{zh ? "首选源成功" : "Primary succeeded"}</strong>}</td></tr>; })}</tbody></table></div></details>
          {viewIsCurrent && user.role === "decision_committee" && <div className="approval-actions">{!approvalRound ? <button className="primary-button compact" onClick={openApproval} disabled={busy}>{zh ? "提交委员会表决" : "Open committee vote"}</button> : <><button className="secondary-button" onClick={() => vote("reject")} disabled={busy}>{zh ? "不同意" : "Reject"}</button><button className="primary-button compact" onClick={() => vote("approve")} disabled={busy}>{zh ? "同意并生效" : "Approve and activate"}</button></>}</div>}
        </div>}
      </section>}
      {displayStep === "target_return" && targetContext && <section className="annual-data-panel target-return-panel">
        <div className="target-result"><span className="section-label">{zh ? "系统建议" : "System suggestion"}</span><strong>{pct(targetContext.context.suggestedTargetReturnRate)}</strong><small>{zh ? "这是收益率下限，超过目标不会被判定失败" : "This is a return floor; exceeding it is not a failure"}</small></div>
        <div className="target-input"><label><span>{zh ? "委员会目标收益率" : "Committee target return"}</span><div><input type="number" step="0.1" min={targetContext.context.band.low * 100} max={targetContext.context.band.high * 100} value={targetReturnPct} onChange={(event) => setTargetReturnPct(Number(event.target.value))} disabled={!viewIsCurrent || busy || Boolean(approvalRound)} /><b>%</b></div><small>{zh ? `允许范围 ${pct(targetContext.context.band.low)} – ${pct(targetContext.context.band.high)}` : `Allowed range ${pct(targetContext.context.band.low)} – ${pct(targetContext.context.band.high)}`}</small></label>
          <dl><div><dt>{zh ? "公开数据预期收益" : "Public-data expected return"}</dt><dd>{pct(targetContext.context.publicDataExpectedReturn)}</dd></div><div><dt>{zh ? "通胀 + 运营成本底线" : "Inflation + operating-cost floor"}</dt><dd>{pct(targetContext.context.minimumEconomicFloor)}</dd></div></dl></div>
        <details className="source-details"><summary>{zh ? "查看计算依据" : "View calculation basis"}</summary><p>{zh ? `通胀 ${pct(targetContext.context.expectedCpiRate)} + 运营成本 ${pct(targetContext.context.operatingCostRate)}；系统再与公开数据预期收益比较，并限制在管理员维护的情景范围内。` : `Inflation ${pct(targetContext.context.expectedCpiRate)} plus operating cost ${pct(targetContext.context.operatingCostRate)} is compared with the public-data expectation and constrained to the administrator-maintained scenario range.`}</p></details>
        {viewIsCurrent && user.role === "decision_committee" && <div className="approval-actions">{approvalRound ? <><button className="secondary-button" onClick={() => vote("reject")} disabled={busy}>{zh ? "不同意" : "Reject"}</button><button className="primary-button compact" onClick={() => vote("approve")} disabled={busy}>{zh ? "同意并生效" : "Approve and activate"}</button></> : <button className="primary-button compact" onClick={submitTargetReturn} disabled={busy}>{zh ? "保存并提交表决" : "Save and open vote"}</button>}</div>}
      </section>}
      {displayStep === "sleeve_targets" && sleeveContext && <section className="annual-data-panel sleeve-target-panel">
        <header><div><span className="section-label">{zh ? "股票 Sleeve 约束" : "Equity sleeve controls"}</span><h3>{zh ? `已批准组合收益率下限 ${pct(sleeveContext.context.targetReturnRate)}` : `Approved portfolio return floor ${pct(sleeveContext.context.targetReturnRate)}`}</h3></div></header>
        <div className="sleeve-target-table table-wrap"><table><thead><tr><th>Sleeve</th><th>{zh ? "股票内部权重" : "Within-equity weight"}</th><th>{zh ? "收益率目标" : "Return target"}</th><th>Beta</th><th>{zh ? "最大回撤限制" : "Max drawdown limit"}</th></tr></thead><tbody>{sleeveContext.context.equityTargets.map((target) => <tr key={target.key}><td><strong>{sleeveLabels[target.key]}</strong></td><td>{pct(target.withinEquityWeight)}</td><td>{pct(target.targetReturn)}</td><td><strong>{target.targetBeta.toFixed(2)}</strong>{!target.betaControlActive && <small>{zh ? "仅复核" : "Review only"}</small>}</td><td>{pct(target.maximumDrawdownLimit)}</td></tr>)}</tbody></table></div>
        <div className="model-facts"><span>{zh ? "公开数据基准收益" : "Public-data baseline"}<strong>{pct(sleeveContext.context.decomposition.baselineReturn)}</strong></span><span>{zh ? "高于目标缓冲" : "Buffer above target"}<strong>{pct(sleeveContext.context.decomposition.expectedBuffer)}</strong></span><span>{zh ? "需由股票补足" : "Shortfall assigned to equity"}<strong>{pct(sleeveContext.context.decomposition.shortfallAllocatedToEquity)}</strong></span></div>
        <details className="source-details"><summary>{zh ? "查看约束说明" : "View control basis"}</summary><p>{zh ? "每个 Sleeve 使用本市场无风险利率计算目标 Beta；若公开数据基准收益已经超过组合目标，不会把收益率硬拉回目标。最大回撤限制结合历史回撤与管理员维护的收益/回撤比率。" : "Each sleeve uses its local risk-free rate for target beta. A public-data baseline above the portfolio floor is not forced down. Drawdown limits combine observed history with the administrator-maintained return/drawdown ratio."}</p></details>
        {viewIsCurrent && user.role === "execution_team" ? <div className="approval-actions"><button className="primary-button compact" onClick={confirmSleeveTargets} disabled={busy}>{zh ? "确认 Sleeve 目标并继续" : "Confirm sleeve targets"}</button></div> : <p className="readonly-note">{zh ? "只读：该步骤由执行小组确认。" : "Read only: the execution team owns this step."}</p>}
      </section>}
      {displayStep === "proposed_portfolio" && proposedContext && <ProposedPortfolioEditor context={proposedContext} zh={zh} canEdit={viewIsCurrent && user.role === "execution_team"} busy={busy} onSubmit={submitProposedPortfolio} onDirtyChange={reportProposalDirty} onRefresh={async () => {
        const result = await api<ProposedPortfolioContext>(`/api/workflows/${workflow!.id}/proposed-portfolio/context`);
        setProposedContext(result);
      }} />}
      {displayStep === "backtest" && backtestContext && <section className="annual-data-panel backtest-panel">
        <header><div><span className="section-label">{zh ? "真实历史回测" : "Historical backtest"}</span><h3>{zh ? `${backtestContext.policy.months} 个月 · 周度 · 分 Sleeve 检查` : `${backtestContext.policy.months} months · weekly · sleeve-level controls`}</h3></div>{backtestContext.backtestRun && <strong className={backtestContext.backtestRun.hard_control_pass ? "result-pass" : "result-fail"}>{backtestContext.backtestRun.hard_control_pass ? (zh ? "通过" : "PASS") : (zh ? "需要优化" : "OPTIMIZATION REQUIRED")}</strong>}</header>
        <p className="readonly-note">{zh ? "EODHD为首选；日本个股目前使用Yahoo后备源。短历史股票不会自动剔除或降低门槛。" : "EODHD is primary; Tokyo listings currently use Yahoo fallback. Short-history names are not silently excluded and the minimum is unchanged."}</p>
        {viewIsCurrent && user.role === "execution_team" && <div className="proposal-toolbar"><button className="secondary-button compact" onClick={checkBacktestCoverage} disabled={busy}>{zh ? "检查全部价格覆盖" : "Check all price coverage"}</button>{backtestContext.backtestRun && <button className="secondary-button compact" onClick={runBacktest} disabled={busy}>{zh ? "重新运行真实历史回测" : "Rerun historical backtest"}</button>}</div>}
        {(historyCoverage ?? backtestContext.backtestRun?.data_manifest.coverageReport) && <HistoryCoveragePanel report={(historyCoverage ?? backtestContext.backtestRun!.data_manifest.coverageReport)!} zh={zh} />}
        {!backtestContext.backtestRun ? <div className="backtest-ready"><div><strong>{zh ? "检查 Beta、收益率下限与最大回撤" : "Check beta, return floor and maximum drawdown"}</strong><span>{zh ? "收益率只设下限；高于目标不会判定失败。每个 Sleeve 使用对应市场基准。" : "Return is a floor. Each sleeve uses its own market benchmark."}</span></div>{viewIsCurrent && user.role === "execution_team" && <button className="primary-button compact" onClick={runBacktest} disabled={busy}>{busy ? (zh ? "正在回测" : "Running") : (zh ? "运行真实历史回测" : "Run historical backtest")}</button>}</div> : <>
          <div className="table-wrap"><table><thead><tr><th>Sleeve</th><th>{zh ? "年化收益 / 目标" : "Return / target"}</th><th>Beta / {zh ? "目标" : "target"}</th><th>{zh ? "最大回撤 / 限制" : "Drawdown / limit"}</th><th>{zh ? "结果" : "Result"}</th></tr></thead><tbody>{backtestContext.backtestRun.metrics.sleeves.map((metric) => <tr key={metric.sleeve}><td><strong>{sleeveLabels[metric.sleeve]}</strong><small>{metric.observationCount} {zh ? "周" : "weeks"}</small></td><td>{pct(metric.annualizedReturn)} / {pct(metric.targetReturn)}<small className={`status-${metric.returnControl.status}`}>{metric.returnControl.status}</small></td><td>{metric.beta.toFixed(2)} / {metric.targetBeta.toFixed(2)}<small className={`status-${metric.betaControl.status}`}>{metric.betaControl.status}</small></td><td>{pct(metric.maximumDrawdown)} / {pct(metric.maximumDrawdownLimit)}<small className={`status-${metric.drawdownControl.status}`}>{metric.drawdownControl.status}</small></td><td><strong className={metric.hardPass ? "result-pass" : "result-fail"}>{metric.hardPass ? (zh ? "通过" : "Pass") : (zh ? "未通过" : "Fail")}</strong></td></tr>)}</tbody></table></div>
          <details className="source-details"><summary>{zh ? "查看数据范围与来源" : "View coverage and sources"}</summary><p>{backtestContext.backtestRun.start_date} – {backtestContext.backtestRun.end_date}；{backtestContext.backtestRun.data_manifest.provider}。{zh ? `首选源状态：${backtestContext.backtestRun.data_manifest.primaryProviderStatus}；实际来源按明细显示，历史价格已保存。` : `Primary status: ${backtestContext.backtestRun.data_manifest.primaryProviderStatus}. Actual providers are recorded per symbol; historical prices were persisted.`}</p></details>
          {viewIsCurrent && user.role === "execution_team" && <div className="approval-actions"><button className="primary-button compact" onClick={recordBacktestOutcome} disabled={busy}>{backtestContext.backtestRun.hard_control_pass ? (zh ? "确认并进入审批" : "Confirm and open approval") : (zh ? "确认并进入优化" : "Confirm and optimize")}</button></div>}
        </>}
      </section>}
      {displayStep === "optimization" && <section className="annual-data-panel optimization-panel">
        <header><div><span className="section-label">{zh ? "逐 Sleeve 优化" : "Sleeve-level optimization"}</span><h3>{zh ? "先改权重；无解时才最少更换 Ticker" : "Weights first; minimum ticker replacement only if needed"}</h3></div></header>
        {!optimizationRun ? <div className="backtest-ready"><div><strong>{zh ? "按 Sleeve 独立求解" : "Solve each sleeve independently"}</strong><span>{zh ? "先调整原股票权重；无解时按最少换票原则搜索。已通过的 Sleeve 保持不变。" : "Reweight existing names first, then search the minimum number of replacements. Passing sleeves stay unchanged."}</span></div>{viewIsCurrent && user.role === "execution_team" && <button className="primary-button compact" onClick={runOptimization} disabled={busy}>{busy ? (zh ? "正在优化" : "Optimizing") : (zh ? "生成三组优化方案" : "Generate three candidates")}</button>}</div> : <div className="optimization-grid">{optimizationRun.candidates.map((candidate) => <article key={candidate.key} className="optimization-card"><header><span>{candidate.label}</span><strong>{candidate.sleeveResults ? (zh ? "完整方案" : "Complete plan") : (candidate.sleeve ? sleeveLabels[candidate.sleeve] : "")}</strong></header>{optimizationSleeveResults(candidate).map((result) => <section className="optimization-sleeve" key={result.sleeve}><h4>{sleeveLabels[result.sleeve]}</h4><dl><div><dt>Beta</dt><dd>{result.metrics.beta.toFixed(3)}</dd></div><div><dt>{zh ? "收益率" : "Return"}</dt><dd>{pct(result.metrics.annualizedReturn)}</dd></div><div><dt>{zh ? "最大回撤" : "Max drawdown"}</dt><dd>{pct(result.metrics.maximumDrawdown)}</dd></div><div><dt>{zh ? "单边换手" : "One-way turnover"}</dt><dd>{pct(result.turnover)}</dd></div></dl><div className="weight-changes">{result.holdings.filter((holding) => Math.abs(holding.proposedWeight - holding.currentWeight) > 0.0001).map((holding) => <span key={holding.ticker}><b>{holding.ticker}</b>{pct(holding.currentWeight)} → {pct(holding.proposedWeight)}</span>)}</div></section>)}<footer><span>{candidate.tickerReplacements === 0 ? (zh ? "不更换 Ticker" : "No ticker replacement") : (zh ? `最少更换共 ${candidate.tickerReplacements} 支` : `${candidate.tickerReplacements} minimum replacements`)}</span>{viewIsCurrent && user.role === "execution_team" && <button className="primary-button compact" onClick={() => selectOptimization(candidate.key)} disabled={busy}>{zh ? "接受并提交审批" : "Accept and submit"}</button>}</footer></article>)}</div>}
      </section>}
      {displayStep === "portfolio_approval" && portfolioApprovalContext && <section className="annual-data-panel portfolio-approval-panel">
        <header><div><span className="section-label">{zh ? "组合审批" : "Portfolio approval"}</span><h3>{zh ? `拟投资组合 v${portfolioApprovalContext.portfolio.version}` : `Proposed portfolio v${portfolioApprovalContext.portfolio.version}`}</h3></div><strong className="result-pass">{zh ? "回测通过" : "BACKTEST PASSED"}</strong></header>
        <div className="approval-summary"><span>{zh ? "回测区间" : "Backtest period"}<strong>{portfolioApprovalContext.portfolio.start_date.slice(0, 10)} – {portfolioApprovalContext.portfolio.end_date.slice(0, 10)}</strong></span><span>{zh ? "股票数量" : "Holdings"}<strong>{portfolioApprovalContext.portfolio.holdings.length}</strong></span><span>{zh ? "通过 Sleeve" : "Passing sleeves"}<strong>{portfolioApprovalContext.portfolio.metrics.sleeves.filter((item) => item.hardPass).length} / 3</strong></span></div>
        <div className="table-wrap"><table><thead><tr><th>Sleeve</th><th>{zh ? "年化收益" : "Return"}</th><th>Beta</th><th>{zh ? "最大回撤" : "Max drawdown"}</th><th>{zh ? "结果" : "Result"}</th></tr></thead><tbody>{portfolioApprovalContext.portfolio.metrics.sleeves.map((metric) => <tr key={metric.sleeve}><td><strong>{sleeveLabels[metric.sleeve]}</strong></td><td>{pct(metric.annualizedReturn)}</td><td>{metric.beta.toFixed(3)}</td><td>{pct(metric.maximumDrawdown)}</td><td><strong className={metric.hardPass ? "result-pass" : "result-fail"}>{metric.hardPass ? (zh ? "通过" : "Pass") : (zh ? "未通过" : "Fail")}</strong></td></tr>)}</tbody></table></div>
        {viewIsCurrent && user.role === "execution_team" ? <div className="approval-actions">{approvalRound ? <strong className="pending-note">{zh ? "等待委员会表决" : "Waiting for committee vote"}</strong> : <button className="primary-button compact" onClick={submitPortfolioApproval} disabled={busy}>{zh ? "提交委员会表决" : "Submit for committee vote"}</button>}</div> : viewIsCurrent && user.role === "decision_committee" ? <div className="approval-actions">{approvalRound ? <><button className="secondary-button" onClick={() => vote("reject")} disabled={busy}>{zh ? "不同意" : "Reject"}</button><button className="primary-button compact" onClick={() => vote("approve")} disabled={busy}>{zh ? "同意并批准" : "Approve"}</button></> : <strong className="pending-note">{zh ? "等待执行小组提交" : "Waiting for execution-team submission"}</strong>}</div> : <p className="readonly-note">{zh ? "只读：已完成步骤不提供业务审批操作。" : "Read only: completed steps do not expose approval actions."}</p>}
      </section>}
      {displayStep === "implementation" && implementationContext && <section className="annual-data-panel implementation-panel">
        <header><div><span className="section-label">{zh ? "组合实施" : "Portfolio implementation"}</span><h3>{zh ? `已批准组合 v${implementationContext.approvedPortfolio.version}` : `Approved portfolio v${implementationContext.approvedPortfolio.version}`}</h3></div><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: implementationContext.approvedPortfolio.currency, maximumFractionDigits: 0 }).format(implementationContext.approvedPortfolio.principal)}</strong></header>
        <div className="implementation-summary"><span>{zh ? "股票订单" : "Equity orders"}<strong>{implementationContext.orders.length}</strong></span><span>{zh ? "计划股票市值" : "Planned equity value"}<strong>{new Intl.NumberFormat(locale, { style: "currency", currency: implementationContext.approvedPortfolio.currency, maximumFractionDigits: 0 }).format(implementationContext.orders.reduce((sum, order) => sum + order.targetValue, 0))}</strong></span><span>{zh ? "控制" : "Control"}<strong>{zh ? "一人提交，一人复核" : "Maker-checker"}</strong></span></div>
        <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>Sleeve</th><th>{zh ? "方向" : "Side"}</th><th>{zh ? "组合权重" : "Portfolio weight"}</th><th>{zh ? "目标市值" : "Target value"}</th></tr></thead><tbody>{implementationContext.orders.map((order) => <tr key={`${order.market}-${order.ticker}`}><td><strong>{order.ticker}</strong><small>{order.market}</small></td><td>{sleeveLabels[order.sleeve]}</td><td>{zh ? "买入" : "Buy"}</td><td>{pct(order.portfolioWeight)}</td><td>{new Intl.NumberFormat(locale, { style: "currency", currency: order.currency, maximumFractionDigits: 0 }).format(order.targetValue)}</td></tr>)}</tbody></table></div>
        {viewIsCurrent && user.role === "execution_team" ? <div className="approval-actions">{!implementationContext.executionAction ? <button className="primary-button compact" onClick={submitImplementation} disabled={busy}>{zh ? "提交交易计划复核" : "Submit trade plan"}</button> : implementationContext.executionAction.status === "pending_review" && implementationContext.executionAction.submitted_by === user.id ? <strong className="pending-note">{zh ? "已提交，必须由另一名执行人员复核" : "Submitted; a different execution user must review"}</strong> : implementationContext.executionAction.status === "pending_review" ? <><button className="secondary-button" onClick={() => reviewImplementation("reject")} disabled={busy}>{zh ? "退回" : "Reject"}</button><button className="primary-button compact" onClick={() => reviewImplementation("approve")} disabled={busy}>{zh ? "复核通过" : "Approve review"}</button></> : <strong>{implementationContext.executionAction.status}</strong>}</div> : <p className="readonly-note">{zh ? "只读：交易计划由执行小组双人控制。" : "Read only: the execution team uses maker-checker control."}</p>}
      </section>}
      {displayStep === "monitoring" && <MonitoringPanel locale={locale} user={user} workflow={workflow} onWorkflowChanged={load} readOnly={!viewIsCurrent} />}
      {displayStep === "non_equity_nav" && <NonEquityNavPanel locale={locale} user={user} workflow={workflow} onWorkflowChanged={load} readOnly={!viewIsCurrent} />}
      {displayStep === "reporting" && <ReportPanel locale={locale} user={user} workflow={workflow} onWorkflowChanged={load} readOnly={!viewIsCurrent} />}
    </>}
  </section>;
}

function WorkflowModulePage({ locale, user, module }: { locale: Locale; user: User; module: "monitoring" | "reports" }) {
  const zh = locale === "zh-CN";
  const [workflow, setWorkflow] = useState<AnnualWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      const result = await api<{ workflow: AnnualWorkflow | null }>("/api/workflows/annual/active");
      setWorkflow(result.workflow);
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  if (loading) return <section className="placeholder"><p>{zh ? "正在读取业务数据" : "Loading business data"}</p></section>;
  if (error) return <section className="placeholder"><p>{zh ? `读取失败：${error}` : `Unable to load: ${error}`}</p></section>;
  if (!workflow) return <section className="placeholder"><p>{zh ? "尚未启动年度流程。" : "The annual workflow has not started."}</p></section>;
  return module === "monitoring"
    ? <MonitoringPanel locale={locale} user={user} workflow={workflow} onWorkflowChanged={load} />
    : <ReportPanel locale={locale} user={user} workflow={workflow} onWorkflowChanged={load} />;
}

function ApprovedPortfolioPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const [context, setContext] = useState<PortfolioApprovalContext | null>(null);
  const [principal, setPrincipal] = useState<PortfolioRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const [active, portfolio] = await Promise.all([
          api<{ workflow: AnnualWorkflow | null }>("/api/workflows/annual/active"),
          api<{ portfolio: PortfolioRecord | null }>("/api/portfolio/current"),
        ]);
        setPrincipal(portfolio.portfolio);
        if (!active.workflow) throw new Error(zh ? "尚未启动年度流程。" : "The annual workflow has not started.");
        setContext(await api<PortfolioApprovalContext>(`/api/workflows/${active.workflow.id}/portfolio-approval/context`));
      } catch (reason) { setError((reason as Error).message); }
      finally { setLoading(false); }
    })();
  }, [zh]);
  if (loading) return <section className="placeholder"><p>{zh ? "正在读取已批准组合" : "Loading approved portfolio"}</p></section>;
  if (!context) return <section className="placeholder"><h2>{zh ? "暂无已批准组合" : "No approved portfolio"}</h2><p>{error}</p></section>;
  const sleeveNames = { us: zh ? "美股" : "U.S. equities", developedNonUs: zh ? "发达市场非美股（日股）" : "Developed ex-U.S. (Japan)", emerging: zh ? "新兴市场（港股及 A 股）" : "Emerging (Hong Kong & China A)" };
  const marketNames = { US: zh ? "美国" : "United States", JP: zh ? "日本" : "Japan", HK: zh ? "香港" : "Hong Kong", CN_A: zh ? "中国 A 股" : "China A" };
  const pct = (value: string | number) => `${(Number(value) * 100).toFixed(1)}%`;
  const money = principal?.initial_principal == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: principal.base_currency, maximumFractionDigits: 0 }).format(Number(principal.initial_principal));
  const equityTargetTotal = context.portfolio.targets.equityTargets?.reduce((sum, item) => sum + Number(item.weight), 0) ?? 1;
  return <section className="approved-portfolio-page">
    <header className="page-heading"><div><span className="section-label">{zh ? "当前生效" : "Currently effective"}</span><h2>{zh ? `已批准投资组合 v${context.portfolio.version}` : `Approved portfolio v${context.portfolio.version}`}</h2><p>{zh ? `回测期间 ${context.portfolio.start_date.slice(0, 10)} 至 ${context.portfolio.end_date.slice(0, 10)}` : `Backtest period ${context.portfolio.start_date.slice(0, 10)} to ${context.portfolio.end_date.slice(0, 10)}`}</p></div><div className="portfolio-principal"><span>{zh ? "组合本金" : "Principal"}</span><strong>{money}</strong></div></header>
    <div className="approved-sleeves">{(["us", "developedNonUs", "emerging"] as const).map((sleeve) => {
      const target = context.portfolio.targets.equityTargets?.find((item) => item.key === sleeve);
      const holdings = context.portfolio.holdings.filter((holding) => holding.sleeve === sleeve);
      return <section key={sleeve} className="approved-sleeve"><header><div><span className="section-label">Sleeve</span><h3>{sleeveNames[sleeve]}</h3></div>{target && <div className="sleeve-target-facts"><span>{zh ? "股票内 / 组合权重" : "Equity / portfolio weight"}<strong>{pct(target.weight / equityTargetTotal)} / {pct(target.weight)}</strong></span><span>{zh ? "目标收益" : "Target return"}<strong>{pct(target.targetReturn)}</strong></span><span>Beta<strong>{target.targetBeta.toFixed(2)}</strong></span></div>}</header><div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "市场" : "Market"}</th><th>{zh ? "风格" : "Style"}</th><th>{zh ? "Sleeve 内权重" : "Weight in sleeve"}</th></tr></thead><tbody>{holdings.map((holding) => <tr key={`${holding.exchange_code}-${holding.ticker}`}><td><strong>{holding.ticker}</strong><small>{holding.exchange_code}</small></td><td>{marketNames[holding.market]}</td><td>{holding.style === "growth" ? (zh ? "成长" : "Growth") : (zh ? "价值" : "Value")}</td><td><strong>{pct(holding.weight)}</strong></td></tr>)}</tbody></table></div></section>;
    })}</div>
  </section>;
}

function Workspace({ user, locale, onLocale, onLogout }: { user: User; locale: Locale; onLocale: (locale: Locale) => void; onLogout: () => void }) {
  const text = copy[locale]; const zh = locale === "zh-CN"; const [open, setOpen] = useState(false); const [page, setPage] = useState<Page>("overview");
  const [proposalDirty, setProposalDirty] = useState(false);
  const leaveDraft = () => !proposalDirty || window.confirm(zh ? "拟持仓尚未保存，离开会放弃草稿。确定离开？" : "Unsaved proposed holdings will be discarded. Leave this page?");
  const logout = () => { if (leaveDraft()) onLogout(); };
  const [notificationOpen, setNotificationOpen] = useState(false); const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const loadNotifications = async () => { const result = await api<{ notifications: UserNotification[] }>("/api/notifications"); setNotifications(result.notifications); return result.notifications; };
  useEffect(() => { void loadNotifications(); }, []);
  async function openNotifications() {
    const next = !notificationOpen; setNotificationOpen(next);
    if (!next) return;
    const loaded = await loadNotifications();
    const unread = loaded.filter((item) => !item.read_at);
    await Promise.all(unread.map((item) => api(`/api/notifications/${item.id}/read`, { method: "POST", body: "{}" })));
    if (unread.length) await loadNotifications();
  }
  const adminLinks: { id: Page; label: string; icon: typeof Users }[] = user.role === "system_admin" ? [{ id: "users", label: text.users, icon: Users }, { id: "securities", label: zh ? "股票库" : "Securities", icon: Database }, { id: "parameters", label: text.parameters, icon: Settings }, { id: "sources", label: text.sources, icon: CloudDownload }, { id: "connections", label: text.connections, icon: KeyRound }, { id: "audit", label: text.audit, icon: ShieldCheck }] : [];
  const links = [{ id: "overview" as Page, label: text.overview, icon: Gauge }, { id: "annual" as Page, label: text.annual, icon: ClipboardCheck }, { id: "portfolio" as Page, label: text.portfolio, icon: Database }, { id: "monitoring" as Page, label: text.monitoring, icon: CheckCircle2 }, { id: "reports" as Page, label: text.reports, icon: FileBarChart }, ...adminLinks];
  const pageTitle = links.find((item) => item.id === page)?.label ?? text.welcome;
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="sidebar-head">
          <Brand inverted />
          <button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <nav>
          {links.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "nav-link active" : "nav-link"} onClick={() => { if (id !== page && !leaveDraft()) return; setPage(id); setOpen(false); }}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="nav-link logout" onClick={logout}><LogOut size={19} />{text.logout}</button>
      </aside>
      {open && <button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <main className="workspace">
        <header className="workspace-header">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div><span className="header-kicker">Puyan Capital</span><h1>{pageTitle}</h1></div>
          <div className="header-actions">
            <LanguageSwitch locale={locale} onChange={onLocale} />
            <div className="notification-wrap"><button className="icon-button" aria-label={zh ? "通知" : "Notifications"} onClick={openNotifications}><Bell />{notifications.some((item) => !item.read_at) && <i className="notification-dot" />}</button>{notificationOpen && <div className="notification-panel"><header><strong>{zh ? "通知" : "Notifications"}</strong><button className="icon-button" onClick={() => setNotificationOpen(false)} aria-label={zh ? "关闭通知" : "Close notifications"}><X size={17} /></button></header>{notifications.length === 0 ? <p>{zh ? "暂无通知" : "No notifications"}</p> : notifications.slice(0, 8).map((item) => <article key={item.id}><strong>{item.title_key === "rebalance.completed.title" ? (zh ? "再平衡已完成" : "Rebalancing completed") : (zh ? "再平衡逾期" : "Rebalancing overdue")}</strong><span>{item.body_key === "rebalance.completed.body" ? (zh ? "最新持仓已经回到 corridor 范围内。" : "The latest positions are within corridor.") : (zh ? `最新持仓仍有 ${item.context.breachedGroups?.length ?? 0} 个风格组越界。` : `${item.context.breachedGroups?.length ?? 0} style groups remain outside corridor.`)}</span><small>{item.context.verificationDate ?? item.created_at.slice(0, 10)}</small></article>)}</div>}</div>
            <button className="icon-button mobile-logout" onClick={logout} aria-label={text.logout} title={text.logout}><LogOut size={19} /></button>
            <div className="user-chip"><strong>{user.displayName}</strong><span>{text.roles[user.role]}</span></div>
          </div>
        </header>
        <div className="workspace-content">
          {page === "overview" ? <Overview locale={locale} user={user} /> : page === "annual" ? <AnnualPage locale={locale} user={user} onDirtyChange={setProposalDirty} /> : page === "portfolio" ? <ApprovedPortfolioPage locale={locale} /> : page === "monitoring" ? <WorkflowModulePage locale={locale} user={user} module="monitoring" /> : page === "reports" ? <WorkflowModulePage locale={locale} user={user} module="reports" /> : page === "users" ? <UsersPage locale={locale} /> : page === "securities" ? <SecuritiesPage zh={zh} request={api} /> : page === "parameters" ? <ParametersPage locale={locale} /> : page === "sources" ? <><SourcesPage locale={locale} /><SourceFileRegistry locale={locale} /></> : page === "connections" ? <ExternalDataConnectionsPage locale={locale} /> : page === "audit" ? <AuditPage locale={locale} /> : <section className="placeholder"><h2>{pageTitle}</h2><p>{text.placeholderPage}</p></section>}
        </div>
      </main>
    </div>
  );
}

export function App() {
  const savedLocale = localStorage.getItem("isater-locale");
  const [locale, setLocale] = useState<Locale>(savedLocale === "en" ? "en" : "zh-CN");
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [activeRequests, setActiveRequests] = useState(0);
  useEffect(() => { api<{ user: User }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => { const listener = (event: Event) => setActiveRequests(Number((event as CustomEvent<number>).detail ?? 0)); window.addEventListener("isater:api-activity", listener); return () => window.removeEventListener("isater:api-activity", listener); }, []);
  const changeLocale = useMemo(() => (next: Locale) => { localStorage.setItem("isater-locale", next); document.documentElement.lang = next; setLocale(next); }, []);
  async function logout() { await api("/api/auth/logout", { method: "POST" }).catch(() => undefined); setUser(null); }
  async function passwordChanged() { const result = await api<{ user: User }>("/api/auth/me"); setUser(result.user); }
  const content = loading ? <div className="loading-screen"><div className="loading-mark">I</div></div>
    : !user ? <Login locale={locale} onLocale={changeLocale} onAuthenticated={setUser} />
      : user.mustChangePassword ? <ChangePassword user={user} locale={locale} onLocale={changeLocale} onChanged={passwordChanged} />
        : <Workspace user={user} locale={locale} onLocale={changeLocale} onLogout={logout} />;
  return <>{content}{!loading && activeRequests > 0 && <div className="global-loading-overlay" role="status" aria-live="polite" aria-busy="true"><div><LoaderCircle size={34} /><strong>{locale === "zh-CN" ? "正在安全处理" : "Processing securely"}</strong><span>{locale === "zh-CN" ? "请等待完成，不要重复提交或关闭页面。" : "Please wait; do not resubmit or close this page."}</span></div></div>}</>;
}
