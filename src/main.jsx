// Diagnostic logs for main.jsx
console.log('main.jsx loaded at:', new Date().toISOString());

window.addEventListener('beforeunload', (event) => {
  console.log('Main.jsx beforeunload at:', new Date().toISOString());
});

window.addEventListener('unload', (event) => {
  console.log('Main.jsx unload at:', new Date().toISOString());
});
// main.jsx - Fixed version
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // Add this import
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* ✅ Wrap App with BrowserRouter */}
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)