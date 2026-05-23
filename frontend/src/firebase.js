import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAWW9yxOaEpCx3UydeWmmIh3F0lCaeRPYQ",
  authDomain: "meme-search-auth-81a29.firebaseapp.com",
  projectId: "meme-search-auth-81a29",
  storageBucket: "meme-search-auth-81a29.firebasestorage.app",
  messagingSenderId: "87214196278",
  appId: "1:87214196278:web:f3b4149c3513c3621e3a97",
  measurementId: "G-EGYLRRGRXS"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
export const db = getFirestore(app);
