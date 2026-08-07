export interface TargetReturnInput {
  operatingCostRate: number;
  expectedCpiRate: number;
  scenarioAdjustmentRate: number;
}

export function annualTargetReturn(input: TargetReturnInput): number {
  const values = [input.operatingCostRate, input.expectedCpiRate, input.scenarioAdjustmentRate];
  if (!values.every(Number.isFinite)) throw new Error("Target-return inputs must be finite numbers");
  return values.reduce((sum, value) => sum + value, 0);
}

export type SleeveKind = "equity" | "bond" | "alternative" | "cash";

export interface SleeveReference {
  key: string;
  kind: SleeveKind;
  weight: number;
  referenceReturn: number;
}

export interface SleeveTarget extends SleeveReference {
  baselineContribution: number;
  targetContribution: number;
  targetReturn: number;
}

export interface SleeveDecomposition {
  targetFloor: number;
  baselineReturn: number;
  shortfallAllocatedToEquity: number;
  expectedBuffer: number;
  allocatedReturn: number;
  reconciliationDifference: number;
  sleeves: SleeveTarget[];
}

export function decomposeTargetFloor(targetFloor: number, sleeves: SleeveReference[]): SleeveDecomposition {
  if (!Number.isFinite(targetFloor)) throw new Error("Target floor must be finite");
  if (!sleeves.length) throw new Error("At least one sleeve is required");
  if (sleeves.some((sleeve) => !Number.isFinite(sleeve.weight) || sleeve.weight <= 0 || !Number.isFinite(sleeve.referenceReturn))) {
    throw new Error("Sleeve weights and reference returns must be valid");
  }
  const totalWeight = sleeves.reduce((sum, sleeve) => sum + sleeve.weight, 0);
  if (Math.abs(totalWeight - 1) > 1e-8) throw new Error("Sleeve weights must sum to 1");

  const equityWeight = sleeves.filter((sleeve) => sleeve.kind === "equity").reduce((sum, sleeve) => sum + sleeve.weight, 0);
  if (equityWeight <= 0) throw new Error("At least one equity sleeve is required");

  const baselineReturn = sleeves.reduce((sum, sleeve) => sum + sleeve.weight * sleeve.referenceReturn, 0);
  const shortfall = Math.max(0, targetFloor - baselineReturn);
  const expectedBuffer = Math.max(0, baselineReturn - targetFloor);
  const results = sleeves.map((sleeve): SleeveTarget => {
    const baselineContribution = sleeve.weight * sleeve.referenceReturn;
    const additionalContribution = sleeve.kind === "equity" ? shortfall * sleeve.weight / equityWeight : 0;
    const targetContribution = baselineContribution + additionalContribution;
    return {
      ...sleeve,
      baselineContribution,
      targetContribution,
      targetReturn: targetContribution / sleeve.weight,
    };
  });
  const allocatedReturn = results.reduce((sum, sleeve) => sum + sleeve.targetContribution, 0);
  return {
    targetFloor,
    baselineReturn,
    shortfallAllocatedToEquity: shortfall,
    expectedBuffer,
    allocatedReturn,
    reconciliationDifference: allocatedReturn - Math.max(targetFloor, baselineReturn),
    sleeves: results,
  };
}

export interface CapmPolicy {
  minimumPositiveExcessReturn: number;
  minimumPositiveMarketRiskPremium: number;
  reasonableBetaFloor: number;
  betaCap: number;
}

export const defaultCapmPolicy: CapmPolicy = {
  minimumPositiveExcessReturn: 0.005,
  minimumPositiveMarketRiskPremium: 0.005,
  reasonableBetaFloor: 0.5,
  betaCap: 2.5,
};

export interface CapmTarget {
  beta: number;
  betaControlActive: boolean;
  effectiveTargetReturn: number;
  effectiveMarketReturn: number;
  riskFreeRate: number;
  adjustedForNonPositiveExcessReturn: boolean;
  adjustedForLowMarketRiskPremium: boolean;
}

export function capmTargetBeta(
  targetReturn: number,
  expectedMarketReturn: number,
  riskFreeRate: number,
  policy: CapmPolicy = defaultCapmPolicy,
): CapmTarget {
  if (![targetReturn, expectedMarketReturn, riskFreeRate].every(Number.isFinite)) {
    throw new Error("CAPM inputs must be finite");
  }
  const adjustedForNonPositiveExcessReturn = targetReturn - riskFreeRate <= 0;
  const adjustedForLowMarketRiskPremium = expectedMarketReturn - riskFreeRate < policy.minimumPositiveMarketRiskPremium;
  const effectiveTargetReturn = adjustedForNonPositiveExcessReturn
    ? riskFreeRate + policy.minimumPositiveExcessReturn
    : targetReturn;
  const effectiveMarketReturn = adjustedForLowMarketRiskPremium
    ? riskFreeRate + policy.minimumPositiveMarketRiskPremium
    : expectedMarketReturn;
  const beta = (effectiveTargetReturn - riskFreeRate) / (effectiveMarketReturn - riskFreeRate);
  if (beta < 0 || beta > policy.betaCap) throw new Error("CAPM beta is outside the approved policy range");
  return {
    beta,
    betaControlActive: beta >= policy.reasonableBetaFloor,
    effectiveTargetReturn,
    effectiveMarketReturn,
    riskFreeRate,
    adjustedForNonPositiveExcessReturn,
    adjustedForLowMarketRiskPremium,
  };
}

export interface BacktestTolerance {
  betaRelative: number;
  returnShortfall: number;
  returnExcessReview: number;
  drawdownExcess: number;
}

export const defaultBacktestTolerance: BacktestTolerance = {
  betaRelative: 0.05,
  returnShortfall: 0.05,
  returnExcessReview: 0.5,
  drawdownExcess: 0.1,
};

export interface ControlStatus {
  hardPass: boolean;
  review: boolean;
  status: "pass" | "review" | "fail" | "no_data";
}

export function returnControl(
  actual: number | null,
  target: number | null,
  tolerance: BacktestTolerance = defaultBacktestTolerance,
): ControlStatus & { floor: number | null; reviewCeiling: number | null } {
  if (actual === null || target === null || !Number.isFinite(actual) || !Number.isFinite(target)) {
    return { hardPass: false, review: false, status: "no_data", floor: null, reviewCeiling: null };
  }
  const magnitude = Math.max(Math.abs(target), 1e-12);
  const floor = target - magnitude * tolerance.returnShortfall;
  const reviewCeiling = target + magnitude * tolerance.returnExcessReview;
  if (actual < floor - 1e-12) return { hardPass: false, review: false, status: "fail", floor, reviewCeiling };
  if (actual > reviewCeiling + 1e-12) return { hardPass: true, review: true, status: "review", floor, reviewCeiling };
  return { hardPass: true, review: false, status: "pass", floor, reviewCeiling };
}

export function drawdownControl(
  actualDrawdown: number | null,
  policyLimit: number | null,
  benchmarkDrawdown: number | null,
  tolerance: BacktestTolerance = defaultBacktestTolerance,
): ControlStatus & { effectiveLimit: number | null } {
  if (actualDrawdown === null || policyLimit === null || !Number.isFinite(actualDrawdown) || !Number.isFinite(policyLimit)) {
    return { hardPass: false, review: false, status: "no_data", effectiveLimit: null };
  }
  const policyMagnitude = Math.abs(policyLimit) * (1 + tolerance.drawdownExcess);
  const benchmarkMagnitude = benchmarkDrawdown !== null && Number.isFinite(benchmarkDrawdown)
    ? Math.abs(benchmarkDrawdown) * (1 + tolerance.drawdownExcess)
    : 0;
  const effectiveLimit = Math.max(policyMagnitude, benchmarkMagnitude);
  const hardPass = Math.abs(actualDrawdown) <= effectiveLimit + 1e-12;
  return { hardPass, review: false, status: hardPass ? "pass" : "fail", effectiveLimit };
}

export function betaControl(
  actualBeta: number | null,
  target: CapmTarget | null,
  returnPass: boolean,
  drawdownPass: boolean,
  tolerance: BacktestTolerance = defaultBacktestTolerance,
): ControlStatus {
  if (actualBeta === null || target === null || !Number.isFinite(actualBeta)) {
    return { hardPass: false, review: false, status: "no_data" };
  }
  if (!target.betaControlActive) {
    return returnPass && drawdownPass
      ? { hardPass: true, review: true, status: "review" }
      : { hardPass: false, review: false, status: "fail" };
  }
  const relativeTolerance = Math.abs(target.beta) * tolerance.betaRelative;
  if (actualBeta > target.beta + relativeTolerance + 1e-12) {
    return { hardPass: false, review: false, status: "fail" };
  }
  if (actualBeta < target.beta - relativeTolerance - 1e-12) {
    return returnPass && drawdownPass
      ? { hardPass: true, review: true, status: "review" }
      : { hardPass: false, review: false, status: "fail" };
  }
  return { hardPass: true, review: false, status: "pass" };
}
