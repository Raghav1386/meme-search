import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import Filter from './filter';
import { formatRelativeTime } from '../utils/time';

export default function MemeResult({ user, requireAuth, onSearch }) {
  const [memes, setMemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const location = useLocation();
  const navigate = useNavigate();
  const initialQuery = new URLSearchParams(location.search).get('q') || 'ALL_UNITS';
  const [searchInputValue, setSearchInputValue] = useState(initialQuery === 'ALL_UNITS' ? '' : initialQuery);
  const query = initialQuery;
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSearchInputValue(initialQuery === 'ALL_UNITS' ? '' : initialQuery);
  }, [initialQuery]);

  const handleLocalSearch = (e) => {
    e.preventDefault();
    const trimmed = searchInputValue.trim();
    if (!trimmed) return;
    
    if (onSearch) onSearch(trimmed);
    navigate(`/results?q=${encodeURIComponent(trimmed)}`);
  };

  useEffect(() => {
    const fetchMemes = async () => {
      setLoading(true);
      try {
        const rawApiUrl = import.meta.env.VITE_API_URL || '';
        const apiUrl = rawApiUrl.replace(/\/+$/, '');
        
        const res = await fetch(`${apiUrl}/api/search?q=${encodeURIComponent(query)}&format=${activeFilter}`);
        if (!res.ok) throw new Error('Failed to fetch memes');
        const data = await res.json();
        
        const formattedMemes = data.map((m, idx) => ({
          id: m.b2_key || m.id || `meme-${idx}`,
          title: m.caption || m.b2_key,
          caption: m.caption || '',
          ocr_text: m.ocr_text || '',
          url: m.url.startsWith('http') ? m.url : `${apiUrl}${m.url}`,
          tags: m.format ? [m.format] : [],
          format: m.format,
          result_type: m.result_type,
          ingested_at: m.ingested_at
        }));
        
        setMemes(formattedMemes);
      } catch (error) {
        console.error('Error fetching memes:', error);
        setMemes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMemes();
  }, [query, activeFilter]);

  const filteredMemes = memes;

  return (
    <div className="pt-32 pb-20 min-h-screen relative z-10">
      
      {/* HEADER SECTION */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 mb-12 flex flex-col md:flex-row justify-between items-center md:items-end gap-6 text-center md:text-left reveal active">
        <div className="w-full md:w-auto flex flex-col items-center md:items-start">
          <div className="flex items-center justify-center md:justify-start gap-3 font-mono text-[0.65rem] text-[#ff4a1c] mb-3 uppercase tracking-widest w-full">
            <span className="w-2 h-2 bg-[#ff4a1c] animate-pulse"></span>
            <span>Meme Database // query: {query}</span>
          </div>
          <h1 className="font-display font-[800] text-4xl md:text-5xl text-[#f4f4f5] leading-none mb-6">
            Dank <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4a1c] to-[#ff8c42]">Memes.</span>
          </h1>

          {/* LOCAL SEARCH BAR */}
          <form onSubmit={handleLocalSearch} className="flex flex-col sm:flex-row w-full max-w-[32rem] mx-auto md:mx-0 relative group gap-3 sm:gap-0 mb-6">
            <div className="flex-1 relative border border-[#22222f] bg-[#0a0a0d]/60 backdrop-blur-xl p-1 group-focus-within:border-[#ff4a1c]/60 transition-all duration-300 flex items-center" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.75rem), calc(100% - 0.75rem) 100%, 0 100%)' }}>
              <iconify-icon icon="solar:minimalistic-magnifer-linear" width="20" className="text-[#8a8a98] ml-4 group-focus-within:text-[#ff4a1c]"></iconify-icon>
              <input 
                type="text" 
                placeholder="Search memes, vibes, topics..." 
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                className="w-full bg-transparent px-4 py-3 text-sm font-mono text-[#f4f4f5] placeholder:text-[#52525f] focus:outline-none focus:ring-0" 
              />
            </div>
            <button type="submit" className="btn-cyber w-full sm:w-auto h-[3.25rem] px-6 text-xs font-bold text-white uppercase tracking-wider sm:-ml-4 flex items-center justify-center">
              Search
            </button>
          </form>
          
          {/* FORMAT FILTER */}
          <div className="flex justify-center md:justify-start w-full">
            <Filter activeFilter={activeFilter} setFilter={setActiveFilter} />
          </div>
        </div>
        
        <div className="flex gap-4 font-mono text-[0.6rem] justify-center md:justify-end w-full md:w-auto">
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            STATUS: <span className="text-[#ff4a1c]">MEMES_FOUND</span>
          </div>
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            UNITS: <span className="text-[#f4f4f5]">{filteredMemes.length}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-6">
            <div className="w-12 h-12 border-2 border-[#ff4a1c] border-t-transparent rounded-full animate-spin"></div>
            <span className="font-mono text-xs text-[#ff4a1c] animate-pulse uppercase">loading_memes...</span>
          </div>
        ) : filteredMemes.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center reveal active">
            <div className="w-16 h-16 border border-[#22222f] bg-[#111116] flex items-center justify-center mb-6 text-[#ff4a1c]">
              <iconify-icon icon="solar:minimalistic-magnifer-linear" width="32"></iconify-icon>
            </div>
            <h3 className="font-display font-[800] text-2xl text-[#f4f4f5] uppercase mb-2">No Memes Located</h3>
            <p className="font-mono text-xs text-[#8a8a98] max-w-md mb-6">
              Query <span className="text-[#ff4a1c]">"{query}"</span> returned 0 units. Try searching by mood, vibe, or different keywords.
            </p>
            <button 
              onClick={() => navigate('/results?q=ALL_UNITS')}
              className="btn-cyber-ghost px-6 py-2.5 text-xs font-mono uppercase tracking-wider text-[#8a8a98] hover:text-[#ff4a1c]"
            >
              Reset to All Units
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {filteredMemes.map((meme, i) => (
              <div 
                key={`${meme.id}-${i}`} 
                className="group relative bg-[#111116]/60 backdrop-blur-md border border-[#22222f] p-4 flex flex-col transition-all duration-300 hover:border-[#ff4a1c]/60 hover:shadow-[0_0_30px_rgba(255,74,28,0.15)] hover:-translate-y-1 rounded-sm"
                style={{ 
                  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 1.25rem), calc(100% - 1.25rem) 100%, 0 100%)'
                }}
              >
                {/* Visual Accents */}
                <div className="absolute top-0 right-0 w-12 h-[1px] bg-[#ff4a1c]/50"></div>
                <div className="absolute bottom-6 right-0 w-[1px] h-12 bg-[#ff4a1c]/50"></div>

                {/* Consistent Image Container with Contain Fit */}
                <div className="relative h-60 w-full overflow-hidden mb-4 bg-[#070709] border border-[#22222f]/50 flex items-center justify-center p-2 rounded-sm group-hover:border-[#ff4a1c]/40 transition-colors">
                  <img 
                    src={meme.url} 
                    alt={meme.title} 
                    loading="lazy"
                    className="max-h-full max-w-full object-contain transition-all duration-300 group-hover:scale-[1.03]" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#070709]/50 via-transparent to-transparent pointer-events-none"></div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3 flex-1 px-1 pb-1">
                  {meme.caption && (
                    <p className="font-mono text-xs text-[#c0c0d0] line-clamp-2 leading-relaxed">
                      {meme.caption}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-auto pt-2">
                    {meme.result_type === 'ingestion' && (
                      <span className="font-mono text-[0.55rem] text-[#ff4a1c] bg-[#070709] border border-[#ff4a1c]/50 px-2 py-0.5 shadow-[0_0_10px_rgba(255,74,28,0.2)]">
                        DISCOVERED
                      </span>
                    )}
                    {meme.tags.map(tag => (
                      <span key={tag} className="font-mono text-[0.55rem] text-[#8a8a98] bg-[#070709] border border-[#22222f] px-2 py-0.5 group-hover:border-[#ff4a1c]/30 transition-colors">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    {meme.ingested_at && (
                      <div className="font-mono text-[0.55rem] text-[#8a8a98] text-center group-hover:text-[#c0c0d0] transition-colors duration-300">
                        {formatRelativeTime(meme.ingested_at, currentTime)}
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        if (!user) {
                          requireAuth('Authentication Required to View Meme Data', () => {
                            navigate('/preview', { state: { meme } });
                          });
                        } else {
                          navigate('/preview', { state: { meme } });
                        }
                      }}
                      className="btn-cyber w-full py-2.5 text-[0.65rem] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                      View Meme
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <span className="accoutrement-coord top-[4rem] left-1/2 -translate-x-1/2 md:translate-x-0 md:top-[10rem] md:left-[2rem]">SEC.RESULT_VIEW</span>
    </div>
  );
}
