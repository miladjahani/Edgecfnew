import toast from 'react-hot-toast'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'

export default function ToastDemo() {
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-bold text-white mb-4">نمایش Toast ها</h3>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => toast.success('عملیات با موفقیت انجام شد')}
          className="btn-primary flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          موفقیت
        </button>
        <button
          onClick={() => toast.error('خطایی رخ داد')}
          className="bg-error-500/10 text-error-400 hover:bg-error-500/20 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
        >
          <XCircle className="w-4 h-4" />
          خطا
        </button>
        <button
          onClick={() => toast('در حال پردازش...')}
          className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
        >
          <Info className="w-4 h-4" />
          اطلاع
        </button>
        <button
          onClick={() => toast(<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> هشدار مهم!</span>, {
            icon: '⚠️',
            style: { background: '#f59e0b', color: '#fff' }
          })}
          className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          هشدار
        </button>
      </div>
    </div>
  )
}
