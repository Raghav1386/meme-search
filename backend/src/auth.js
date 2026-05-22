import {
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "firebase/auth";

import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp
} from "firebase/firestore";

import {
  auth,
  db,
  googleProvider,
  facebookProvider
} from "./firebase";


// SAVE USER TO FIRESTORE
const saveUser = async (user) => {

  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      name: user.displayName || "",
      email: user.email,
      photo: user.photoURL || "",
      lastLogin: serverTimestamp()
    },
    { merge: true }
  );

};


// GOOGLE LOGIN
export const loginWithGoogle = async () => {

  try {

    const result =
      await signInWithPopup(
        auth,
        googleProvider
      );

    await saveUser(result.user);

    return result.user;

  } catch (error) {
    console.log(error);
  }

};


// FACEBOOK LOGIN
export const loginWithFacebook = async () => {

  try {

    const result =
      await signInWithPopup(
        auth,
        facebookProvider
      );

    await saveUser(result.user);

    return result.user;

  } catch (error) {
    console.log(error);
  }

};


// EMAIL SIGNUP
export const signupWithEmail = async (
  email,
  password
) => {

  try {

    const result =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await saveUser(result.user);

    return result.user;

  } catch (error) {
    console.log(error);
  }

};


// EMAIL LOGIN
export const loginWithEmail = async (
  email,
  password
) => {

  try {

    const result =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    await saveUser(result.user);

    return result.user;

  } catch (error) {
    console.log(error);
  }

};


// LOGOUT
export const logoutUser = async () => {

  await signOut(auth);

};


// SAVE HISTORY
export const saveHistory = async (
  uid,
  search,
  result
) => {

  try {

    await addDoc(
      collection(
        db,
        "users",
        uid,
        "history"
      ),
      {
        search,
        result,
        createdAt: serverTimestamp()
      }
    );

  } catch (error) {
    console.log(error);
  }

};


// AUTH STATE
export const listenAuthState = (
  callback
) => {

  return onAuthStateChanged(
    auth,
    callback
  );

};