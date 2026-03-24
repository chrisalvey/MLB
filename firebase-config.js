import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyChmsflW9Z98WkpuCENrGfzI3Benyr_ULw",
  authDomain: "bush-league-3e05d.firebaseapp.com",
  projectId: "bush-league-3e05d",
  storageBucket: "bush-league-3e05d.firebasestorage.app",
  messagingSenderId: "1007982282595",
  appId: "1:1007982282595:web:38b285a25d0b93b788b556"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
