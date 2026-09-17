CREATE TABLE credaryn_status_history (
  issuer_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED')),
  reason TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (issuer_id, key_id, updated_at)
);

CREATE INDEX credaryn_status_current_lookup
  ON credaryn_status_history (issuer_id, key_id, updated_at DESC);
