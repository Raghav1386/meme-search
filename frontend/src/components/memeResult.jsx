import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';

export default function MemeResult() {
  const [memes, setMemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const initialQuery = new URLSearchParams(location.search).get('q') || 'ALL_UNITS';
  const [searchInputValue, setSearchInputValue] = useState(initialQuery);
  const query = initialQuery;

  useEffect(() => {
    setSearchInputValue(initialQuery);
  }, [initialQuery]);

  const handleLocalSearch = (e) => {
    e.preventDefault();
    if (!searchInputValue.trim()) return;
    navigate(`/results?q=${encodeURIComponent(searchInputValue)}`);
  };

  useEffect(() => {
    // Simulate backend fetch
    setLoading(true);
    setTimeout(() => {
      const mockMemes = [
        { id: 'M_001', title: 'AGI_SOON_TM', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80', tags: ['AGI', 'VAPORWARE'] },
        { id: 'M_002', title: 'COMPUTE_LIMITS', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80', tags: ['HARDWARE', 'GPU'] },
        { id: 'M_003', title: 'LLM_HALO', url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=600&q=80', tags: ['LLM', 'GLOWUP'] },
        { id: 'M_004', title: 'DATA_WALL', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc51?auto=format&fit=crop&w=600&q=80', tags: ['DATA', 'ENTROPY'] },
        { id: 'M_005', title: 'NEURAL_ERROR', url: 'https://images.unsplash.com/photo-1509228468518-180dd486490e?auto=format&fit=crop&w=600&q=80', tags: ['MODEL', 'DRIFT'] },
        { id: 'M_006', title: 'SYNTH_ME', url: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=600&q=80', tags: ['SYNTHETIC', 'GEN'] },
      ];
      setMemes(mockMemes);
      setLoading(false);
    }, 1200);
  }, [query]);

  return (
    <div className="pt-32 pb-20 min-h-screen relative z-10">
      
      {/* HEADER SECTION */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 mb-12 flex flex-col md:flex-row justify-between items-end gap-6 reveal active">
        <div>
          <div className="flex items-center gap-3 font-mono text-[0.65rem] text-[#ff4a1c] mb-3 uppercase tracking-widest">
            <span className="w-2 h-2 bg-[#ff4a1c] animate-pulse"></span>
            <span>Archive Selection // query: {query}</span>
          </div>
          <h1 className="font-display font-[800] text-4xl md:text-5xl text-[#f4f4f5] leading-none mb-6">
            Retrieved <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4a1c] to-[#ff8c42]">Artifacts.</span>
          </h1>

          {/* LOCAL SEARCH BAR */}
          <form onSubmit={handleLocalSearch} className="flex w-full max-w-[32rem] relative group">
            <div className="flex-1 relative border border-[#22222f] bg-[#0a0a0d]/60 backdrop-blur-xl p-1 group-focus-within:border-[#ff4a1c]/60 transition-all duration-300 flex items-center" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.75rem), calc(100% - 0.75rem) 100%, 0 100%)' }}>
              <iconify-icon icon="solar:minimalistic-magnifer-linear" width="20" className="text-[#8a8a98] ml-4 group-focus-within:text-[#ff4a1c]"></iconify-icon>
              <input 
                type="text" 
                placeholder="UPDATE_QUERY..." 
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                className="w-full bg-transparent px-4 py-3 text-sm font-mono text-[#f4f4f5] placeholder:text-[#22222f] focus:outline-none focus:ring-0" 
              />
            </div>
            <button type="submit" className="btn-cyber h-[3.25rem] px-6 text-xs font-bold text-white uppercase tracking-wider -ml-4 flex items-center justify-center">
              Execute
            </button>
          </form>
        </div>
        
        <div className="flex gap-4 font-mono text-[0.6rem]">
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            STATUS: <span className="text-[#ff4a1c]">SYNC_COMPLETE</span>
          </div>
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            UNITS: <span className="text-[#f4f4f5]">{memes.length}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-6">
            <div className="w-12 h-12 border-2 border-[#ff4a1c] border-t-transparent rounded-full animate-spin"></div>
            <span className="font-mono text-xs text-[#ff4a1c] animate-pulse uppercase">decrypting_data_stream...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {memes.map((meme, i) => (
              <div 
                key={meme.id} 
                className="group relative bg-[#111116]/40 backdrop-blur-md border border-[#22222f] p-3 reveal active flex flex-col transition-all duration-500 hover:border-[#ff4a1c]/50 hover:shadow-[0_0_40px_rgba(255,74,28,0.15)] hover:-translate-y-1"
                style={{ 
                  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 1.5rem), calc(100% - 1.5rem) 100%, 0 100%)', 
                  transitionDelay: `${i * 100}ms`,
                  willChange: 'transform, opacity'
                }}
              >
                {/* Visual Accent */}
                <div className="absolute top-0 right-0 w-12 h-[1px] bg-[#ff4a1c]/50"></div>
                <div className="absolute bottom-6 right-0 w-[1px] h-12 bg-[#ff4a1c]/50"></div>

                {/* Image Container */}
                <div className="relative aspect-[4/3] overflow-hidden mb-4 bg-[#070709]">
                  <img 
                    src={meme.url} 
                    alt={meme.title} 
                    loading="lazy"
                    className="w-full h-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#070709] to-transparent opacity-60 group-hover:opacity-20 transition-opacity"></div>
                  
                  {/* Overlay ID */}
                  <div className="absolute top-4 left-4 font-mono text-[0.6rem] bg-[#070709]/80 border border-[#22222f] px-2 py-1 text-[#ff4a1c]">
                    {meme.id}
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3 flex-1 px-2 pb-2">
                  <h3 className="font-display font-bold text-lg text-[#f4f4f5] tracking-tight group-hover:text-[#ff4a1c] transition-colors uppercase">
                    {meme.title}
                  </h3>
                  
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {meme.tags.map(tag => (
                      <span key={tag} className="font-mono text-[0.55rem] text-[#8a8a98] bg-[#070709] border border-[#22222f] px-2 py-0.5 group-hover:border-[#ff4a1c]/30 transition-colors">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <button className="btn-cyber w-full py-3 mt-4 text-[0.65rem] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    Extract Data
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <span className="accoutrement-coord" style={{ top: '10rem', left: '2rem' }}>SEC.RESULT_VIEW</span>
    </div>
  );
}
