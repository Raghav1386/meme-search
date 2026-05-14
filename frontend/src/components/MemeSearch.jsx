import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function MemeSearch({ onSearch, user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    if (!user) {
      localStorage.setItem('pending_search_query', searchQuery);
      navigate('/login');
      return;
    }

    // Navigating to the results page with the query
    if (onSearch) onSearch(searchQuery);
    navigate(`/results?q=${encodeURIComponent(searchQuery)}`);
    setSearchQuery('');
  };

  return (
    <section className="py-12 md:py-20 relative z-10 -mt-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center">
        
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-0 w-full max-w-[64rem] mx-auto relative group mb-12">
          <div className="flex-1 relative border border-[#22222f] bg-[#0a0a0d]/60 backdrop-blur-xl p-2 group-focus-within:border-[#ff4a1c]/60 transition-all duration-500 flex items-center shadow-[0_0_50px_rgba(0,0,0,0.5)]" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 1.5rem), calc(100% - 1.5rem) 100%, 0 100%)' }}>
            <iconify-icon icon="solar:minimalistic-magnifer-linear" width="28" className="text-[#8a8a98] ml-6 group-focus-within:text-[#ff4a1c] transition-colors"></iconify-icon>
            <input 
              type="text" 
              placeholder="ENTER_MEME_PARAMETERS..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent px-6 py-6 md:py-8 text-lg md:text-xl font-mono text-[#f4f4f5] placeholder:text-[#22222f] focus:outline-none focus:ring-0" 
            />
          </div>

          <button type="submit" className="btn-cyber w-full sm:w-auto mt-4 sm:mt-0 sm:-ml-6 h-[5.5rem] md:h-[7.5rem] px-16 text-lg font-[900] text-white uppercase tracking-[0.2em] shrink-0 border-l border-[#22222f]/50 flex items-center justify-center hover:shadow-[0_0_30px_rgba(255,74,28,0.5)] transition-all duration-300">
            Initiate
          </button>
        </form>

        <div className="flex flex-col items-center text-center reveal">
          <span className="font-mono text-[0.8rem] uppercase tracking-[0.3em] text-[#ff4a1c] mb-3 flex items-center gap-3">
            <span className="w-2 h-2 bg-[#ff4a1c] animate-pulse"></span> SYSTEM_QUERY_ACTIVE
          </span>
          <p className="font-mono text-sm text-[#8a8a98] max-w-xl leading-relaxed opacity-80">
            Access the high-signal meme intelligence stream. Query frontier templates, viral telemetry, and cultural impact metrics.
          </p>
        </div>

      </div>
    </section>
  );
}
