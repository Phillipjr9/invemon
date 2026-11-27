-- Planning only. Targets/contribution intentions never post or reserve money.
CREATE TABLE IF NOT EXISTS customer_goals (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 target_cents numeric(30,0) NOT NULL CHECK(target_cents>0),
 monthly_cents numeric(30,0) NOT NULL CHECK(monthly_cents>=0),
 target_date date NOT NULL,
 archived boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_goals_owner ON customer_goals(user_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS customer_goal_events (
 id uuid PRIMARY KEY,
 goal_id uuid NOT NULL REFERENCES customer_goals(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 revision integer NOT NULL,
 action text NOT NULL CHECK(action IN ('created','updated','archived','restored')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(goal_id,revision)
);
DROP TRIGGER IF EXISTS customer_goal_events_immutable ON customer_goal_events;
CREATE TRIGGER customer_goal_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON customer_goal_events FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
REVOKE ALL ON customer_goals,customer_goal_events FROM PUBLIC;
