CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_norm text NOT NULL UNIQUE CHECK (email_norm = lower(email_norm)),
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'reader')),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  author_id uuid NOT NULL REFERENCES users(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 240),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 100000),
  status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_tenant_slug_key UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, id),
  CHECK ((status = 'draft' AND published_at IS NULL) OR (status = 'published' AND published_at IS NOT NULL))
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (char_length(token_hash) = 64),
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX memberships_user_idx ON memberships(user_id);
CREATE INDEX posts_public_idx ON posts(tenant_id, published_at DESC, id DESC) WHERE status = 'published';
