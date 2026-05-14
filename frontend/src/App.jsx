import React, { useEffect, useMemo, useState, memo } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import BackgroundCanvas from './components/BackgroundCanvas';
import MemeResult from './components/memeResult';
import Login from './components/login';
import Sidebar from './components/sidebar';
import Home from './components/Home';

// --- SHARED COMPONENTS ---

const TrustStrip = () => (
  <section className="py-10 border-y border-[#22222f]/50 bg-[#0a0a0d] overflow-hidden relative z-10">
    <div className="absolute left-0 top-0 w-32 h-full bg-gradient-to-r from-[#070709] to-transparent z-10"></div>
    <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-[#070709] to-transparent z-10"></div>

    <div className="flex flex-col items-center mb-6">
      <span className="font-mono text-[0.8rem] uppercase tracking-widest text-[#8a8a98]">Tactical Intel Trusted By Operators At</span>
    </div>

    <div className="animate-marquee flex items-center gap-16 md:gap-32 px-8 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
      <div className="flex gap-16 md:gap-32 font-display font-[800] text-2xl text-[#f4f4f5]">
        <span>OPENAI</span>
        <span>ANTHROPIC</span>
        <span>DEEPMIND</span>
        <span>COHERE</span>
        <span>MISTRAL</span>
        <span>META</span>
        <span>NVIDIA</span>
      </div>
      <div className="flex gap-16 md:gap-32 font-display font-[800] text-2xl text-[#f4f4f5]">
        <span>OPENAI</span>
        <span>ANTHROPIC</span>
        <span>DEEPMIND</span>
        <span>COHERE</span>
        <span>MISTRAL</span>
        <span>META</span>
        <span>NVIDIA</span>
      </div>
    </div>
  </section>
);

const NewsletterSection = () => (
  <section className="py-16 md:py-24 lg:py-32 relative z-10 bg-[#070709] border-t border-[#ff4a1c]/30 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#ff4a1c] opacity-[0.08] blur-[100px] pointer-events-none rounded-full"></div>

    <div className="reveal max-w-[40rem] w-full relative z-10">
      <div className="w-16 h-16 bg-[#111116] border border-[#ff4a1c]/50 rounded-full flex items-center justify-center text-[#ff4a1c] mx-auto mb-8 animate-node">
        <iconify-icon icon="solar:bolt-bold" width="28"></iconify-icon>
      </div>

      <h2 className="font-display font-[800] text-3xl md:text-5xl lg:text-6xl leading-[1] text-[#f4f4f5] mb-6">Growth doesn't wait.</h2>
      <p className="text-[#8a8a98] mb-12 text-base md:text-lg font-medium">Get the briefing every Thursday. What dropped, why it matters, how to architect it. Join 42,000 operators who build the future.</p>

      <form className="flex flex-col sm:flex-row gap-0 w-full mb-8 relative group" onSubmit={(e) => e.preventDefault()}>
        <div className="flex-1 relative border border-[#22222f] bg-[#0a0a0d] p-1 group-focus-within:border-[#ff4a1c]/60 transition-colors flex items-center" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 1rem), calc(100% - 1rem) 100%, 0 100%)' }}>
          <iconify-icon icon="solar:letter-linear" width="20" className="text-[#8a8a98] ml-4"></iconify-icon>
          <input type="email" placeholder="ENTER_EMAIL_ADDRESS..." required className="w-full bg-transparent px-4 py-4 text-sm font-mono text-[#f4f4f5] placeholder:text-[#22222f] focus:outline-none focus:ring-0" />
        </div>

        <button type="submit" className="btn-cyber w-full sm:w-auto mt-4 sm:mt-0 sm:-ml-4 h-[4.5rem] px-10 text-sm font-bold text-white uppercase tracking-widest shrink-0 border-l border-[#070709] flex items-center justify-center">
          Initialize
        </button>
      </form>

      <div className="font-mono text-[0.75rem] text-[#8a8a98] flex items-center justify-center gap-4 uppercase">
        <span><span className="text-[#ff4a1c]">●</span> ZERO SPAM</span>
        <span><span className="text-[#ff4a1c]">●</span> ONE CLICK UNSUBSCRIBE</span>
      </div>
    </div>
  </section>
);

// --- MAIN APP CONTENT COMPONENT ---
function AppContent() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('nexus_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Core Telemetry Error:', e);
      return [];
    }
  });

  const handleLogin = (userData) => {
    setUser(userData);
    const pendingSearch = localStorage.getItem('pending_search_query');
    if (pendingSearch) {
      addToHistory(pendingSearch);
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  const addToHistory = (query) => {
    setSearchHistory(prev => {
      const newHistory = [
        { id: Date.now(), query, timestamp: new Date().toLocaleTimeString(), strength: Math.floor(Math.random() * 40) + 60 },
        ...prev.filter(h => h.query !== query)
      ].slice(0, 10);
      localStorage.setItem('nexus_search_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  // Waveform heights memoized to prevent flicker on re-renders
  const waveformHeights = useMemo(() => {
    return Array.from({ length: 60 }, () => Math.random() * 100);
  }, []);

  // Optimized Intersection Observer
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          requestAnimationFrame(() => {
            entry.target.classList.add('active');
          });
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [location.pathname]); // Re-observe on route change

  return (
    <div className="selection:bg-[#ff4a1c] selection:text-white relative bg-[#070709] min-h-screen text-[#f4f4f5] font-sans">
      
      <BackgroundCanvas />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#070709]/70 backdrop-blur-xl border-b border-[#22222f]/50">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-[4.5rem]">

          {/* Logo */}
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 border border-[#22222f] bg-[#111116] flex items-center justify-center text-[#ff4a1c] hover:bg-[#ff4a1c] hover:text-white transition-all duration-300"
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}
              aria-label="Toggle System Menu"
            >
              <iconify-icon icon="solar:hamburger-menu-linear" width="20"></iconify-icon>
            </button>

            <Link to="/" className="flex items-center gap-3 group">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#ff4a1c] group-hover:scale-110 transition-transform duration-300">
                <path d="M16 2L2 9L16 16L30 9L16 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"></path>
                <path d="M2 23L16 30L30 23" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"></path>
                <path d="M2 16L16 23L30 16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"></path>
              </svg>
              <span className="font-display font-[800] text-xl tracking-tighter text-[#f4f4f5]">NEXUS</span>
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-10 text-sm font-mono font-medium text-[#8a8a98]">
            <a href="/#intel" className="relative hover:text-[#f4f4f5] transition-colors accoutrement-bracket uppercase">Intelligence</a>
            <a href="/#dashboard" className="relative hover:text-[#f4f4f5] transition-colors accoutrement-bracket uppercase">Platform</a>
            <a href="/#manifesto" className="relative hover:text-[#f4f4f5] transition-colors accoutrement-bracket uppercase">Manifesto</a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-widest leading-none mb-1 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full animate-pulse"></span> OPERATOR_ONLINE
                  </span>
                  <span className="font-display font-bold text-sm text-[#f4f4f5] uppercase">{user.name || user.username}</span>
                </div>
                <button onClick={handleLogout} className="btn-cyber-ghost text-[0.65rem] px-4 py-2 uppercase tracking-widest font-mono text-[#8a8a98] hover:text-[#ff4a1c]">
                  Sign Out
                </button>
              </div>
            ) : (
              <>
                <span className="font-mono text-[0.75rem] text-[#ff4a1c] animate-pulse uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> Live Network
                </span>
                <Link to="/login" className="btn-cyber text-[#f4f4f5] font-semibold text-sm px-6 py-2.5 uppercase tracking-wide">Join Roster</Link>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <button className="md:hidden text-[#f4f4f5]" aria-label="Mobile Menu">
            <iconify-icon icon="solar:hamburger-menu-linear" width="28" height="28"></iconify-icon>
          </button>
        </div>
      </nav>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        history={searchHistory}
        onClearHistory={() => {
          setSearchHistory([]);
          localStorage.removeItem('nexus_search_history');
        }}
        user={user}
      />

      <Routes>
        <Route path="/" element={<Home waveformHeights={waveformHeights} onSearch={addToHistory} history={searchHistory} user={user} />} />
        <Route path="/results" element={<MemeResult />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
      </Routes>

      {/* PERSISTENT SECTIONS - ONLY ON LANDING PAGE */}
      {location.pathname === '/' && (
        <>
          <TrustStrip />
          <NewsletterSection />
        </>
      )}

      {/* FOOTER - ONLY ON LANDING PAGE */}
      {location.pathname === '/' && (
        <footer className="bg-[#070709] pt-16 pb-8 border-t border-[#22222f] relative z-10 font-mono text-xs">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">

            <div className="col-span-1 md:col-span-2">
              <Link to="/" className="flex items-center gap-2 mb-6 text-[#f4f4f5]">
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#ff4a1c]">
                  <path d="M16 2L2 9L16 16L30 9L16 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"></path>
                  <path d="M2 23L16 30L30 23" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"></path>
                  <path d="M2 16L16 23L30 16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"></path>
                </svg>
                <span className="font-display font-[800] text-lg tracking-tighter uppercase font-bold">NEXUS</span>
              </Link>
              <p className="text-[#8a8a98] max-w-sm mb-6 leading-relaxed">The only AI intelligence stream engineered for operators, builders, and decision-makers. Execute with absolute clarity.</p>
              <div className="flex gap-4">
                <a href="#" className="w-8 h-8 rounded border border-[#22222f] flex items-center justify-center text-[#8a8a98] hover:text-[#ff4a1c] hover:border-[#ff4a1c] transition-colors"><iconify-icon icon="solar:twitter-linear"></iconify-icon></a>
                <a href="#" className="w-8 h-8 rounded border border-[#22222f] flex items-center justify-center text-[#8a8a98] hover:text-[#ff4a1c] hover:border-[#ff4a1c] transition-colors"><iconify-icon icon="solar:play-circle-linear"></iconify-icon></a>
                <a href="#" className="w-8 h-8 rounded border border-[#22222f] flex items-center justify-center text-[#8a8a98] hover:text-[#ff4a1c] hover:border-[#ff4a1c] transition-colors"><iconify-icon icon="solar:podcast-linear"></iconify-icon></a>
              </div>
            </div>

            <div>
              <h5 className="text-[#f4f4f5] uppercase tracking-wider mb-4 border-b border-[#22222f] pb-2 font-bold">Platform</h5>
              <ul className="flex flex-col gap-3 text-[#8a8a98]">
                <li><Link to="/results" className="hover:text-[#ff4a1c] transition-colors">Meme Archives</Link></li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors">Data Matrix</a></li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors">Manifesto</a></li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors">Sponsorships</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-[#f4f4f5] uppercase tracking-wider mb-4 border-b border-[#22222f] pb-2 font-bold">System</h5>
              <ul className="flex flex-col gap-3 text-[#8a8a98]">
                <li><span className="text-[#ff4a1c]">STATUS:</span> OPERATIONAL</li>
                <li><span className="text-[#ff4a1c]">LATENCY:</span> 12ms</li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors underline decoration-[#22222f]">Privacy Protocol</a></li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors underline decoration-[#22222f]">Terms of Service</a></li>
              </ul>
            </div>

          </div>

          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center pt-8 border-t border-[#22222f] text-[#22222f] text-sm">
            <p>© {new Date().getFullYear()} NEXUS INTELLIGENCE. ALL RIGHTS RESERVED.</p>
            <p>DESIGNED FOR THE BUILDERS.</p>
          </div>
        </footer>
      )}

    </div>
  );
}

// --- APP WRAPPER COMPONENT ---
function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default memo(App);