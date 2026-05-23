import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Preview({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { meme } = location.state || {};
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!meme) {
      navigate('/results'); // Fallback if no meme is passed
      return;
    }
    
    const timer = setTimeout(() => {
      document.querySelectorAll('.reveal-preview').forEach(el => el.classList.add('active'));
    }, 100);
    return () => clearTimeout(timer);
  }, [user, meme, navigate]);

  if (!meme) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(meme.url);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Get filename from key or title
      const filename = meme.id.split('/').pop() || `meme_artifact_${Date.now()}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 min-h-screen relative z-10 flex flex-col">
      {/* Decorative Scanline */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#ff4a1c]/50 to-transparent opacity-30 animate-scanline pointer-events-none"></div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 mb-8 flex justify-between items-center reveal-preview opacity-0 translate-y-8 transition-all duration-700 ease-out">
        <button 
          onClick={() => navigate(-1)} 
          className="btn-cyber-ghost flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#8a8a98] hover:text-[#ff4a1c] transition-colors py-2 px-4 border border-transparent hover:border-[#22222f] bg-transparent"
        >
          <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
          Return to Archives
        </button>
        
        <div className="flex gap-4 font-mono text-[0.6rem]">
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98] hidden sm:block">
            ARTIFACT: <span className="text-[#ff4a1c] truncate max-w-[150px] inline-block align-bottom">{meme.id.split('/').pop()}</span>
          </div>
          <div className="px-4 py-2 bg-[#111116] border border-[#22222f] text-[#8a8a98]">
            FORMAT: <span className="text-[#f4f4f5] uppercase">{meme.format || 'unknown'}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 flex-1 flex flex-col lg:flex-row gap-8 items-center justify-center reveal-preview opacity-0 translate-y-8 transition-all duration-700 delay-100 ease-out">
        
        {/* Main Image Container */}
        <div className="flex-1 w-full relative bg-[#111116]/40 backdrop-blur-md border border-[#22222f] p-4 group" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 2rem), calc(100% - 2rem) 100%, 0 100%)' }}>
          <div className="absolute top-0 right-0 w-16 h-[1px] bg-[#ff4a1c]/50"></div>
          <div className="absolute bottom-8 right-0 w-[1px] h-16 bg-[#ff4a1c]/50"></div>
          
          <div className="relative w-full aspect-auto flex items-center justify-center bg-[#070709] overflow-hidden rounded-sm min-h-[40vh] lg:min-h-[60vh] p-2">
            <img 
              src={meme.url} 
              alt={meme.title} 
              className="max-w-full max-h-[70vh] object-contain object-center"
            />
          </div>
        </div>

        {/* Sidebar Info & Actions */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
          <div className="bg-[#111116]/60 backdrop-blur-md border border-[#22222f] p-6" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 1.5rem), calc(100% - 1.5rem) 100%, 0 100%)' }}>
            <h1 className="font-display font-[800] text-xl md:text-2xl text-[#f4f4f5] tracking-tight uppercase mb-4 break-words">
              {meme.title.split('/').pop() || meme.id}
            </h1>
            
            <div className="flex flex-wrap gap-2 mb-8">
              {meme.tags && meme.tags.map(tag => (
                <span key={tag} className="font-mono text-[0.6rem] text-[#8a8a98] bg-[#070709] border border-[#22222f] px-2 py-1 uppercase">
                  #{tag}
                </span>
              ))}
            </div>

            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className="btn-cyber w-full py-4 text-xs font-[900] text-white uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(255,74,28,0.2)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_30px_rgba(255,74,28,0.4)] transition-all"
            >
              {isDownloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Extracting...
                </>
              ) : (
                <>
                  <iconify-icon icon="solar:download-square-linear" width="18"></iconify-icon>
                  Download Artifact
                </>
              )}
            </button>
          </div>
          
          <div className="bg-[#0a0a0d] border border-[#22222f] p-4 text-[#8a8a98] font-mono text-[0.6rem] uppercase tracking-widest leading-relaxed">
            <p className="mb-2"><span className="text-[#ff4a1c]">WARNING:</span> Unauthorized distribution of memes is strictly prohibited by central command.</p>
            <p>Clearance Level: <span className="text-[#f4f4f5]">OPERATOR</span></p>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .reveal-preview.active {
          opacity: 1;
          transform: translateY(0);
        }
      `}} />
    </div>
  );
}
