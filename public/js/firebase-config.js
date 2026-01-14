// ⚠️ IMPORTANT: Replace with your actual Firebase configuration
// Get this from Firebase Console > Project Settings > Your apps > Web app

const firebaseConfig = {
    apiKey: "AIzaSyDZhgdSUJ0U0yoE051E9rTtbe9A4py7g1Y",
    authDomain: "myphonebridge.firebaseapp.com",
    projectId: "myphonebridge",
    storageBucket: "myphonebridge.firebasestorage.app",
    messagingSenderId: "815562719889",
    appId: "1:815562719889:android:a8e85d9eedca3a10bab530",
    databaseURL: "https://myphonebridge-default-rtdb.asia-southeast1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

console.log('Firebase initialized successfully');
