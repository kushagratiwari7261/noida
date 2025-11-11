// Diagnostic logs for main.jsx
console.log('main.jsx loaded at:', new Date().toISOString());

window.addEventListener('beforeunload', (event) => {
  console.log('Main.jsx beforeunload at:', new Date().toISOString());
});

window.addEventListener('unload', (event) => {
  console.log('Main.jsx unload at:', new Date().toISOString());
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// ✅ Prevent React StrictMode remounts causing page-like refreshes
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  // ⛔ Removed StrictMode to prevent double-mounting and tab-triggered reloads
  <BrowserRouter basename="/"> {/* ✅ Set explicit basename */}
    <App />
  </BrowserRouter>
);
