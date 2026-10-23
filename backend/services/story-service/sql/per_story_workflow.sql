-- Every story of an organization project has its own workflow (same as alembic revision b8d4f0e2c6a3).
-- Only for databases that do not use Alembic.
BEGIN;
ALTER TABLE project_workflow_stages ADD COLUMN story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE;
CREATE INDEX ix_project_workflow_stages_story_id ON project_workflow_stages (story_id);
UPDATE project_workflow_stages w SET story_id = (
    SELECT s.story_id FROM project_stage_submissions s
    WHERE s.project_id = w.project_id AND s.stage = w.stage AND s.story_id IS NOT NULL
    ORDER BY s.id DESC LIMIT 1);
UPDATE project_workflow_stages w SET story_id = ws.story_id
    FROM organization_project_workspaces ws WHERE w.story_id IS NULL AND ws.project_id = w.project_id;
DELETE FROM project_workflow_stages WHERE story_id IS NULL;
ALTER TABLE project_workflow_stages DROP CONSTRAINT uq_project_workflow_stage;
ALTER TABLE project_workflow_stages ADD CONSTRAINT uq_project_story_workflow_stage UNIQUE (project_id, story_id, stage);
UPDATE alembic_version SET version_num = 'b8d4f0e2c6a3' WHERE version_num = 'a7c3e9d1b5f2';
COMMIT;
