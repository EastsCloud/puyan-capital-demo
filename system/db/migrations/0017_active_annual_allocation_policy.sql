BEGIN;

INSERT INTO default_business_parameters (version, parameters, description)
SELECT 3,
       (parameters - 'scenarioBands' - 'allocationDefaults') || '{
         "annualAllocation": {
           "calibrationYears": 20,
           "minimumScenarioMonths": 18,
           "bullThresholdPct": 5,
           "bearThresholdPct": -3,
           "allocationStepPct": 5,
           "assetBoundsPct": {
             "bull": {
               "equity": {"min": 45, "max": 80}, "bond": {"min": 10, "max": 40},
               "alternative": {"min": 5, "max": 25}, "cash": {"min": 5, "max": 15}
             },
             "balanced": {
               "equity": {"min": 35, "max": 65}, "bond": {"min": 20, "max": 50},
               "alternative": {"min": 5, "max": 25}, "cash": {"min": 5, "max": 20}
             },
             "bear": {
               "equity": {"min": 20, "max": 50}, "bond": {"min": 30, "max": 60},
               "alternative": {"min": 5, "max": 25}, "cash": {"min": 10, "max": 30}
             }
           },
           "marketBoundsPct": {
             "us": {"min": 35, "max": 70}, "japan": {"min": 10, "max": 35},
             "chinaA": {"min": 10, "max": 35}, "hongKong": {"min": 5, "max": 25}
           },
           "riskAversion": {"bull": 0.2, "balanced": 0.45, "bear": 0.8}
         }
       }'::jsonb,
       'Replaces inactive scenario/allocation display values with the parameters actually consumed by the annual public-data allocation engine.'
  FROM default_business_parameters
 WHERE version = 2;

COMMIT;
