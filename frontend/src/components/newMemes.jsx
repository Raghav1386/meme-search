import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { formatRelativeTime } from '../utils/time';

export default function NewMemes({ user, requireAuth }) {
  const [memes, setMemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchMemes = async () => {
      setLoading(true);
      try {
        const rawApiUrl = import.meta.env.VITE_API_URL || '';
        const apiUrl = rawApiUrl.replace(/\/+$/, '');
        
        const res = await fetch(`${apiUrl}/api/ingestion/memes?limit=20`);
        if (!res.ok) throw new Error('Failed to fetch newly ingested memes');
        const data = await res.json();
        
        const formattedMemes = data.map(m => ({
          id: m.b2_key,
          title: m.caption || m.b2_key,
          caption: m.caption || '',
          ocr_text: m.ocr_text || '',
          url: m.url.startsWith('http') ? m.url : `${apiUrl}${m.url}`,
          tags: m.format ? [m.format] : [],
          format: m.format,
          platform: m.platform,
          ingested_at: m.ingested_at
        }));
        
        setMemes(formattedMemes);
      } catch (error) {
        console.error('Error fetching new memes:', error);
        setMemes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMemes();
  }, [user, navigate]);

  return (
    <div className="pt-32 pb-20 min-h-screen relative z-10">
      
      {/* HEADER SECTION */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 mb-12 flex flex-col md:flex-row justify-between items-center md:items-end gap-6 text-center md:text-left reveal active">
        <div className="w-full md:w-auto flex flex-col items-center md:items-start">
          <div className="flex items-center justify-center md:justify-start gap-3 font-mono text-[0.65rem] text-[#ff4a1c] mb-3 uppercase tracking-widest w-full">
            <span className="w-2 h-2 bg-[#ff4a1c] animate-pulse"></span>
            <span>Meme Database // New Arrivals</span>
          </div>
          <h1 className="font-display font-[800] text-4xl md:text-5xl text-[#f4f4f5] leading-none mb-6">
            New <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4a1c] to-[#ff8c42]">Arrivals.</span>
          </h1>
        </div>
        
        <div className="flex gap-4 font-mono text-[0.6rem] justify-center md:justify-end w-full md:w-auto">
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            STATUS: <span className="text-[#ff4a1c]">INGESTION_SYNCED</span>
          </div>
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            NEW UNITS: <span className="text-[#f4f4f5]">{memes.length}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-6">
            <div className="w-12 h-12 border-2 border-[#ff4a1c] border-t-transparent rounded-full animate-spin"></div>
            <span className="font-mono text-xs text-[#ff4a1c] animate-pulse uppercase">loading_memes...</span>
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
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3 flex-1 px-2 pb-2">
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {meme.platform && (
                      <span className="font-mono text-[0.55rem] text-[#ff4a1c] bg-[#070709] border border-[#ff4a1c]/30 px-2 py-0.5">
                        {meme.platform.toUpperCase()}
                      </span>
                    )}
                    {meme.tags.map(tag => (
                      <span key={tag} className="font-mono text-[0.55rem] text-[#8a8a98] bg-[#070709] border border-[#22222f] px-2 py-0.5 group-hover:border-[#ff4a1c]/30 transition-colors">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
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
                      className="btn-cyber w-full py-3 text-[0.65rem] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                      View Meme
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {memes.length === 0 && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 text-center py-20">
                <span className="font-mono text-[#8a8a98]">NO_NEW_MEMES_FOUND</span>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="accoutrement-coord top-[4rem] left-1/2 -translate-x-1/2 md:translate-x-0 md:top-[10rem] md:left-[2rem]">SEC.NEW_VIEW</span>
    </div>
  );
}
