-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The cost of a reading with the user's own key: input and output tokens are priced apart,
-- and by model (Claude Opus, Sonnet or Haiku). Older rows keep only the total in `units`.
ALTER TABLE ai_usage ADD COLUMN model TEXT;
ALTER TABLE ai_usage ADD COLUMN input_tokens INTEGER;
ALTER TABLE ai_usage ADD COLUMN output_tokens INTEGER;

-- Each person's own use (Definições: the last 30 days with their key).
CREATE INDEX ai_usage_user ON ai_usage (user_id, date);
