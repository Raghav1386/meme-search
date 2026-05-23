import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, facebookProvider, db } from '../firebase';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
  });

  // Reveal effect trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.reveal-login').forEach(el => el.classList.add('active'));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLoginSuccess = (user) => {
    // Save minimal user profile for user counting in the background
    if (user && user.uid) {
      setDoc(doc(db, 'users', user.uid), {
        email: user.username || null,
        name: user.name || null,
        loginMethod: user.method || 'Unknown',
        lastLogin: new Date().toISOString()
      }, { merge: true }).catch(e => console.error("Error saving user profile:", e));
    }

    onLogin(user);
    const pendingSearch = localStorage.getItem('pending_search_query');
    if (pendingSearch) {
      localStorage.removeItem('pending_search_query');
      navigate(`/results?q=${encodeURIComponent(pendingSearch)}`);
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsAuthenticating(true);
    try {
      if (isLogin) {
        // We use username as the email address during login for Firebase
        const userCredential = await signInWithEmailAndPassword(auth, formData.username, formData.password);
        handleLoginSuccess({ 
          username: userCredential.user.email, 
          name: userCredential.user.displayName || formData.username,
          uid: userCredential.user.uid,
          method: 'Email'
        });
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        handleLoginSuccess({ 
          username: formData.username, 
          name: formData.username,
          email: formData.email,
          uid: userCredential.user.uid,
          method: 'Email'
        });
      }
    } catch (err) {
      console.error("Auth Error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg("THIS EMAIL IS ALREADY REGISTERED. PLEASE SWITCH TO 'SIGN IN'.");
      } else if (err.code === 'auth/invalid-credential') {
        setErrorMsg("INCORRECT EMAIL OR PASSWORD.");
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg("PASSWORD IS TOO WEAK (MUST BE AT LEAST 6 CHARACTERS).");
      } else {
        setErrorMsg(err.message);
      }
      setIsAuthenticating(false);
    }
  };

  const handleSocialLogin = async (platform) => {
    setErrorMsg(null);
    try {
      const provider = platform === 'Google' ? googleProvider : facebookProvider;
      const userCredential = await signInWithPopup(auth, provider);
      handleLoginSuccess({ 
        username: userCredential.user.email, 
        name: userCredential.user.displayName,
        uid: userCredential.user.uid,
        method: platform
      });
    } catch (err) {
      console.error("Social Auth Error:", err);
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="pt-[10rem] pb-[6rem] min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      {/* Decorative Scanline */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#ff4a1c]/50 to-transparent opacity-30 animate-scanline pointer-events-none"></div>
      
      {/* Background Accent Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#ff4a1c] opacity-[0.05] blur-[120px] pointer-events-none rounded-full"></div>

      <div className="w-full max-w-[28rem] relative z-10 reveal-login opacity-0 translate-y-8 transition-all duration-700 ease-out">
        
        {/* Main Card */}
        <div className="bg-[#0a0a0d]/80 backdrop-blur-2xl border border-[#22222f] shadow-2xl relative overflow-hidden" 
             style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 2rem), calc(100% - 2rem) 100%, 0 100%)' }}>
          
          {/* Header */}
          <div className="p-8 border-b border-[#22222f] relative">
            <div className="absolute top-0 right-0 p-4 font-mono text-[0.6rem] text-[#ff4a1c] opacity-40">
              SYS_AUTH.v1
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-sm bg-[#ff4a1c] flex items-center justify-center text-white">
                <iconify-icon icon={isAuthenticating ? "eos-icons:loading" : "solar:lock-password-bold"} width="20"></iconify-icon>
              </div>
              <h2 className="font-display font-[800] text-2xl text-[#f4f4f5]">
                {isAuthenticating ? 'Validating...' : (isLogin ? 'Initialize' : 'Register')}
              </h2>
            </div>
            <p className="text-[#8a8a98] text-xs font-mono uppercase tracking-widest leading-relaxed">
              {isAuthenticating ? 'Syncing with secure network' : (isLogin ? 'Access the intelligence matrix' : 'Join the roster of operators')}
            </p>
          </div>

          {!isAuthenticating && (
            <>
              {/* Mode Switcher */}
              <div className="flex border-b border-[#22222f]">
                <button 
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-4 text-[0.65rem] font-mono uppercase tracking-[0.2em] transition-all ${isLogin ? 'text-[#ff4a1c] bg-[#111116]' : 'text-[#8a8a98] hover:text-[#f4f4f5] hover:bg-[#070709]'}`}
                >
                  Sign In
                </button>
                <button 
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-4 text-[0.65rem] font-mono uppercase tracking-[0.2em] transition-all ${!isLogin ? 'text-[#ff4a1c] bg-[#111116]' : 'text-[#8a8a98] hover:text-[#f4f4f5] hover:bg-[#070709]'}`}
                >
                  Create Account
                </button>
              </div>

              {/* Form */}
              <form className="p-8 space-y-6" onSubmit={handleSubmit}>
                {!isLogin && (
                  <div className="space-y-2">
                    <label className="block font-mono text-[0.65rem] text-[#8a8a98] uppercase tracking-widest ml-1">Email_Address</label>
                    <div className="relative group">
                      <input 
                        type="email" 
                        name="email"
                        required={!isLogin}
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full bg-[#070709] border border-[#22222f] px-4 py-3 text-sm font-mono text-[#f4f4f5] focus:outline-none focus:border-[#ff4a1c]/60 transition-colors placeholder:text-[#22222f]"
                        placeholder="ENTER_EMAIL..."
                        style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.75rem), calc(100% - 0.75rem) 100%, 0 100%)' }}
                      />
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#ff4a1c]/20 pointer-events-none transition-colors group-focus-within:bg-[#ff4a1c]/40"></div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block font-mono text-[0.65rem] text-[#8a8a98] uppercase tracking-widest ml-1">Username</label>
                  <div className="relative group">
                    <input 
                      type="text" 
                      name="username"
                      required
                      value={formData.username}
                      onChange={handleChange}
                      className="w-full bg-[#070709] border border-[#22222f] px-4 py-3 text-sm font-mono text-[#f4f4f5] focus:outline-none focus:border-[#ff4a1c]/60 transition-colors placeholder:text-[#22222f]"
                      placeholder="IDENTIFIER..."
                      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.75rem), calc(100% - 0.75rem) 100%, 0 100%)' }}
                    />
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#ff4a1c]/20 pointer-events-none transition-colors group-focus-within:bg-[#ff4a1c]/40"></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="font-mono text-[0.65rem] text-[#8a8a98] uppercase tracking-widest">Password</label>
                    {isLogin && (
                      <button type="button" className="text-[0.6rem] font-mono text-[#ff4a1c] uppercase hover:underline">Forgot?</button>
                    )}
                  </div>
                  <div className="relative group">
                    <input 
                      type="password" 
                      name="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full bg-[#070709] border border-[#22222f] px-4 py-3 text-sm font-mono text-[#f4f4f5] focus:outline-none focus:border-[#ff4a1c]/60 transition-colors placeholder:text-[#22222f]"
                      placeholder="PASSCODE..."
                      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.75rem), calc(100% - 0.75rem) 100%, 0 100%)' }}
                    />
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#ff4a1c]/20 pointer-events-none transition-colors group-focus-within:bg-[#ff4a1c]/40"></div>
                  </div>
                </div>
                {errorMsg && (
                  <div className="text-[#ff4a1c] text-xs font-mono uppercase tracking-widest bg-[#ff4a1c]/10 border border-[#ff4a1c]/20 p-3 rounded-sm">
                    {errorMsg}
                  </div>
                )}

                <button type="submit" className="btn-cyber w-full py-4 text-xs font-[900] text-white uppercase tracking-[0.25em] shadow-[0_0_20px_rgba(255,74,28,0.2)]">
                  {isLogin ? 'Execute Authentication' : 'Create Intelligence Profile'}
                </button>
              </form>

              {/* Social Logins */}
              <div className="p-8 pt-0 space-y-4">
                <div className="flex items-center gap-4 text-[#22222f]">
                  <div className="h-[1px] flex-1 bg-[#22222f]"></div>
                  <span className="font-mono text-[0.6rem] uppercase tracking-widest">or via external network</span>
                  <div className="h-[1px] flex-1 bg-[#22222f]"></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleSocialLogin('Google')}
                    className="flex items-center justify-center gap-3 bg-[#070709] border border-[#22222f] py-3 text-[0.65rem] font-mono uppercase tracking-widest text-[#8a8a98] hover:text-[#f4f4f5] hover:border-[#ff4a1c]/40 transition-all" 
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}>
                    <iconify-icon icon="logos:google-icon" width="16"></iconify-icon>
                    Google
                  </button>
                  <button 
                    onClick={() => handleSocialLogin('Facebook')}
                    className="flex items-center justify-center gap-3 bg-[#070709] border border-[#22222f] py-3 text-[0.65rem] font-mono uppercase tracking-widest text-[#8a8a98] hover:text-[#f4f4f5] hover:border-[#ff4a1c]/40 transition-all"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 0.5rem), calc(100% - 0.5rem) 100%, 0 100%)' }}>
                    <iconify-icon icon="logos:facebook" width="16"></iconify-icon>
                    Facebook
                  </button>
                </div>
              </div>
            </>
          )}

          {isAuthenticating && (
            <div className="p-12 flex flex-col items-center justify-center h-[400px] text-center">
               <div className="w-16 h-16 border-2 border-[#ff4a1c]/20 border-t-[#ff4a1c] border-r-[#ff4a1c] rounded-full animate-spin mb-8"></div>
               <p className="font-mono text-sm text-[#ff4a1c] animate-pulse">ESTABLISHING_LINK...</p>
               <p className="text-[#8a8a98] text-xs mt-4 uppercase tracking-[0.2em]">Verifying encrypted credentials</p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-8 flex justify-center items-center gap-8 font-mono text-[0.6rem] text-[#22222f] uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#ff4a1c] rounded-full animate-pulse"></div>
            Secure Protocol
          </div>
          <div>AES-256 Enabled</div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .reveal-login.active {
          opacity: 1;
          transform: translateY(0);
        }
      `}} />
    </div>
  );
}
