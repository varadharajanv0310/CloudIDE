CREATE TABLE users (
  id          serial PRIMARY KEY,
  username    text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          serial PRIMARY KEY,
  owner_id    int NOT NULL REFERENCES users(id),
  name        text NOT NULL,
  language    text NOT NULL CHECK (language IN ('python', 'node')),
  entry_file  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

CREATE TABLE files (
  id          serial PRIMARY KEY,
  project_id  int NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        text NOT NULL,
  content     text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);

CREATE TABLE runs (
  id             serial PRIMARY KEY,
  project_id     int NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'completed', 'timeout', 'error', 'killed')),
  exit_code      int,
  duration_ms    int,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE INDEX files_project_idx ON files(project_id);
CREATE INDEX runs_project_idx ON runs(project_id);
