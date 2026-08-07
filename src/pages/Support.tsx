import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  Headphones,
  MessageCircle,
  Send,
  Users,
  Bot,
  ExternalLink,
  Check,
  Copy,
  AlertCircle,
} from 'lucide-react'

interface SupportMessage {
  id: string
  user_id: string
  message: string
  response: string | null
  status: 'pending' | 'answered' | 'closed'
  created_at: string
  updated_at: string
}

interface SupportChannel {
  id: string
  channel_name: string
  channel_link: string
  channel_type: string
  is_active: boolean
}

export default function SupportPage() {
  const { user } = useAuth()
  const [channels, setChannels] = useState<SupportChannel[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadChannels = useCallback(async () => {
    const { data } = await supabase.from('support_channels').select('*').eq('is_active', true)
    setChannels(data as SupportChannel[] ?? [])
  }, [])

  const loadMessages = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setMessages(data as SupportMessage[] ?? [])
  }, [user?.id])

  useEffect(() => {
    Promise.all([loadChannels(), loadMessages()]).then(() => setLoading(false))
  }, [loadChannels, loadMessages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user?.id) return

    setSending(true)
    try {
      const { error } = await supabase.from('support_messages').insert({
        user_id: user.id,
        message: newMessage.trim(),
        status: 'pending',
      })

      if (error) throw error

      setNewMessage('')
      await loadMessages()
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setSending(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const telegramAdminId = '@milad201400'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">پشتیبانی</h1>
        <p className="text-slate-400 text-sm mt-1">ارتباط با تیم پشتیبانی Miliconfig</p>
      </div>

      {/* Main Support Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Telegram Channel Card */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/10">
              <Bot className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">کانال تلگرام</h2>
              <p className="text-xs text-slate-400">اخبار، آپدیت‌ها و آموزش‌ها</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 mb-4">
            <p className="text-white font-medium mb-2">📢 کانال رسمی Miliconfig</p>
            <p className="text-sm text-slate-400 mb-4">
              برای دریافت آخرین اخبار، آپدیت‌ها، آموزش‌ها و پشتیبانی به کانال رسمی ما بپیوندید.
            </p>
            <a
              href="https://t.me/miliconfig"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              عضویت در کانال
            </a>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
            <code className="flex-1 text-sm text-slate-300 font-mono truncate" dir="ltr">
              https://t.me/miliconfig
            </code>
            <button
              onClick={() => copyToClipboard('https://t.me/miliconfig', 'channel')}
              className="p-2 rounded-lg text-slate-500 hover:text-white transition-colors"
              title="کپی لینک"
            >
              {copied === 'channel' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Direct Contact Card */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-green-500/10">
              <MessageCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">تماس مستقیم</h2>
              <p className="text-xs text-slate-400">پشتیبانی اختصاصی</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 mb-4">
            <p className="text-white font-medium mb-2">💬 پشتیبانی مستقیم</p>
            <p className="text-sm text-slate-400 mb-4">
              برای سوالات فنی و مشکلات خاص، می‌توانید مستقیماً با ادمین در ارتباط باشید.
            </p>
            <a
              href={`https://t.me/${telegramAdminId.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-all font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              تماس در تلگرام
            </a>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
            <span className="text-sm text-slate-400">آیدی تلگرام:</span>
            <code className="flex-1 text-sm text-brand-300 font-mono truncate" dir="ltr">
              {telegramAdminId}
            </code>
            <button
              onClick={() => copyToClipboard(telegramAdminId, 'admin')}
              className="p-2 rounded-lg text-slate-500 hover:text-white transition-colors"
              title="کپی آیدی"
            >
              {copied === 'admin' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Support Tickets / Messages */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-orange-500/10">
            <Headphones className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">تیکت‌های پشتیبانی</h2>
            <p className="text-xs text-slate-400">پیام‌های ارسالی شما به پشتیبانی</p>
          </div>
        </div>

        {/* Send New Message Form */}
        <form onSubmit={handleSendMessage} className="mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="پیام خود را بنویسید..."
              className="input-field flex-1"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              {sending ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              ارسال
            </button>
          </div>
        </form>

        {/* Messages List */}
        {messages.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Headphones className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>هنوز پیامی ارسال نکرده‌اید</p>
            <p className="text-xs mt-1">برای شروع، پیام خود را در کادر بالا بنویسید</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-xl border ${
                  msg.status === 'answered'
                    ? 'bg-green-500/5 border-green-500/30'
                    : msg.status === 'closed'
                    ? 'bg-slate-800/50 border-slate-700'
                    : 'bg-amber-500/5 border-amber-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium ${
                        msg.status === 'answered'
                          ? 'bg-green-500/10 text-green-400'
                          : msg.status === 'closed'
                          ? 'bg-slate-700 text-slate-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {msg.status === 'answered' ? 'پاسخ داده شده' : msg.status === 'closed' ? 'بسته شده' : 'در انتظار بررسی'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(msg.created_at).toLocaleString('fa-IR')}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-white mb-2">{msg.message}</p>
                {msg.response && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-slate-400 mb-1">پاسخ پشتیبانی:</p>
                    <p className="text-sm text-green-400">{msg.response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-purple-500/10">
            <AlertCircle className="w-6 h-6 text-purple-400" />
          </div>
          <h2 className="text-lg font-bold text-white">سوالات متداول</h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'چگونه می‌توانم توکن Cloudflare را دریافت کنم؟',
              a: 'به داشبورد Cloudflare بروید، از بخش Profile > API Tokens یک توکن جدید بسازید.',
            },
            {
              q: 'ربات تلگرام چگونه کار می‌کند؟',
              a: 'پس از پیکربندی ربات در بخش "ربات تلگرام"، می‌توانید از طریق دستورات تلگرام ورکرها را مدیریت کنید.',
            },
            {
              q: 'آیا می‌توانم چندین ورکر داشته باشم؟',
              a: 'بله، محدودیتی در تعداد ورکرها وجود ندارد. هر ورکر تنظیمات مستقل خود را دارد.',
            },
            {
              q: 'چگونه ورکر را حذف کنم؟',
              a: 'در صفحه "ورکرها"، روی ورکر مورد نظر کلیک کرده و گزینه حذف را انتخاب کنید.',
            },
          ].map((faq, i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/50">
              <p className="text-sm font-medium text-white mb-2">{faq.q}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
