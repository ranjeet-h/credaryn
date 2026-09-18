-- Credaryn document lifecycle status.
-- Document-scoped (issuer + document reference) and append-only: the table stores an immutable
-- history of status transitions and the current status is the latest row for a reference.
CREATE TABLE IF NOT EXISTS credaryn_status_history (
  issuer_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  key_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED')),
  reason TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (issuer_id, document_id, updated_at)
);

CREATE INDEX IF NOT EXISTS credaryn_status_current_lookup
  ON credaryn_status_history (issuer_id, document_id, updated_at DESC);

-- Append-only enforcement: status history must never be updated or deleted in place.
CREATE OR REPLACE FUNCTION credaryn_status_history_append_only()
  RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credaryn_status_history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS credaryn_status_history_no_mutation ON credaryn_status_history;
CREATE TRIGGER credaryn_status_history_no_mutation
  BEFORE UPDATE OR DELETE ON credaryn_status_history
  FOR EACH ROW EXECUTE FUNCTION credaryn_status_history_append_only();
