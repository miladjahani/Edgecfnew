/*
# Migration: Add support_messages table for user tickets

## Changes
1. Create support_messages table for storing user support requests
2. Add RLS policies for secure access
3. Insert default admin notification settings
*/

-- Create support_messages table
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  response text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Policies for support_messages
DROP POLICY IF EXISTS "select_own_support_messages" ON support_messages;
CREATE POLICY "select_own_support_messages" ON support_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_support_messages" ON support_messages;
CREATE POLICY "insert_own_support_messages" ON support_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Admin can view all messages
DROP POLICY IF EXISTS "admin_view_all_support_messages" ON support_messages;
CREATE POLICY "admin_view_all_support_messages" ON support_messages FOR SELECT
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'milad201400@gmail.com'
    )
  );

-- Admin can update all messages (add responses)
DROP POLICY IF EXISTS "admin_update_all_support_messages" ON support_messages;
CREATE POLICY "admin_update_all_support_messages" ON support_messages FOR UPDATE
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_support_messages_user ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_status ON support_messages(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_support_messages_updated_at ON support_messages;
CREATE TRIGGER update_support_messages_updated_at
  BEFORE UPDATE ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
