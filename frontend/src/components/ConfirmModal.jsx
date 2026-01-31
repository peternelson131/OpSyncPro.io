import { X, AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  title = 'Confirm Action',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger' // 'danger' | 'warning' | 'info'
}) {
  if (!isOpen) return null;
  
  const variantStyles = {
    danger: { icon: 'text-red-500', button: 'bg-red-600 hover:bg-red-700' },
    warning: { icon: 'text-yellow-500', button: 'bg-yellow-600 hover:bg-yellow-700' },
    info: { icon: 'text-blue-500', button: 'bg-blue-600 hover:bg-blue-700' },
  };
  const style = variantStyles[variant] || variantStyles.danger;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4" onClick={onCancel}>
      <div className="bg-theme-secondary rounded-xl border border-theme max-w-md w-full p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full bg-theme-hover ${style.icon}`}>
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-theme-primary">{title}</h3>
            <p className="text-sm text-theme-secondary mt-2">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-theme-secondary hover:bg-theme-hover">
            {cancelText}
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm text-white font-medium ${style.button}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
