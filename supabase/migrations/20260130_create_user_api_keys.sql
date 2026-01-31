-- User API Keys Table
-- Stores encrypted API keys for third-party services (Keepa, eBay, ElevenLabs, etc.)
-- One key per service per user (enforced by UNIQUE constraint)

CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  label TEXT,
  is_valid BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service)
);

-- Enable Row Level Security
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage their own API keys
CREATE POLICY "Users can manage their own API keys"
  ON user_api_keys FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_service ON user_api_keys(user_id, service);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);

-- Comments for documentation
COMMENT ON TABLE user_api_keys IS 'Stores encrypted API keys for third-party services per user';
COMMENT ON COLUMN user_api_keys.service IS 'Service identifier: keepa, ebay, elevenlabs, etc.';
COMMENT ON COLUMN user_api_keys.api_key_encrypted IS 'AES-256-GCM encrypted API key (format: iv:encrypted_data)';
COMMENT ON COLUMN user_api_keys.label IS 'User-friendly label for the key';
COMMENT ON COLUMN user_api_keys.is_valid IS 'Whether the key has been validated and is currently working';
COMMENT ON COLUMN user_api_keys.last_used_at IS 'Last time this key was used in an API call';
