BEGIN;

INSERT INTO default_business_parameters (version, parameters, description)
SELECT 2,
       parameters || '{
         "targetReturn": {
           "operatingCostPct": 1.0,
           "bandsPct": {
             "bull": {"low": 7.0, "high": 12.0},
             "balanced": {"low": 4.0, "high": 8.0},
             "bear": {"low": 2.0, "high": 6.0}
           }
         }
       }'::jsonb,
       'Adds administrator-maintained target-return ranges and the operating-cost floor.'
  FROM default_business_parameters
 WHERE version = 1;

COMMIT;
