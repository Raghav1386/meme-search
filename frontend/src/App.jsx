import React, { useEffect, useMemo, useState, memo } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getCountFromServer } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import BackgroundCanvas from './components/BackgroundCanvas';
import MemeResult from './components/memeResult';
import Login from './components/login';
import Sidebar from './components/sidebar';
import Home from './components/Home';
import Preview from './components/preview';
import UserProfileSidebar from './components/UserProfileSidebar';
import AuthModal from './components/AuthModal';

// --- SHARED COMPONENTS ---

const TrustStrip = () => (
  <section className="py-10 border-y border-[#22222f]/50 bg-[#0a0a0d] overflow-hidden relative z-10">
    <div className="absolute left-0 top-0 w-32 h-full bg-gradient-to-r from-[#070709] to-transparent z-10"></div>
    <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-[#070709] to-transparent z-10"></div>

    <div className="flex flex-col items-center mb-6">
      <span className="font-mono text-[0.8rem] uppercase tracking-widest text-[#8a8a98]">Tactical Intel Trusted By Operators At</span>
    </div>

    <div className="animate-marquee flex items-center gap-10 md:gap-32 px-4 md:px-8 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
      <div className="flex gap-10 md:gap-32 font-display font-[800] text-xl md:text-2xl text-[#f4f4f5]">
        <span>OPENAI</span>
        <span>ANTHROPIC</span>
        <span>DEEPMIND</span>
        <span>COHERE</span>
        <span>MISTRAL</span>
        <span>META</span>
        <span>NVIDIA</span>
      </div>
      <div className="flex gap-10 md:gap-32 font-display font-[800] text-xl md:text-2xl text-[#f4f4f5]">
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

    <div className="reveal max-w-3xl w-full relative z-10">
      <div className="w-16 h-16 bg-[#111116] border border-[#ff4a1c]/50 rounded-full flex items-center justify-center text-[#ff4a1c] mx-auto mb-8 animate-node">
        <iconify-icon icon="solar:bolt-bold" width="28"></iconify-icon>
      </div>

      <h2 className="font-display font-[800] text-3xl md:text-5xl lg:text-6xl leading-[1] text-[#f4f4f5] mb-6">Memes move fast.</h2>
      <p className="text-[#8a8a98] mb-12 text-base md:text-lg font-medium">Get the top meme drops every Thursday. What went viral, why it's funny, and the lore behind it. Join 42,000 memers who stay ahead of the internet.</p>

      <form className="flex flex-col sm:flex-row gap-0 w-full mb-8 relative group" onSubmit={(e) => e.preventDefault()}>
        <div className="flex-1 relative border border-[#22222f] bg-[#0a0a0d] p-1 group-focus-within:border-[#ff4a1c]/60 transition-colors flex items-center" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 1rem), calc(100% - 1rem) 100%, 0 100%)' }}>
          <iconify-icon icon="solar:letter-linear" width="20" className="text-[#8a8a98] ml-4"></iconify-icon>
          <input type="email" placeholder="ENTER_EMAIL_ADDRESS..." required className="w-full bg-transparent px-4 py-4 text-sm font-mono text-[#f4f4f5] placeholder:text-[#22222f] focus:outline-none focus:ring-0" />
        </div>

        <button type="submit" className="btn-cyber w-full sm:w-auto mt-4 sm:mt-0 sm:-ml-4 h-[4.5rem] px-10 text-sm font-bold text-white uppercase tracking-widest shrink-0 border-l border-[#070709] flex items-center justify-center">
          Subscribe
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const [user, setUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [authModalConfig, setAuthModalConfig] = useState({ isOpen: false, message: '', onSuccess: null });

  const requireAuth = (message, onSuccess) => {
    setAuthModalConfig({ isOpen: true, message, onSuccess });
  };

  // Persist authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
          username: firebaseUser.email,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          method: firebaseUser.providerData[0]?.providerId === 'google.com' ? 'Google' : 
                  firebaseUser.providerData[0]?.providerId === 'facebook.com' ? 'Facebook' : 'Email'
        });
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch Total Users
  useEffect(() => {
    const fetchTotalUsers = async () => {
      try {
        const coll = collection(db, 'users');
        const snapshot = await getCountFromServer(coll);
        setTotalUsers(snapshot.data().count);
      } catch (err) {
        console.error("Error fetching user count:", err);
      }
    };
    fetchTotalUsers();
  }, [user]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (user && user.uid) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          let history = [];
          if (docSnap.exists() && Array.isArray(docSnap.data().searchHistory)) {
            history = docSnap.data().searchHistory;
          }
          
          const pendingSearch = localStorage.getItem('pending_search_query');
          if (pendingSearch) {
            const newEntry = { id: Date.now(), query: pendingSearch, timestamp: new Date().toLocaleTimeString(), strength: Math.floor(Math.random() * 40) + 60 };
            history = [newEntry, ...history.filter(h => h.query !== pendingSearch)].slice(0, 10);
            await setDoc(docRef, { searchHistory: history }, { merge: true });
            localStorage.removeItem('pending_search_query');
          }

          setSearchHistory(history);
        } catch (err) {
          console.error("Firestore read error:", err);
        }
      } else {
        setSearchHistory([]);
      }
    };
    fetchHistory();
  }, [user]);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
    setUser(null);
    setIsUserProfileOpen(false);
  };

  const addToHistory = async (query) => {
    const newEntry = { id: Date.now(), query, timestamp: new Date().toLocaleTimeString(), strength: Math.floor(Math.random() * 40) + 60 };
    
    // Optimistic UI update
    setSearchHistory(prev => [newEntry, ...prev.filter(h => h.query !== query)].slice(0, 10));
    
    // Remote database update
    const uid = auth.currentUser?.uid || (user && user.uid);
    if (uid) {
      try {
        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);
        let remoteHistory = [];
        if (docSnap.exists() && Array.isArray(docSnap.data().searchHistory)) {
          remoteHistory = docSnap.data().searchHistory;
        }
        
        const updatedRemoteHistory = [newEntry, ...remoteHistory.filter(h => h.query !== query)].slice(0, 10);
        await setDoc(docRef, { searchHistory: updatedRemoteHistory }, { merge: true });
      } catch (err) {
        console.error("Firestore write error:", err);
      }
    }
  };

  const clearHistory = async () => {
    setSearchHistory([]);
    const currentUser = auth.currentUser;
    if (currentUser) {
       try {
         const docRef = doc(db, 'users', currentUser.uid);
         await setDoc(docRef, { searchHistory: [] }, { merge: true });
       } catch (err) {
         console.error("Firestore write error:", err);
       }
    }
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
    <div className="selection:bg-[#ff4a1c] selection:text-white relative bg-[#070709] min-h-screen text-[#f4f4f5] font-sans overflow-x-hidden w-full">
      
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
              <span className="font-display font-[800] text-xl tracking-tighter text-[#f4f4f5]">MEME SEARCH</span>
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-10 text-sm font-mono font-medium text-[#8a8a98]">
            <a href="/#memes" className="relative hover:text-[#f4f4f5] transition-colors accoutrement-bracket uppercase">Memes</a>
            <a href="/#app" className="relative hover:text-[#f4f4f5] transition-colors accoutrement-bracket uppercase">App</a>
            <a href="/#about" className="relative hover:text-[#f4f4f5] transition-colors accoutrement-bracket uppercase">About</a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-6">
                <button onClick={() => setIsUserProfileOpen(true)} className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User Avatar" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full border border-[#22222f] object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full border border-[#22222f] bg-[#111116] flex items-center justify-center text-[#f4f4f5]">
                      {user.method === 'Google' ? <iconify-icon icon="logos:google-icon"></iconify-icon> :
                       user.method === 'Facebook' ? <iconify-icon icon="logos:facebook"></iconify-icon> :
                       <iconify-icon icon="solar:user-bold" width="18"></iconify-icon>}
                    </div>
                  )}
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-widest leading-none mb-1 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full animate-pulse"></span> OPERATOR_ONLINE
                    </span>
                    <span className="font-display font-bold text-sm text-[#f4f4f5] uppercase">{user.name || user.username}</span>
                  </div>
                </button>
              </div>
            ) : (
              <>
                <span className="font-mono text-[0.75rem] text-[#ff4a1c] animate-pulse uppercase tracking-widest flex items-center gap-2 hidden lg:flex">
                  <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> Live Network
                </span>
                <Link to="/login" className="btn-cyber-ghost text-[#f4f4f5] font-semibold text-sm px-6 py-2.5 uppercase tracking-wide">Sign In</Link>
                <Link to="/login" state={{ isSignUp: true }} className="btn-cyber text-[#f4f4f5] font-semibold text-sm px-6 py-2.5 uppercase tracking-wide">Sign Up</Link>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-[#f4f4f5]" aria-label="Mobile Menu">
            <iconify-icon icon={isMobileMenuOpen ? "solar:close-circle-linear" : "solar:hamburger-menu-linear"} width="28" height="28"></iconify-icon>
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-[4.5rem] left-0 w-full bg-[#0a0a0d] border-b border-[#22222f] p-6 flex flex-col gap-6 shadow-2xl">
            <div className="flex flex-col gap-4 font-mono text-sm uppercase text-[#8a8a98]">
              <a href="/#memes" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#f4f4f5]">Memes</a>
              <a href="/#app" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#f4f4f5]">App</a>
              <a href="/#about" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#f4f4f5]">About</a>
            </div>
            
            <div className="h-[1px] bg-[#22222f] w-full"></div>
            
            <div className="flex flex-col gap-4">
              {user ? (
                <>
                  <button onClick={() => { setIsUserProfileOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-3 w-full text-left hover:bg-[#111116] p-2 rounded transition-colors">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="User Avatar" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full border border-[#22222f] object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full border border-[#22222f] bg-[#111116] flex items-center justify-center text-[#f4f4f5]">
                        {user.method === 'Google' ? <iconify-icon icon="logos:google-icon"></iconify-icon> :
                         user.method === 'Facebook' ? <iconify-icon icon="logos:facebook"></iconify-icon> :
                         <iconify-icon icon="solar:user-bold" width="18"></iconify-icon>}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-mono text-[0.75rem] text-[#ff4a1c] uppercase tracking-widest leading-none mb-1 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full animate-pulse"></span> OPERATOR_ONLINE
                      </span>
                      <span className="font-display font-bold text-sm text-[#f4f4f5] uppercase">{user.name || user.username}</span>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <span className="font-mono text-[0.75rem] text-[#ff4a1c] animate-pulse uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full"></span> Live Network
                  </span>
                  <Link onClick={() => setIsMobileMenuOpen(false)} to="/login" className="btn-cyber-ghost flex items-center justify-center text-[#f4f4f5] font-semibold text-sm px-6 py-3 uppercase tracking-wide text-center w-full">Sign In</Link>
                  <Link onClick={() => setIsMobileMenuOpen(false)} to="/login" state={{ isSignUp: true }} className="btn-cyber flex items-center justify-center text-[#f4f4f5] font-semibold text-sm px-6 py-3 uppercase tracking-wide text-center w-full">Sign Up</Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        history={searchHistory}
        onClearHistory={clearHistory}
        user={user}
        totalUsers={totalUsers}
      />

      <UserProfileSidebar 
        isOpen={isUserProfileOpen} 
        onClose={() => setIsUserProfileOpen(false)} 
        user={user}
        onSignOut={handleLogout}
        onSwitchAccount={() => setAuthModalConfig({ isOpen: true, message: 'Authenticate new user profile', onSuccess: null })}
      />

      <AuthModal 
        isOpen={authModalConfig.isOpen}
        onClose={() => setAuthModalConfig({ isOpen: false, message: '', onSuccess: null })}
        message={authModalConfig.message}
        onLoginSuccess={(userData) => {
          handleLogin(userData);
          if (authModalConfig.onSuccess) authModalConfig.onSuccess();
        }}
      />

      <Routes>
        <Route path="/" element={<Home waveformHeights={waveformHeights} onSearch={addToHistory} history={searchHistory} user={user} requireAuth={requireAuth} />} />
        <Route path="/results" element={<MemeResult user={user} requireAuth={requireAuth} onSearch={addToHistory} />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/preview" element={<Preview user={user} />} />
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
                <span className="font-display font-[800] text-lg tracking-tighter uppercase font-bold">MEME SEARCH</span>
              </Link>
              <p className="text-[#8a8a98] max-w-lg mb-6 leading-relaxed">The ultimate meme search engine for creators, memers, and internet explorers. Find the perfect meme instantly.</p>
              <div className="flex gap-4">
                <a href="#" className="w-8 h-8 rounded border border-[#22222f] flex items-center justify-center text-[#8a8a98] hover:text-[#ff4a1c] hover:border-[#ff4a1c] transition-colors"><iconify-icon icon="solar:twitter-linear"></iconify-icon></a>
                <a href="#" className="w-8 h-8 rounded border border-[#22222f] flex items-center justify-center text-[#8a8a98] hover:text-[#ff4a1c] hover:border-[#ff4a1c] transition-colors"><iconify-icon icon="solar:play-circle-linear"></iconify-icon></a>
                <a href="#" className="w-8 h-8 rounded border border-[#22222f] flex items-center justify-center text-[#8a8a98] hover:text-[#ff4a1c] hover:border-[#ff4a1c] transition-colors"><iconify-icon icon="solar:podcast-linear"></iconify-icon></a>
              </div>
            </div>

            <div>
              <h5 className="text-[#f4f4f5] uppercase tracking-wider mb-4 border-b border-[#22222f] pb-2 font-bold">App</h5>
              <ul className="flex flex-col gap-3 text-[#8a8a98]">
                <li><Link to="/results" className="hover:text-[#ff4a1c] transition-colors">Meme Archives</Link></li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors">Data Matrix</a></li>
                <li><a href="#" className="hover:text-[#ff4a1c] transition-colors">About</a></li>
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
            <p>© {new Date().getFullYear()} MEME SEARCH. ALL RIGHTS RESERVED.</p>
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