/*
# Migration: Add banned users view and admin management improvements

## Changes
1. Create view for banned users
2. Add function to get user details by telegram_id
3. Improve admin management functions
*/

-- View for banned users
CREATE OR REPLACE VIEW banned_users AS
SELECT 
  id,
  telegram_id,
  username,
  first_name,
  last_name,
  created_at,
  last_activity
FROM bot_users
WHERE is_active = false;

-- Grant access to banned_users view for admins
DROP POLICY IF EXISTS "view_banned_users" ON bot_users;
CREATE POLICY "view_banned_users" ON bot_users FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM admin_users)
    OR EXISTS (
      SELECT 1 FROM bot_users bu 
      WHERE bu.user_id = auth.uid() AND bu.is_admin = true
    )
  );

-- Function to get user by telegram_id
CREATE OR REPLACE FUNCTION get_user_by_telegram_id(tg_id text)
RETURNS TABLE (
  id uuid,
  telegram_id text,
  username text,
  first_name text,
  last_name text,
  is_active boolean,
  is_admin boolean,
  created_at timestamptz,
  last_activity timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bu.id,
    bu.telegram_id,
    bu.username,
    bu.first_name,
    bu.last_name,
    bu.is_active,
    bu.is_admin,
    bu.created_at,
    bu.last_activity
  FROM bot_users bu
  WHERE bu.telegram_id = tg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to ban/unban user
CREATE OR REPLACE FUNCTION toggle_user_ban(tg_id text, should_ban boolean)
RETURNS boolean AS $$
BEGIN
  UPDATE bot_users SET is_active = NOT should_ban WHERE telegram_id = tg_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to toggle admin status
CREATE OR REPLACE FUNCTION toggle_user_admin(tg_id text, should_promote boolean)
RETURNS boolean AS $$
BEGIN
  UPDATE bot_users SET is_admin = should_promote WHERE telegram_id = tg_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete user
CREATE OR REPLACE FUNCTION delete_bot_user(tg_id text)
RETURNS boolean AS $$
BEGIN
  DELETE FROM bot_users WHERE telegram_id = tg_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_by_telegram_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_user_ban(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_user_admin(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_bot_user(text) TO authenticated;

