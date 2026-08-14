-- جدول کاربران زیرمجموعه (Sub-users)
CREATE TABLE IF NOT EXISTS public.sub_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_id UUID REFERENCES public.tokens(id) ON DELETE CASCADE NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    
    -- محدودیت‌ها
    traffic_limit_gb NUMERIC DEFAULT 0, -- 0 یعنی نامحدود
    traffic_used_gb NUMERIC DEFAULT 0,
    time_limit_days INTEGER DEFAULT 0, -- 0 یعنی نامحدود
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- وضعیت
    is_active BOOLEAN DEFAULT true,
    is_online BOOLEAN DEFAULT false,
    
    -- تنظیمات اختصاصی پنل (JSON)
    panel_settings JSONB DEFAULT '{"inbound_id": 0, "flow": "", "security": "none"}',
    
    -- شناسه کاربر در پنل اصلی (X-UI)
    xui_user_id INTEGER,
    
    UNIQUE(token_id, username)
);

-- ایندکس برای جستجوی سریع
CREATE INDEX IF NOT EXISTS idx_sub_users_token_id ON public.sub_users(token_id);
CREATE INDEX IF NOT EXISTS idx_sub_users_username ON public.sub_users(username);

-- سیاست‌های امنیتی (RLS)
ALTER TABLE public.sub_users ENABLE ROW LEVEL SECURITY;

-- فقط صاحب توکن می‌تواند کاربران زیرمجموعه خود را ببیند/مدیریت کند
CREATE POLICY "Users can manage their own sub-users"
ON public.sub_users
FOR ALL
USING (
    token_id IN (
        SELECT id FROM public.tokens 
        WHERE user_id = auth.uid()
    )
);
