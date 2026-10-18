BEGIN;
CREATE TABLE investment_archives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 portfolio_id uuid NOT NULL REFERENCES portfolios(id),
 workflow_case_id uuid UNIQUE REFERENCES workflow_cases(id) ON DELETE SET NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 kind text NOT NULL CHECK(kind IN ('annual','research')),
 business_year integer NOT NULL CHECK(business_year BETWEEN 2000 AND 2200),
 source_archive_id uuid REFERENCES investment_archives(id),
 configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'research' OR workflow_case_id IS NULL)
);
CREATE INDEX investment_archives_org ON investment_archives(organization_id,created_at DESC);
CREATE TABLE archive_selection (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 archive_id uuid NOT NULL REFERENCES investment_archives(id),
 selected_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO investment_archives(organization_id,portfolio_id,workflow_case_id,name,kind,business_year,created_by)
 SELECT w.organization_id,w.portfolio_id,w.id,p.name||' · '||w.business_year,'annual',w.business_year,w.created_by
 FROM workflow_cases w JOIN portfolios p ON p.id=w.portfolio_id WHERE w.workflow_type='annual_cycle';
UPDATE investment_archives a SET configuration=jsonb_build_object('parameterSnapshot',COALESCE((SELECT p.parameters FROM parameter_sets p WHERE p.organization_id=a.organization_id AND p.status='effective' LIMIT 1),(SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1)));
UPDATE investment_archives a SET configuration=configuration||jsonb_build_object('parameterSnapshotVersion',COALESCE((SELECT version FROM parameter_sets WHERE organization_id=a.organization_id AND status='effective' LIMIT 1),(SELECT version FROM default_business_parameters ORDER BY version DESC LIMIT 1)));
UPDATE investment_archives a SET configuration=configuration||jsonb_build_object('parameterSnapshotSource',CASE WHEN EXISTS(SELECT 1 FROM parameter_sets WHERE organization_id=a.organization_id AND status='effective') THEN 'organization' ELSE 'system_default' END,'parameterSnapshotEffectiveFrom',COALESCE((SELECT COALESCE(effective_from,created_at) FROM parameter_sets WHERE organization_id=a.organization_id AND status='effective' LIMIT 1),(SELECT created_at FROM default_business_parameters ORDER BY version DESC LIMIT 1)));
INSERT INTO archive_selection(organization_id,archive_id,selected_by)
 SELECT DISTINCT ON(a.organization_id) a.organization_id,a.id,a.created_by
 FROM investment_archives a JOIN workflow_cases w ON w.id=a.workflow_case_id
 ORDER BY a.organization_id,(w.status='active') DESC,w.business_year DESC,w.created_at DESC;
CREATE TABLE research_backtest_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),archive_id uuid NOT NULL REFERENCES investment_archives(id),
 archive_revision integer NOT NULL,requested_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
 input jsonb NOT NULL,result jsonb,error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 deadline_at timestamptz NOT NULL DEFAULT(now()+interval '150 seconds')
);
CREATE UNIQUE INDEX one_active_research_run ON research_backtest_runs((1)) WHERE status IN ('queued','running');
CREATE INDEX research_archive_history ON research_backtest_runs(archive_id,created_at DESC);
CREATE FUNCTION protect_research_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Research evidence is immutable'; END IF;
 IF OLD.status IN ('succeeded','failed') OR NEW.archive_id<>OLD.archive_id OR NEW.archive_revision<>OLD.archive_revision OR NEW.input<>OLD.input OR NEW.requested_by<>OLD.requested_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Research evidence is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER research_evidence_guard BEFORE UPDATE OR DELETE ON research_backtest_runs FOR EACH ROW EXECUTE FUNCTION protect_research_evidence();
COMMIT;
