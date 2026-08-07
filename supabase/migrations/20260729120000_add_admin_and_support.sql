/*
# Migration: Set admin email and add support channel

## Changes
1. Add admin_email column to bot_config table for tracking the main admin
2. This migration will be used to identify milad201400@gmail.com as the system admin
*/

-- Add admin configuration to bot_config
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS admin_email text;

-- Create a function to check if a user is the system admin
CREATE OR REPLACE FUNCTION is_system_admin(user_email text)
RETURNS boolean AS $$
BEGIN
  RETURN user_email = 'milad201400@gmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update bot_config to set admin email for existing configs
UPDATE bot_config SET admin_email = 'milad201400@gmail.com' WHERE admin_email IS NULL;

-- Add index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_bot_config_admin_email ON bot_config(admin_email);

-- Add RLS policy to allow admin users to manage all bot_users
DROP POLICY IF EXISTS "admin_manage_all_botusers" ON bot_users;
CREATE POLICY "admin_manage_all_botusers" ON bot_users FOR ALL
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'milad201400@gmail.com'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'milad201400@gmail.com'
    )
  );

-- Add support_channels table for storing Telegram channel links
CREATE TABLE IF NOT EXISTS support_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_name text NOT NULL,
  channel_link text NOT NULL,
  channel_type text NOT NULL DEFAULT 'telegram' CHECK (channel_type IN ('telegram', 'instagram', 'website')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE support_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_support_channels" ON support_channels;
CREATE POLICY "select_own_support_channels" ON support_channels FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_support_channels" ON support_channels;
CREATE POLICY "insert_own_support_channels" ON support_channels FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_support_channels" ON support_channels;
CREATE POLICY "update_own_support_channels" ON support_channels FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_support_channels" ON support_channels;
CREATE POLICY "delete_own_support_channels" ON support_channels FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_support_channels_user ON support_channels(user_id);

-- Insert default support channel (Miliconfig Telegram Channel)
INSERT INTO support_channels (user_id, channel_name, channel_link, channel_type)
SELECT auth.uid(), 'Miliconfig Official', 'https://t.me/miliconfig', 'telegram'
WHERE NOT EXISTS (SELECT 1 FROM support_channels WHERE channel_link = 'https://t.me/miliconfig');
