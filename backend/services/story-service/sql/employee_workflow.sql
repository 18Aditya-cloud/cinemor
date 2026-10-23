BEGIN;

-- Running upgrade b92a7bf9e1ae -> e3f7a9c1d2b4

CREATE TABLE organization_project_workspaces (
    id SERIAL NOT NULL, 
    project_id INTEGER NOT NULL, 
    individual_project_id INTEGER NOT NULL, 
    owner_user_id INTEGER NOT NULL, 
    story_id INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
    FOREIGN KEY(individual_project_id) REFERENCES individual_projects (id) ON DELETE CASCADE, 
    FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(story_id) REFERENCES stories (id) ON DELETE SET NULL, 
    UNIQUE (individual_project_id)
);

CREATE UNIQUE INDEX ix_organization_project_workspaces_project_id ON organization_project_workspaces (project_id);

CREATE TABLE project_workflow_stages (
    id SERIAL NOT NULL, 
    project_id INTEGER NOT NULL, 
    stage VARCHAR(30) NOT NULL, 
    status VARCHAR(30) NOT NULL, 
    approved_by_user_id INTEGER, 
    approved_at TIMESTAMP WITH TIME ZONE, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
    FOREIGN KEY(approved_by_user_id) REFERENCES users (id) ON DELETE SET NULL, 
    CONSTRAINT uq_project_workflow_stage UNIQUE (project_id, stage)
);

CREATE INDEX ix_project_workflow_stages_project_id ON project_workflow_stages (project_id);

CREATE TABLE project_stage_submissions (
    id SERIAL NOT NULL, 
    project_id INTEGER NOT NULL, 
    stage VARCHAR(30) NOT NULL, 
    story_id INTEGER, 
    submitted_by_user_id INTEGER NOT NULL, 
    reviewer_user_id INTEGER NOT NULL, 
    note TEXT, 
    status VARCHAR(30) DEFAULT 'pending' NOT NULL, 
    review_comment TEXT, 
    reviewed_by_user_id INTEGER, 
    reviewed_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
    FOREIGN KEY(story_id) REFERENCES stories (id) ON DELETE SET NULL, 
    FOREIGN KEY(submitted_by_user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(reviewer_user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_project_stage_submissions_project_id ON project_stage_submissions (project_id);

CREATE INDEX ix_project_stage_submissions_stage ON project_stage_submissions (stage);

CREATE INDEX ix_project_stage_submissions_status ON project_stage_submissions (status);

CREATE INDEX ix_project_stage_submissions_submitted_by_user_id ON project_stage_submissions (submitted_by_user_id);

CREATE INDEX ix_project_stage_submissions_reviewer_user_id ON project_stage_submissions (reviewer_user_id);

CREATE TABLE employee_notifications (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    project_id INTEGER, 
    stage VARCHAR(30), 
    kind VARCHAR(40) NOT NULL, 
    message TEXT NOT NULL, 
    read_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX ix_employee_notifications_user_id ON employee_notifications (user_id);

CREATE INDEX ix_employee_notifications_created_at ON employee_notifications (created_at);

UPDATE alembic_version SET version_num='e3f7a9c1d2b4' WHERE alembic_version.version_num = 'b92a7bf9e1ae';

COMMIT;

