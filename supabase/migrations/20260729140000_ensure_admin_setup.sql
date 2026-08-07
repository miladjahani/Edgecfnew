/*
# Migration: Ensure admin setup for milad201400@gmail.com

## Changes
1. Create function to check system admin
2. Ensure support channels exist
3. Add admin notification settings
*/

-- Ensure support_channels table exists
CREATE TABLE IF NOT EXISTS support_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  channel_link text NOT NULL,
  channel_type text NOT NULL DEFAULT 'telegram',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE support_channels ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active channels
DROP POLICY IF EXISTS "public_read_active_channels" ON support_channels;
CREATE POLICY "public_read_active_channels" ON support_channels FOR SELECT
  TO authenticated USING (is_active = true);

-- Only admin can insert/update channels
DROP POLICY IF EXISTS "admin_manage_channels" ON support_channels;
CREATE POLICY "admin_manage_channels" ON support_channels FOR ALL
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'milad201400@gmail.com'
    )
  );

-- Insert default support channel if not exists
INSERT INTO support_channels (channel_name, channel_link, channel_type, is_active)
VALUES 
  ('کانال رسمی Miliconfig', 'https://t.me/miliconfig', 'telegram', true),
  ('پشتیبانی مستقیم', 'https://t.me/milad201400', 'telegram_admin', true)
ON CONFLICT DO NOTHING;

-- Create admin_users view for easy admin checking
CREATE OR REPLACE VIEW admin_users AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  CASE 
    WHEN u.email = 'milad201400@gmail.com' THEN 'system_admin'
    ELSE 'admin'
  END as admin_role
FROM auth.users u
WHERE u.email = 'milad201400@gmail.com'
   OR EXISTS (
     SELECT 1 FROM bot_users bu 
     WHERE bu.user_id = u.id AND bu.is_admin = true
   );

-- Grant access to admin_users view
DROP POLICY IF EXISTS "view_admin_users" ON auth.users;
CREATE POLICY "view_admin_users" ON auth.users FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

-- Function to get current user's admin status
CREATE OR REPLACE FUNCTION get_user_admin_status()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'is_admin', EXISTS (
      SELECT 1 FROM bot_users bu 
      WHERE bu.user_id = auth.uid() AND bu.is_admin = true
    ),
    'is_system_admin', EXISTS (
      SELECT 1 FROM auth.users u 
      WHERE u.id = auth.uid() AND u.email = 'milad201400@gmail.com'
    ),
    'email', (SELECT email FROM auth.users WHERE id = auth.uid())
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

