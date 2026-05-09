import React from 'react';
import MemeSearch from './MemeSearch';
import Typewriter from './Typewriter';

const Home = ({ waveformHeights, onSearch }) => {
  return (
    <>
      {/* 01 / HERO SECTION */}
      <section className="relative pt-[clamp(4rem,10vw,8rem)] pb-[clamp(3rem,6vw,5rem)] min-h-screen flex flex-col items-start overflow-hidden z-10">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#ff4a1c]/50 to-transparent opacity-50 animate-scanline"></div>

        <div className="mx-auto w-[clamp(20rem,92vw,80rem)] relative z-10 flex flex-col items-start max-w-[72rem]">

          <div className="reveal active">
            <div className="mb-3 flex items-center gap-4 font-mono text-sm uppercase tracking-[0.2em] text-[#8a8a98]">
              <span className="px-2 py-1 border border-[#22222f] bg-[#111116] rounded-sm text-[#ff4a1c]">SYS.01</span>
              <span>Aggressive Growth • Zero Fluff</span>
            </div>

            <h1 className="font-display font-[800] text-[clamp(3.5rem,7vw,6rem)] leading-[0.95] text-[#f4f4f5] mb-2 drop-shadow-2xl">
              Stop Guessing. <br />
              <span className="block mt-2">
                <Typewriter 
                  phrases={["Dominate AI.", "Execute Faster.", "Scale Smarter.", "Build Future."]}
                  className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4a1c] to-[#ff8c42]"
                />
              </span>
            </h1>

            <p className="text-[#8a8a98] max-w-[38rem] mb-6 text-[clamp(1rem,1.2vw,1.125rem)] leading-relaxed font-medium">
              The only intelligence stream engineered for operators, builders, and decision-makers. We dissect frontier models, architectures, and market shifts so you can deploy faster than your competition.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-5">
              <button className="btn-cyber h-[3.5rem] px-10 flex items-center justify-center gap-3 text-sm font-semibold text-white uppercase tracking-wider">
                <iconify-icon icon="solar:bolt-linear" width="20"></iconify-icon> Get The Briefing
              </button>

              <button className="btn-cyber-ghost h-[3.5rem] px-8 flex items-center justify-center gap-3 text-sm font-semibold text-[#8a8a98] uppercase tracking-wider">
                Listen to Ep. 248 <iconify-icon icon="solar:arrow-right-linear" width="18"></iconify-icon>
              </button>
            </div>

            <div className="mt-6 flex items-center gap-6 border-t border-[#22222f] pt-4 max-w-[28rem]">
              <div className="flex -space-x-3">
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="User" className="w-10 h-10 rounded-full border-2 border-[#070709] object-cover grayscale" />
                <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=80" alt="User" className="w-10 h-10 rounded-full border-2 border-[#070709] object-cover grayscale" />
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" alt="User" className="w-10 h-10 rounded-full border-2 border-[#070709] object-cover grayscale" />
                <div className="w-10 h-10 rounded-full border-2 border-[#070709] bg-[#1a1a24] flex items-center justify-center text-[0.6rem] font-mono text-[#ff4a1c]">+1.2M</div>
              </div>
              <div className="font-mono text-xs text-[#8a8a98] uppercase leading-tight">
                Active builders<br />tuning in weekly
              </div>
            </div>
          </div>
        </div>
        <span className="accoutrement-coord" style={{ bottom: '2rem', right: '2rem' }}>LOC: 40.7128° N, 74.0060° W</span>
      </section>

      {/* 01.5 / ARCHIVE RECON (SEARCH) */}
      <MemeSearch onSearch={onSearch} />
    </>
  );
};

export default React.memo(Home);
