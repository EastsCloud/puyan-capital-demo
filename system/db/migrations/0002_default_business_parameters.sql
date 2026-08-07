BEGIN;

CREATE TABLE default_business_parameters (
  version integer PRIMARY KEY CHECK (version > 0),
  parameters jsonb NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO default_business_parameters (version, parameters, description)
VALUES (
  1,
  '{
    "scenarioBands": {
      "bull": {"low": 5, "high": 12},
      "balanced": {"low": -2, "high": 2},
      "bear": {"low": -12, "high": -3}
    },
    "allocationDefaults": {
      "bull": {
        "assets": {"equity": 68, "bond": 16, "alternative": 11, "cash": 5},
        "regions": {"us": 60, "developed": 15, "emerging": 25}
      },
      "balanced": {
        "assets": {"equity": 55, "bond": 25, "alternative": 12, "cash": 8},
        "regions": {"us": 60, "developed": 15, "emerging": 25}
      },
      "bear": {
        "assets": {"equity": 35, "bond": 42, "alternative": 10, "cash": 13},
        "regions": {"us": 65, "developed": 15, "emerging": 20}
      }
    },
    "returnDrawdownRatio": {"low": 0.60, "high": 0.80},
    "backtest": {
      "betaRelativeTolerance": 0.05,
      "returnShortfallTolerance": 0.05,
      "returnExcessReviewTolerance": 0.50,
      "drawdownExcessTolerance": 0.10,
      "defaultMonths": 36,
      "defaultFrequency": "weekly"
    },
    "portfolioConstruction": {
      "maxSingleSecurityWeightPct": 35,
      "styleTickerMin": 2,
      "styleTickerMax": 5,
      "equityMarkets": ["US", "JP", "HK", "CN_A"]
    },
    "rebalance": {
      "checkFrequency": "monthly",
      "positionImportFrequency": "daily",
      "lowerRelativeDriftPct": -20,
      "upperRelativeDriftPct": 20,
      "completionTradingDays": 3
    },
    "executionTolerance": {
      "quantityRatio": 0.01,
      "valueRatio": 0.02,
      "weightPercentagePoints": 0.5
    },
    "riskFreeRatesPct": {"us": 4.5, "japan": 0.5, "hongKong": 4.2, "chinaA": 1.8},
    "committeeApproval": {"numerator": 2, "denominator": 3}
  }'::jsonb,
  'Initial isater defaults migrated from the approved Teresa business baseline. No Teresa test data is included.'
);

COMMIT;
