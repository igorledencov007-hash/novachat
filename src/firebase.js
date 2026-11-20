
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBxhftLXORB-_hi8dAur2FgyGVxhO9X7I4",
  authDomain: "novachat-5bf73.firebaseapp.com",
  projectId: "novachat-5bf73",
  storageBucket: "novachat-5bf73.firebasestorage.app",
  messagingSenderId: "359621553569",
  appId: "1:359621553569:web:57ec0e0e2f21f2751defe0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
