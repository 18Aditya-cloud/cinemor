-- Client portal and display names (same as alembic revision d7e1f3a5c9b2). Only for databases that do not use Alembic.
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'client';
BEGIN;
ALTER TABLE users ADD COLUMN display_name VARCHAR(120);
CREATE TABLE client_invitations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_client_invitations_organization_id ON client_invitations (organization_id);
CREATE INDEX ix_client_invitations_client_id ON client_invitations (client_id);
CREATE TABLE client_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_client_account_user_client UNIQUE (user_id, client_id)
);
CREATE INDEX ix_client_accounts_user_id ON client_accounts (user_id);
CREATE INDEX ix_client_accounts_client_id ON client_accounts (client_id);
CREATE TABLE client_comments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_side VARCHAR(20) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_client_comments_project_id ON client_comments (project_id);
CREATE TABLE client_story_decisions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    decision VARCHAR(30) NOT NULL,
    comment TEXT,
    decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_client_story_decision UNIQUE (project_id, story_id)
);
CREATE INDEX ix_client_story_decisions_project_id ON client_story_decisions (project_id);
UPDATE alembic_version SET version_num = 'd7e1f3a5c9b2' WHERE version_num = 'c5e9a3f7d2b1';
COMMIT;
