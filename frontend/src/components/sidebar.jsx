import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Sidebar({ isOpen, onClose, history, onClearHistory, user, totalUsers }) {
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

          {/* Sidebar Panel */}
          <motion.aside 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, mass: 0.8 }}
            className="fixed top-0 left-0 h-full w-[85vw] max-w-[320px] sm:max-w-none sm:w-[320px] md:w-[380px] bg-[#0a0a0d] border-r border-[#22222f] z-[101] shadow-[20px_0_50px_rgba(0,0,0,0.5)] flex flex-col will-change-transform"
          >
            {/* Header */}
            <div className="p-6 border-b border-[#22222f] flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-sm bg-[#ff4a1c] flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,74,28,0.3)]">
                    <iconify-icon icon="solar:shield-keyhole-bold" width="20"></iconify-icon>
                 </div>
                 <span className="font-display font-[800] text-xl tracking-tighter text-[#f4f4f5]">SYS_MENU</span>
              </div>
              <button 
                onClick={onClose}
                className="text-[#8a8a98] hover:text-[#ff4a1c] transition-colors"
              >
                <iconify-icon icon="solar:close-circle-linear" width="24"></iconify-icon>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-10">
              
              {/* Quick Navigation */}
              <section>
                <h5 className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> NAV_QUICK
                </h5>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { icon: 'solar:fire-linear', label: 'Trending', count: '12' },
                    { icon: 'solar:planet-linear', label: 'Discover', count: 'New' },
                    { icon: 'solar:heart-linear', label: 'My Favorites', count: '0' },
                    { icon: 'solar:upload-linear', label: 'Upload Intel', count: '' },
                  ].map((item, idx) => (
                    <motion.button 
                      key={item.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                      className="group flex items-center justify-between p-3 border border-transparent hover:border-[#22222f] hover:bg-[#111116] transition-all text-left" 
                      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}
                    >
                      <div className="flex items-center gap-4 text-[#8a8a98] group-hover:text-[#f4f4f5] transition-colors">
                        <iconify-icon icon={item.icon} width="18"></iconify-icon>
                        <span className="font-mono text-xs uppercase tracking-widest leading-none">{item.label}</span>
                      </div>
                      {item.count && (
                        <span className="font-mono text-[0.55rem] px-1.5 py-0.5 bg-[#1a1a24] text-[#ff4a1c] border border-[#ff4a1c]/20">{item.count}</span>
                      )}
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* Intel Streams (Categories) */}
              <section>
                <h5 className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> INTEL_STREAMS
                </h5>
                <div className="grid grid-cols-1 gap-2">
                  {['Reaction Memes', 'Technical Artifacts', 'S-Tier Templates', 'Cultural Telemetry'].map((label, idx) => (
                    <motion.button 
                      key={label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + idx * 0.05 }}
                      className="group flex items-center gap-4 p-3 text-[#8a8a98] hover:text-[#f4f4f5] transition-colors"
                    >
                      <div className="w-1.5 h-1.5 bg-[#22222f] group-hover:bg-[#ff4a1c] group-hover:scale-125 transition-all"></div>
                      <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* History Log */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-[0.3em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> HISTORY_LOG
                  </h5>
                  <div className="flex items-center gap-3">
                    {user && history.length > 0 && (
                      <button 
                        onClick={onClearHistory}
                        className="font-mono text-[0.55rem] text-[#8a8a98] hover:text-[#ff4a1c] uppercase tracking-tighter"
                      >
                        [Clear]
                      </button>
                    )}
                    <iconify-icon icon="solar:reorder-linear" width="14" className="text-[#22222f]"></iconify-icon>
                  </div>
                </div>
                
                {!user ? (
                  <div className="p-6 border border-[#22222f] border-dashed text-center">
                    <p className="font-mono text-[0.7rem] text-[#8a8a98] uppercase leading-relaxed">
                       CRITICAL: Authentication Required <br/>
                       To Track Query Telemetry.
                    </p>
                    <button className="mt-4 text-[#ff4a1c] font-mono text-[0.7rem] uppercase tracking-widest hover:underline">Link Operator Account</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.length === 0 ? (
                      <p className="font-mono text-xs text-[#22222f] uppercase text-center py-4">No recent signals detected.</p>
                    ) : (
                      history.map((log) => (
                        <div key={log.id} className="group relative p-3 border-l border-[#22222f] hover:border-[#ff4a1c] transition-colors cursor-pointer">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-mono text-sm text-[#f4f4f5] group-hover:text-[#ff4a1c] transition-colors truncate pr-4 uppercase">{log.query}</span>
                            <span className="font-mono text-[0.6rem] text-[#22222f]">{log.timestamp}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-[2px] bg-[#111116] overflow-hidden">
                              <div className="h-full bg-[#ff4a1c] opacity-30" style={{ width: `${log.strength}%` }}></div>
                            </div>
                            <span className="font-mono text-[0.6rem] text-[#ff4a1c]/40">S:{log.strength}%</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* Footer info */}
            <div className="p-6 border-t border-[#22222f] bg-[#070709]">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[0.6rem] text-[#8a8a98] uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:users-group-rounded-bold" width="14" className="text-[#ff4a1c]"></iconify-icon>
                  <span className="text-[#f4f4f5] font-bold">{totalUsers > 0 ? totalUsers : '--'}</span> Operators
                </span>
                <span className="font-mono text-[0.5rem] text-[#22222f] uppercase">v0.9.4-alpha</span>
              </div>
              <button className="w-full py-3 border border-[#22222f] text-[#8a8a98] font-mono text-[0.7rem] uppercase tracking-widest hover:bg-[#111116] transition-all">
                System Diagnostics
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
