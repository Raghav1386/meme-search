// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);