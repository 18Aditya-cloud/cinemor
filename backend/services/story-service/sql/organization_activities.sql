-- The organization activity feed (same as alembic revision a7c3e9d1b5f2).
-- Only for databases that do not use Alembic.
BEGIN;
CREATE TABLE organization_activities (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    actor_role VARCHAR(30),
    kind VARCHAR(30) NOT NULL,
    action VARCHAR(40) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(40),
    entity_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_organization_activities_organization_id ON organization_activities (organization_id);
CREATE INDEX ix_organization_activities_kind ON organization_activities (kind);
CREATE INDEX ix_organization_activities_created_at ON organization_activities (created_at);
UPDATE alembic_version SET version_num = 'a7c3e9d1b5f2' WHERE version_num = 'f1a2b3c4d5e6';
COMMIT;
