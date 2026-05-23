import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Login from './login';

export default function AuthModal({ isOpen, onClose, message, onLoginSuccess }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[#070709]/90 backdrop-blur-md z-[110]"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.4, type: 'spring', damping: 25 }}
            className="fixed inset-0 z-[111] flex flex-col items-center justify-center pointer-events-none px-4"
          >
            <div className="pointer-events-auto relative w-full max-w-[28rem]">
              {/* Message Bar */}
              {message && (
                <div className="absolute -top-12 left-0 w-full flex items-center justify-center gap-3 font-mono text-[0.65rem] text-[#ff4a1c] uppercase tracking-widest bg-[#ff4a1c]/10 border border-[#ff4a1c]/20 py-2">
                  <iconify-icon icon="solar:shield-warning-bold" width="16"></iconify-icon>
                  {message}
                </div>
              )}
              
              {/* Close Button */}
              <button 
                onClick={onClose}
                className="absolute right-0 -top-8 text-[#8a8a98] hover:text-[#ff4a1c] flex items-center justify-center z-50 transition-colors uppercase font-mono text-[0.65rem] tracking-widest gap-1"
              >
                [Abort] <iconify-icon icon="solar:close-square-linear" width="14"></iconify-icon>
              </button>

              <Login 
                isModal={true} 
                onLogin={(user) => {
                  if (onLoginSuccess) onLoginSuccess(user);
                  onClose();
                }} 
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
