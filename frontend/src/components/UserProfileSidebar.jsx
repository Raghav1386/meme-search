import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UserProfileSidebar({ isOpen, onClose, user, onSignOut, onSwitchAccount }) {
  if (!user) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 bg-[#070709]/80 backdrop-blur-md z-[100]"
            onClick={onClose}
          />

          {/* Sidebar Panel (Right Side) */}
          <motion.aside 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, mass: 0.8 }}
            className="fixed top-0 right-0 h-full w-[85vw] max-w-[320px] sm:max-w-none sm:w-[320px] md:w-[380px] bg-[#0a0a0d] border-l border-[#22222f] z-[101] shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col will-change-transform"
          >
            {/* Header */}
            <div className="p-6 border-b border-[#22222f] flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-sm bg-[#ff4a1c] flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,74,28,0.3)]">
                    <iconify-icon icon="solar:user-circle-bold" width="20"></iconify-icon>
                 </div>
                 <span className="font-display font-[800] text-xl tracking-tighter text-[#f4f4f5]">PROFILE</span>
              </div>
              <button 
                onClick={onClose}
                className="text-[#8a8a98] hover:text-[#ff4a1c] transition-colors"
              >
                <iconify-icon icon="solar:close-circle-linear" width="24"></iconify-icon>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-8">
              
              {/* User Identity Section */}
              <div className="flex flex-col items-center text-center space-y-4 pb-6 border-b border-[#22222f]">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User Avatar" referrerPolicy="no-referrer" className="w-24 h-24 rounded-full border-2 border-[#ff4a1c] object-cover shadow-[0_0_20px_rgba(255,74,28,0.3)]" />
                ) : (
                  <div className="w-24 h-24 rounded-full border-2 border-[#ff4a1c] bg-[#111116] shadow-[0_0_20px_rgba(255,74,28,0.3)] flex items-center justify-center text-[#f4f4f5]">
                    {user.method === 'Google' ? <iconify-icon icon="logos:google-icon" width="40"></iconify-icon> :
                     user.method === 'Facebook' ? <iconify-icon icon="logos:facebook" width="40"></iconify-icon> :
                     <iconify-icon icon="solar:user-bold" width="48"></iconify-icon>}
                  </div>
                )}
                
                <div>
                  <h3 className="font-display font-bold text-2xl text-[#f4f4f5] uppercase">{user.name || user.username}</h3>
                  <div className="flex flex-col items-center gap-1 mt-2">
                    <span className="font-mono text-[0.65rem] text-[#ff4a1c] uppercase tracking-widest leading-none flex items-center gap-2 bg-[#ff4a1c]/10 px-3 py-1 rounded-sm border border-[#ff4a1c]/30">
                        <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full animate-pulse"></span> OPERATOR_ONLINE
                    </span>
                    <span className="font-mono text-xs text-[#8a8a98]">{user.email || user.username}</span>
                    <span className="font-mono text-[0.65rem] text-[#22222f] uppercase mt-1">Auth: {user.method}</span>
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              <section>
                <h5 className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> SYSTEM_SETTINGS
                </h5>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { icon: 'solar:safe-circle-linear', label: 'Content Filter', status: 'Strict' },
                    { icon: 'solar:bookmark-linear', label: 'Saved Artifacts', status: '0 Items' },
                    { icon: 'solar:link-linear', label: 'Auth Provider', status: user.method || 'System' },
                  ].map((item, idx) => (
                    <div 
                      key={item.label}
                      className="group flex items-center justify-between p-3 border border-transparent hover:border-[#22222f] hover:bg-[#111116] transition-all cursor-pointer" 
                      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}
                    >
                      <div className="flex items-center gap-4 text-[#8a8a98] group-hover:text-[#f4f4f5] transition-colors">
                        <iconify-icon icon={item.icon} width="18"></iconify-icon>
                        <span className="font-mono text-xs uppercase tracking-widest leading-none">{item.label}</span>
                      </div>
                      <span className="font-mono text-[0.6rem] text-[#22222f] group-hover:text-[#ff4a1c] uppercase">{item.status}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Actions Section */}
              <section className="pt-4 border-t border-[#22222f]">
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      onClose();
                      onSwitchAccount();
                    }}
                    className="flex items-center justify-center gap-3 p-3 bg-[#111116] border border-[#22222f] text-[#8a8a98] hover:text-[#f4f4f5] hover:border-[#ff4a1c]/50 transition-all font-mono text-xs uppercase tracking-widest"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}
                  >
                    <iconify-icon icon="solar:users-group-two-rounded-linear" width="18"></iconify-icon>
                    Switch Account
                  </button>

                  <button 
                    onClick={() => {
                      onClose();
                      onSignOut();
                    }}
                    className="flex items-center justify-center gap-3 p-3 bg-[#ff4a1c]/10 border border-[#ff4a1c]/30 text-[#ff4a1c] hover:bg-[#ff4a1c] hover:text-white transition-all font-mono text-xs uppercase tracking-widest shadow-[0_0_15px_rgba(255,74,28,0.1)]"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}
                  >
                    <iconify-icon icon="solar:logout-2-outline" width="18"></iconify-icon>
                    Sign Out Protocol
                  </button>
                </div>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
