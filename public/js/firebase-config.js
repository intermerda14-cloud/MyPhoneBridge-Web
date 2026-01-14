// ⚠️ IMPORTANT: Replace with your actual Firebase configuration
// Get this from Firebase Console > Project Settings > Your apps > Web app

const firebaseConfig = {
    apiKey: "AIzaSyDZhgdSUJ0U0yoE051E9rTtbe9A4py7g1Y",
    authDomain: "myphonebridge.firebaseapp.com",
    databaseURL: "https://myphonebridge-default-rtdb.firebaseio.com",
    projectId: "myphonebridge",
    storageBucket: "myphonebridge.firebasestorage.app",
    messagingSenderId: "815562719889",
    appId: "1:815562719889:web:YOUR_WEB_APP_ID"  // ⚠️ Replace with your actual web app ID
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase instances
const auth = firebase.auth();
const firestore = firebase.firestore();

console.log('Firebase initialized successfully');
