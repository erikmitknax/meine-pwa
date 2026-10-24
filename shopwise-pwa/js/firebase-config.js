// Firebase-Projekt für die Geräte-Synchronisation.
// Öffentliche Web-Konfiguration (kein Geheimnis): geschützt wird über Anmeldung + Firestore-Regeln.
// Es ist dasselbe Projekt und Konto wie bei FoodPro, Lernwerkstatt und Wunschliste.
// Die Daten liegen unter users/<uid>/sw_lists | sw_litems | sw_cats | sw_stock | sw_watch
// und fallen unter die bestehende Regel users/{uid}/**.
export const FIREBASE_VERSION = '10.14.1';
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAlCKl6VVzqbLOoYMD1zlswFDLt47sI_2I',
  authDomain: 'foodpro-e2a44.firebaseapp.com',
  projectId: 'foodpro-e2a44',
  storageBucket: 'foodpro-e2a44.firebasestorage.app',
  messagingSenderId: '803117480250',
  appId: '1:803117480250:web:0f54697c6e1ac470ae3803',
};
