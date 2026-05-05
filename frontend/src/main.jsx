import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import BotLectorView from './bot-lector/BotLectorView.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/bot-lector" element={<BotLectorView />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
