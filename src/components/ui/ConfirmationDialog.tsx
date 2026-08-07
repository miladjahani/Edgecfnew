import { AlertTriangle, CheckCircle2, X } from 'lucide-react'

interface ConfirmationDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  type?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
  isConfirming?: boolean
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  type = 'danger',
  onConfirm,
  onCancel,
  isConfirming = false,
}: ConfirmationDialogProps) {
  if (!isOpen) return null

  const typeConfig = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-error-400',
      iconBg: 'bg-error-500/10',
      confirmBg: 'bg-error-600 hover:bg-error-700',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      confirmBg: 'bg-amber-600 hover:bg-amber-700',
    },
    info: {
      icon: CheckCircle2,
      iconColor: 'text-brand-400',
      iconBg: 'bg-brand-500/10',
      confirmBg: 'bg-brand-600 hover:bg-brand-700',
    },
  }

  const config = typeConfig[type]
  const Icon = config.icon

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" 
      onClick={onCancel}
    >
      <div 
        className="glass-card p-6 w-full max-w-md animate-slide-up shadow-2xl" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${config.iconBg}`}>
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            </div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
          <button 
            onClick={onCancel} 
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-slate-300 mb-6 leading-relaxed">{message}</p>
        
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className={`flex-1 py-3 px-4 rounded-xl text-white font-medium transition-all duration-200 flex items-center justify-center gap-2 ${config.confirmBg} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isConfirming ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                در حال پردازش...
              </>
            ) : (
              confirmLabel
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
