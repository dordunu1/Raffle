import { useEffect, useState, useCallback } from 'react';

export type ToastType = 'info' | 'success' | 'error' | 'warning' | 'loading';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// Helper function to make error messages user-friendly
function getUserFriendlyError(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  // User rejection
  if (lowerMessage.includes('user rejected') || lowerMessage.includes('user denied') || lowerMessage.includes('rejected')) {
    return 'Transaction cancelled. You can try again when ready.';
  }
  
  // Already entered pool
  if (lowerMessage.includes('already entered') || lowerMessage.includes('already entered this pool')) {
    return 'You have already entered this pool. Each address can only enter once per pool.';
  }
  
  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  
  // Insufficient funds
  if (lowerMessage.includes('insufficient') || lowerMessage.includes('balance')) {
    return 'Insufficient balance. Please check your wallet and try again.';
  }
  
  // Gas errors
  if (lowerMessage.includes('gas') || lowerMessage.includes('out of gas')) {
    return 'Transaction failed due to gas issues. Please try again.';
  }
  
  // Contract errors
  if (lowerMessage.includes('contract') || lowerMessage.includes('revert')) {
    return 'Transaction failed. Please check the contract status and try again.';
  }
  
  // Timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }
  
  // Generic fallback - remove technical details
  if (message.includes('❌')) {
    return message.replace(/❌\s*/, '').split('\n')[0].substring(0, 100);
  }
  
  // If it's already user-friendly, return as is
  if (message.length < 150 && !message.includes('{') && !message.includes('code')) {
    return message;
  }
  
  // Default friendly message
  return 'Something went wrong. Please try again.';
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

export function ToastComponent({ toast, onRemove }: ToastProps) {
  useEffect(() => {
    if (toast.type !== 'loading' && toast.duration !== 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id);
      }, toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, onRemove]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="w-8 h-8 rounded-lg bg-green-200 border-2 border-black flex items-center justify-center">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="w-8 h-8 rounded-lg bg-red-200 border-2 border-black flex items-center justify-center">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </div>
        );
      case 'warning':
        return (
          <div className="w-8 h-8 rounded-lg bg-yellow-300 border-2 border-black flex items-center justify-center">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
        );
      case 'loading':
        return (
          <div className="w-8 h-8 rounded-lg bg-blue-200 border-2 border-black flex items-center justify-center">
            <svg className="w-5 h-5 text-black animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-yellow-300 border-2 border-black flex items-center justify-center">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
        );
    }
  };

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-green-100',
          border: 'border-4 border-green-600',
          text: 'text-black',
          shadow: 'shadow-[4px_4px_0px_0px_rgba(139,111,71,0.8)]'
        };
      case 'error':
        return {
          bg: 'bg-red-100',
          border: 'border-4 border-red-600',
          text: 'text-black',
          shadow: 'shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]'
        };
      case 'warning':
        return {
          bg: 'bg-[#FFEDD5]',
          border: 'border-4 border-[#EA580C]',
          text: 'text-[#EA580C]',
          shadow: 'shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]'
        };
      case 'loading':
        return {
          bg: 'bg-blue-100',
          border: 'border-4 border-blue-600',
          text: 'text-black',
          shadow: 'shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]'
        };
      default:
        return {
          bg: 'bg-[#FFEDD5]',
          border: 'border-4 border-[#EA580C]',
          text: 'text-[#EA580C]',
          shadow: 'shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]'
        };
    }
  };

  const styles = getStyles();
  const displayMessage = toast.type === 'error' ? getUserFriendlyError(toast.message) : toast.message;

  return (
    <div className={`
      ${styles.bg} 
      ${styles.border} 
      ${styles.shadow}
      rounded-lg 
      p-5 
      mb-4 
      flex 
      items-start 
      gap-4 
      animate-slide-in-bottom
      min-w-[320px]
      max-w-md
    `}>
      <div className="flex-shrink-0">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`${styles.text} text-base md:text-lg font-black leading-relaxed break-words`}>
          {displayMessage}
        </p>
      </div>
      {toast.type !== 'loading' && (
        <button
          onClick={() => onRemove(toast.id)}
          className="text-[#EA580C] hover:text-[#C2410C] flex-shrink-0 transition-colors p-1 rounded-lg hover:bg-[#EA580C]/10 border-2 border-transparent hover:border-[#EA580C]"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-full max-w-md space-y-4 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastComponent toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateToast = useCallback((id: string, message: string, type?: ToastType) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, message, type: type || t.type } : t))
    );
  }, []);

  return { toasts, addToast, removeToast, updateToast };
}

