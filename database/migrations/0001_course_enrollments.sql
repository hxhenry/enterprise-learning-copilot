CREATE TABLE enrollment_action_claims (
  action_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE course_enrollments (
  action_id TEXT PRIMARY KEY
    REFERENCES enrollment_action_claims (action_id),
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolled',
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT course_enrollments_status_check
    CHECK (status = 'enrolled'),
  CONSTRAINT course_enrollments_user_course_key
    UNIQUE (user_id, course_id)
);

CREATE INDEX course_enrollments_user_approved_at_idx
  ON course_enrollments (user_id, approved_at, action_id);
