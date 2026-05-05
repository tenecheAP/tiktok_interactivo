import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Play, Wifi, Volume2, User, Zap, Gift } from 'lucide-react';
import socket from './socket';

function App() {
  const [username, setUsername] = useState('');
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('tiktok_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [status, setStatus] = useState('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [config, setConfig] = useState(null);
  const [localMappings, setLocalMappings] = useState([]);
  const [events, setEvents] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [likesStatus, setLikesStatus] = useState({ current: 0, goal: 1000 });
  const [queues, setQueues] = useState({});
  const [stats, setStats] = useState({ totalLikes: 0, totalGifts: 0, totalFollowers: 0 });
  const [liveInfo, setLiveInfo] = useState({ viewerCount: 0, startTime: null, elapsed: '00:00:00' });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lastSoundTime = useRef(0);
  const saveTimeoutRef = useRef(null);

  const COMMON_GIFTS = [
    // 1 Coin
    { name: 'Rose', icon: '🌹', value: 1 },
    { name: 'TikTok', icon: '📱', value: 1 },
    { name: 'Ice Cream Cone', icon: '🍦', value: 1 },
    { name: 'Weightlifting', icon: '🏋️', value: 1 },
    { name: 'Coffee', icon: '☕', value: 1 },
    { name: 'GG', icon: '🎮', value: 1 },
    { name: 'Mini Speaker', icon: '🔊', value: 1 },
    { name: 'Tennis', icon: '🎾', value: 1 },
    { name: 'Soccer', icon: '⚽', value: 1 },
    { name: 'Darts', icon: '🎾', value: 1 },
    
    // 5-9 Coins
    { name: 'Panda', icon: '🐼', value: 5 },
    { name: 'Finger Heart', icon: '🫰', value: 5 },
    { name: 'Mic', icon: '🎤', value: 5 },
    { name: 'Hand Heart', icon: '🫶', value: 5 },
    { name: 'Bravia', icon: '👏', value: 5 },
    { name: 'Flower', icon: '🌸', value: 9 },
    { name: 'Mirror', icon: '🪞', value: 9 },

    // 10-49 Coins
    { name: 'Perfume', icon: '🧴', value: 20 },
    { name: 'Doughnut', icon: '🍩', value: 30 },
    { name: 'Mirror', icon: '🪞', value: 30 },
    { name: 'Garland', icon: '💐', value: 30 },
    
    // 50-99 Coins
    { name: 'Tea', icon: '🍵', value: 50 },
    { name: 'Garland', icon: '🌺', value: 50 },
    { name: 'Cap', icon: '🧢', value: 99 },
    { name: 'Paper Crane', icon: '🦢', value: 99 },
    { name: 'Goggles', icon: '🥽', value: 99 },
    { name: 'Hat', icon: '🎩', value: 99 },
    
    // 100-299 Coins
    { name: 'Confetti', icon: '🎊', value: 100 },
    { name: 'Cake Slice', icon: '🍰', value: 100 },
    { name: 'Bear', icon: '🐻', value: 100 },
    { name: 'Mishka', icon: '🧸', value: 100 },
    { name: 'Hat and Mustache', icon: '🎩', value: 199 },
    { name: 'Crown', icon: '👑', value: 199 },
    { name: 'Corgi', icon: '🐕', value: 299 },
    { name: 'Duck', icon: '🦆', value: 299 },
    { name: 'Pug', icon: '🐶', value: 299 },
    { name: 'Glasses', icon: '👓', value: 199 },
    { name: 'Headphones', icon: '🎧', value: 199 },
    
    // 300-999 Coins
    { name: 'Concert', icon: '🎫', value: 500 },
    { name: 'Sunset', icon: '🌅', value: 500 },
    { name: 'Swan', icon: '🦢', value: 699 },
    { name: 'Balloon', icon: '🎈', value: 699 },
    { name: 'Train', icon: '🚆', value: 899 },
    { name: 'Motorcycle', icon: '🏍️', value: 899 },
    { name: 'Travel', icon: '🧳', value: 999 },
    
    // 1000-4999 Coins
    { name: 'Ferris Wheel', icon: '🎡', value: 1000 },
    { name: 'Mine', icon: '⛏️', value: 1000 },
    { name: 'Champion', icon: '🏆', value: 1500 },
    { name: 'Flower Arrangement', icon: '💐', value: 1500 },
    { name: 'Whale', icon: '🐳', value: 2150 },
    { name: 'Jetski', icon: '🛵', value: 2999 },
    { name: 'Supercar', icon: '🏎️', value: 2999 },
    { name: 'Carousel', icon: '🎡', value: 3000 },
    { name: 'Sports Car', icon: '🏎️', value: 3999 },
    
    // 5000-9999 Coins
    { name: 'Submarine', icon: '🛥️', value: 5199 },
    { name: 'Airplane', icon: '✈️', value: 6000 },
    { name: 'Helicopter', icon: '🚁', value: 6999 },
    { name: 'Cruise Ship', icon: '🚢', value: 7000 },
    { name: 'Yacht', icon: '🛳️', value: 9888 },
    
    // 10000+ Coins
    { name: 'Interstellar', icon: '🚀', value: 10000 },
    { name: 'Castle', icon: '🏰', value: 10000 },
    { name: 'Rocket', icon: '🚀', value: 10000 },
    { name: 'Falcon', icon: '🦅', value: 10999 },
    { name: 'Spaceship', icon: '🚀', value: 13999 },
    { name: 'Planet', icon: '🪐', value: 15000 },
    { name: 'Unicorn', icon: '🦄', value: 15000 },
    { name: 'Galleon', icon: '🚢', value: 19999 },
    { name: 'Seal', icon: '🦭', value: 20000 },
    { name: 'Phoenix', icon: '🦅', value: 25999 },
    { name: 'Dragon', icon: '🐉', value: 26999 },
    { name: 'Lion', icon: '🦁', value: 29999 },
    { name: 'Leon and Lion', icon: '🦁🦁', value: 34000 },
    { name: 'Universe', icon: '🌌', value: 34999 },
    { name: 'TikTok Universe', icon: '🌌', value: 34999 },
    { name: 'Zeus', icon: '⚡', value: 39999 },
    { name: 'Pegasus', icon: '🐎', value: 39999 }
  ];

  const [giftFilter, setGiftFilter] = useState('all'); // 'all', 'low', 'medium', 'high'
  
  const filteredGifts = COMMON_GIFTS.filter(gift => {
    if (giftFilter === 'all') return true;
    if (giftFilter === 'low') return gift.value <= 10;
    if (giftFilter === 'medium') return gift.value > 10 && gift.value <= 500;
    if (giftFilter === 'high') return gift.value > 500;
    return true;
  });

  const getGiftIcon = (name) => {
    const gift = COMMON_GIFTS.find(g => g.name.toLowerCase() === name?.toLowerCase());
    return gift ? gift.icon : '🎁';
  };

  const getActionsDisplay = (actions) => {
    if (!actions || actions.length === 0) return 'Ninguno';
    return actions.map(action => action.replace('_', ' ')).join(', ');
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
  };

  // Usar una Ref para acceder al estado de audio sin reiniciar los listeners
  const audioEnabledRef = useRef(audioEnabled);
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  const playEventSound = (soundFile) => {
    if (!audioEnabledRef.current) return;
    const now = Date.now();
    if (now - lastSoundTime.current < 100) return;
    
    // Generar sonidos sintéticos para evitar errores de red (ORB/CORS)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (soundFile === 'gift.mp3') {
        // Sonido de campana (Agudo y corto)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (soundFile === 'welcome.mp3') {
        // Sonido de éxito (Acorde ascendente)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else {
        // Sonido de Like (Pop suave)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
      
      lastSoundTime.current = now;
    } catch (e) {
      console.error("Synthetic audio failed", e);
    }
  };

  const playFallbackBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.error("Fallback beep failed", e);
    }
  };

  // Actualizar el cronómetro del live
  useEffect(() => {
    let interval;
    if (status === 'connected' && liveInfo.startTime) {
      interval = setInterval(() => {
        const diff = Date.now() - liveInfo.startTime;
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setLiveInfo(prev => ({ ...prev, elapsed: `${h}:${m}:${s}` }));
      }, 1000);
    } else {
      setLiveInfo(prev => ({ ...prev, elapsed: '00:00:00' }));
    }
    return () => clearInterval(interval);
  }, [status, liveInfo.startTime]);

  useEffect(() => {
    socket.on('connection_status', (data) => {
      setStatus(data.status);
      if (data.status === 'connected') {
        setLiveInfo(prev => ({ ...prev, startTime: data.startTime }));
        setConnectionError('');
      } else if (data.status === 'error' || data.status === 'disconnected') {
        setConnectionError(data.error || 'Error de conexión');
      }
    });

    socket.on('live_info', (data) => {
      setLiveInfo(prev => ({ ...prev, viewerCount: data.viewerCount }));
    });

    socket.on('config_update', (newConfig) => {
      setConfig(newConfig);
      // Normalizar mapeos para asegurar que action sea siempre un array
      const normalizedMappings = newConfig.mappings.map(mapping => ({
        ...mapping,
        action: Array.isArray(mapping.action) ? mapping.action : [mapping.action]
      }));
      
      // Solo actualizar localMappings si el panel no está abierto para evitar saltos al escribir
      setLocalMappings(prev => {
        // Si el panel está cerrado o no hay mapeos locales aún, sincronizar
        if (!showConfig || prev.length === 0) {
          return normalizedMappings;
        }
        return prev;
      });
    });

    socket.on('likes_update', (data) => {
      setLikesStatus(data);
      setStats(prev => ({ ...prev, totalLikes: prev.totalLikes + (data.added || 15) })); // TikTok suele enviar ráfagas
    });

    socket.on('queue_update', (data) => {
      setQueues(prev => ({
        ...prev,
        [data.actuator]: data.count
      }));
    });

    socket.on('action_executing', (data) => {
      setEvents(prev => [data, ...prev].slice(0, 20));
      if (data.giftName) {
        setGifts(prev => [data, ...prev].slice(0, 10));
        setStats(prev => ({ ...prev, totalGifts: prev.totalGifts + 1 }));
      }
      if (data.eventName === 'follow') {
        setStats(prev => ({ ...prev, totalFollowers: prev.totalFollowers + 1 }));
      }
      playEventSound(data.sound);
    });

    socket.on('action', (data) => {
      // Para regalos sin acción física (muro de regalos)
      // El backend envía "Sin acción física" cuando no hay mapeo
      if (data.giftName) {
        setGifts(prev => [data, ...prev].slice(0, 5));
      }
    });

    // Solicitar configuración actual al conectar
    socket.emit('request_config');

    return () => {
      socket.off('connection_status');
      socket.off('config_update');
      socket.off('likes_update');
      socket.off('queue_update');
      socket.off('action_executing');
      socket.off('action');
    };
  }, []);

  // Función para guardar cambios en el backend (Debounced)
  const saveConfig = (mappings) => {
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(() => {
      // Limpiar los mapeos antes de enviar (asegurar números y normalizar action)
      const sanitizedMappings = mappings.map(m => ({
        ...m,
        action: Array.isArray(m.action) ? m.action : [m.action],
        duration: parseInt(m.duration) || 0,
        threshold: parseInt(m.threshold) || 0,
        minValue: parseInt(m.minValue) || 0,
        maxValue: parseInt(m.maxValue) || 0
      }));
      
      const configToSave = config || {
        levels: {
          follower: { priority: 1, color: '#00ff00' },
          fan: { priority: 2, color: '#0000ff' },
          super_fan: { priority: 3, color: '#ff0000' }
        }
      };
      
      socket.emit('update_config', { ...configToSave, mappings: sanitizedMappings });
      console.log('Configuración sincronizada con el backend');
      setIsSaving(false);
    }, 800); // Aumentado a 800ms para dar más tiempo de escritura fluida
  };

  const updateMapping = (index, field, value) => {
    setLocalMappings(prev => {
      const newMappings = [...prev];
      let processedValue = value;
      
      // Permitir strings vacíos en el estado local para facilitar la edición
      if (['duration', 'threshold', 'minValue', 'maxValue'].includes(field)) {
        processedValue = value === '' ? '' : value;
      }
      
      newMappings[index] = { ...newMappings[index], [field]: processedValue };
      saveConfig(newMappings);
      return newMappings;
    });
  };

  const addMapping = () => {
    setLocalMappings(prev => {
      const newId = prev.length > 0 ? Math.max(...prev.map(m => m.id)) + 1 : 1;
      const newMapping = { 
        id: newId, 
        event: 'gift', 
        giftName: 'Rose', 
        action: ['relay_1'], 
        duration: 1000, 
        sound: 'gift.mp3',
        autoReset: true 
      };
      const newMappings = [...prev, newMapping];
      saveConfig(newMappings);
      return newMappings;
    });
  };

  const removeMapping = (id) => {
    setLocalMappings(prev => {
      const newMappings = prev.filter(m => m.id !== id);
      saveConfig(newMappings);
      return newMappings;
    });
  };

  const updateMappingActions = (index, action, checked) => {
    setLocalMappings(prev => {
      const newMappings = [...prev];
      const currentActions = newMappings[index].action || [];
      
      if (checked) {
        // Agregar acción si no existe
        if (!currentActions.includes(action)) {
          newMappings[index] = { ...newMappings[index], action: [...currentActions, action] };
        }
      } else {
        // Remover acción si existe
        newMappings[index] = { ...newMappings[index], action: currentActions.filter(a => a !== action) };
      }
      
      saveConfig(newMappings);
      return newMappings;
    });
  };

  const resetConfig = () => {
    if (window.confirm('¿Estás seguro de que quieres restablecer todos los mapeos a los valores por defecto?')) {
      socket.emit('reset_config');
    }
  };
    const connectToLive = (selectedUsername) => {
    const userToConnect = selectedUsername || username;
    if (userToConnect) {
      setConnectionError('');
      socket.emit('set_username', userToConnect);
      setStatus('connecting');
      
      // Actualizar historial
      setHistory(prev => {
        const filtered = prev.filter(u => u !== userToConnect);
        const newHistory = [userToConnect, ...filtered].slice(0, 5);
        localStorage.setItem('tiktok_history', JSON.stringify(newHistory));
        return newHistory;
      });
      
      if (selectedUsername) setUsername(selectedUsername);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* Top Stats Bar */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent uppercase italic">
                TikTok Live <span className="text-slate-200 not-italic">Pro</span>
              </h1>
              <Link
                to="/bot-lector"
                className="text-[10px] font-black uppercase tracking-widest text-violet-400 hover:text-violet-300 border border-violet-500/40 px-2 py-1 rounded-lg"
              >
                Bot lector
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></div>
                  Likes: <span className="text-slate-200">{stats.totalLikes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
                  Gifts: <span className="text-slate-200">{stats.totalGifts}</span>
                </div>
                <div className="flex items-center gap-2 border-l border-slate-800 pl-6 ml-2">
                  <Wifi size={12} className={status === 'connected' ? 'text-emerald-500' : 'text-slate-700'} />
                  ESP32: <span className={status === 'connected' ? 'text-emerald-400' : 'text-slate-500'}>{status === 'connected' ? 'En Línea' : 'Offline'}</span>
                </div>
                <div className="flex items-center gap-2 border-l border-slate-800 pl-6">
                  <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></div>
                  Live: <span className="text-slate-200 tabular-nums font-mono text-xs">{liveInfo.elapsed}</span>
                </div>
                <div className="flex items-center gap-2 border-l border-slate-800 pl-6">
                  <User size={12} className="text-slate-500" />
                  Viewers: <span className="text-slate-200 tabular-nums">{liveInfo.viewerCount.toLocaleString()}</span>
                </div>
              </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleAudio}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${audioEnabled ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-pink-500 text-white shadow-lg shadow-pink-500/20'}`}
            >
              {audioEnabled ? <Volume2 size={14} /> : <Volume2 size={14} className="animate-bounce" />}
              {audioEnabled ? 'Audio On' : 'Activar Audio'}
            </button>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
              <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              {status.toUpperCase()}
            </div>
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className={`p-2 rounded-lg transition-all ${showConfig ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar Dinámica: Controls (Not Connected) or Gifts (Connected) */}
          <div className={`${status === 'connected' ? 'col-span-12 lg:col-span-3' : 'col-span-12 lg:col-span-4'} space-y-6 transition-all duration-500`}>
            
            {status === 'connected' ? (
              <>
                {/* Modo Live: Regalos en el Sidebar */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm h-[calc(100vh-200px)] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Gift size={14} className="text-violet-500" /> Donaciones
                    </h3>
                    <span className="text-[10px] font-black text-pink-500 animate-pulse">LIVE</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                    {gifts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full opacity-30 italic">
                        <Gift size={32} className="mb-2" />
                        <p className="text-[10px] uppercase font-black">Esperando...</p>
                      </div>
                    ) : (
                      gifts.map((g, i) => (
                        <div key={i} className="bg-slate-950 p-3 rounded-xl border border-slate-800/50 group hover:border-pink-500/30 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl group-hover:scale-110 transition-transform">
                              {getGiftIcon(g.giftName)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-black text-slate-200 truncate">{g.user}</p>
                              <p className="text-[9px] text-pink-500 font-bold uppercase">{g.giftName} x{g.repeatCount}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Controles Minimizados al final del sidebar */}
                  <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
                    <button 
                      onClick={() => setStatus('disconnected')}
                      className="w-full bg-slate-800 hover:bg-red-500/10 hover:text-red-500 py-2 rounded-lg text-[9px] font-black uppercase transition-all border border-slate-700"
                    >
                      Desconectar
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                      {['gift', 'like', 'follow', 'chat'].map(type => (
                        <button 
                          key={type}
                          onClick={() => socket.emit('simulate_event', type)}
                          className="bg-slate-950 hover:bg-slate-800 py-1.5 rounded-md text-[8px] font-black uppercase transition-all border border-slate-800 text-slate-500"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <>
                {/* Modo Config: Controles de Conexión */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Play size={14} className="text-pink-500" /> Control de Conexión
                  </h3>
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="@usuario"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-pink-500/50 outline-none transition-all placeholder:text-slate-700"
                      />
                    </div>
                    <button
                      onClick={() => connectToLive()}
                      disabled={status === 'connecting'}
                      className="w-full bg-slate-100 text-slate-950 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50"
                    >
                      {status === 'connecting' ? 'Conectando...' : 'Establecer Conexión'}
                    </button>

                    {connectionError && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <p className="text-xs font-bold text-red-400 text-center">{connectionError}</p>
                      </div>
                    )}
                    
                    {history.length > 0 && (
                      <div className="pt-4 border-t border-slate-800">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-3">Recientes</p>
                        <div className="flex flex-wrap gap-2">
                          {history.map((u, i) => (
                            <button
                              key={i}
                              onClick={() => connectToLive(u)}
                              className="text-[10px] font-bold bg-slate-800/50 hover:bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-800 transition-all"
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap size={14} className="text-yellow-500" /> Simulador de Pruebas
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['gift', 'like', 'follow', 'chat'].map(type => (
                      <button 
                        key={type}
                        onClick={() => socket.emit('simulate_event', type)}
                        className="bg-slate-800 hover:bg-slate-700 py-3 rounded-xl text-[10px] font-black uppercase transition-all border border-slate-700/50"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* Actuators & Goals - Area Principal Prioritaria */}
          <div className={`${status === 'connected' ? 'col-span-12 lg:col-span-9' : 'col-span-12 lg:col-span-8'} space-y-6 transition-all duration-500`}>
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm ring-1 ring-blue-500/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Settings size={18} className="text-blue-500" /> Panel de Actuadores (Relays)
                </h3>
                <span className="text-[10px] font-black bg-blue-500/10 text-blue-500 px-2 py-1 rounded">ESTADO EN VIVO</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['relay_1', 'relay_2', 'relay_3', 'relay_4'].map(act => (
                  <div key={act} className={`p-4 rounded-2xl border transition-all ${queues[act] > 0 ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-slate-950 border-slate-800'}`}>
                    <div className="flex flex-col items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${queues[act] > 0 ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-900 text-slate-600'}`}>
                        <Zap size={18} />
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">{act.replace('_', ' ')}</span>
                        {queues[act] > 0 ? (
                          <span className="text-xs font-black text-blue-400 tabular-nums">Cola: {queues[act]}</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-700 uppercase italic">Inactivo</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {['led_pulse', 'servo_wave'].map(act => (
                  <div key={act} className={`p-4 rounded-2xl border transition-all ${queues[act] > 0 ? 'bg-violet-500/10 border-violet-500/50' : 'bg-slate-950 border-slate-800'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${queues[act] > 0 ? 'bg-violet-500 text-white animate-bounce' : 'bg-slate-900 text-slate-600'}`}>
                          <Settings size={14} />
                        </div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider">{act.replace('_', ' ')}</span>
                      </div>
                      {queues[act] > 0 && <span className="text-xs font-black text-violet-400">Activo</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm ring-1 ring-pink-500/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Zap size={18} className="text-pink-500" /> Meta de la Comunidad
                </h3>
                <span className="text-[10px] font-black bg-pink-500/10 text-pink-500 px-2 py-1 rounded">
                  {((likesStatus.current / likesStatus.goal) * 100).toFixed(0)}% COMPLETADO
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-3xl font-black text-white tabular-nums">{likesStatus.current.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Likes acumulados</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-bold text-slate-400">Objetivo: {likesStatus.goal.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Siguiente Activación</p>
                  </div>
                </div>
                <div className="w-full bg-slate-950 h-4 rounded-full overflow-hidden border border-slate-800 p-0.5">
                  <div 
                    className="bg-gradient-to-r from-pink-500 via-violet-500 to-blue-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(236,72,153,0.3)] relative"
                    style={{ width: `${(likesStatus.current / likesStatus.goal) * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]"></div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Muro de Regalos (Solo visible si no está conectado para no duplicar) */}
        {status !== 'connected' && (
          <div className="grid grid-cols-12 gap-6">
            <section className="col-span-12 lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Gift size={14} className="text-violet-500" /> Muro de Regalos Recientes
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {gifts.length === 0 ? (
                  <div className="col-span-full py-12 text-center">
                    <p className="text-xs text-slate-600 font-bold uppercase italic">Esperando donaciones...</p>
                  </div>
                ) : (
                  gifts.map((g, i) => (
                    <div key={i} className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50 group hover:border-pink-500/30 transition-all text-center">
                      <div className="text-3xl mb-2 group-hover:scale-125 transition-transform duration-300">
                        {getGiftIcon(g.giftName)}
                      </div>
                      <p className="text-[10px] font-black text-slate-200 truncate mb-1">{g.user}</p>
                      <p className="text-[9px] text-pink-500 font-black uppercase">{g.giftName} x{g.repeatCount}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="col-span-12 lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
              <button 
                onClick={() => setShowActivity(!showActivity)}
                className={`w-full py-6 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 ${showActivity ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-pink-500/30'}`}
              >
                <Volume2 size={24} className={showActivity ? 'animate-pulse' : ''} />
                <div className="text-center">
                  <span className="text-xs font-black uppercase tracking-widest block">Monitor de Actividad</span>
                  <span className="text-[10px] font-bold opacity-60 uppercase mt-1">{showActivity ? 'Ocultar Panel' : 'Desplegar Panel'}</span>
                </div>
              </button>
            </section>
          </div>
        )}

        {/* Si está conectado, el monitor de actividad se muestra como un botón flotante o discreto */}
        {status === 'connected' && (
          <div className="flex justify-end">
            <button 
              onClick={() => setShowActivity(!showActivity)}
              className={`px-6 py-3 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${showActivity ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            >
              <Volume2 size={14} /> {showActivity ? 'Cerrar Monitor' : 'Revisar Actividad'}
            </button>
          </div>
        )}

        {/* Global Event Log - Desplegable */}
        {showActivity && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Volume2 size={14} className="text-emerald-500" /> Registro Detallado de Eventos
              </h3>
              <button onClick={() => setShowActivity(false)} className="text-[10px] font-black text-slate-600 hover:text-white uppercase transition-colors">Cerrar Monitor</button>
            </div>
            <div className="h-[400px] overflow-y-auto custom-scrollbar">
              {events.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-2 opacity-50">
                  <User size={40} strokeWidth={1} />
                  <p className="text-xs font-bold uppercase tracking-widest">Sin actividad registrada</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/30">
                  {events.map((ev, i) => (
                    <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-slate-800/20 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center text-slate-500">
                          {ev.giftName ? <span className="text-lg">{getGiftIcon(ev.giftName)}</span> : <User size={14} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black text-slate-200">{ev.user}</p>
                            <span className={`text-[7px] px-1 py-0.5 rounded font-black uppercase ${ev.level === 'super_fan' ? 'bg-pink-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                              {ev.level}
                            </span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">
                            {ev.eventName} <span className="text-slate-700 mx-1">•</span> <span className="text-blue-500">{ev.action}</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-[8px] font-mono text-slate-700 tabular-nums">SYNC_OK</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Configuration Overlay */}
        {showConfig && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-pink-500/30 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 w-full max-w-6xl">
                <div className="flex justify-between items-center mb-8">
                  <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Panel de Configuración</h2>
                    {isSaving && (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest animate-pulse">
                        <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                        Guardando...
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Mapeo de lógica y actuadores físicos</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={resetConfig}
                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-red-500/20"
                  >
                    Restablecer
                  </button>
                  <button onClick={() => setShowConfig(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 py-2 rounded-xl text-xs font-bold transition-all">Cerrar</button>
                </div>
              </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar pb-10">
                  {localMappings.map((m, index) => (
                    <div key={m.id} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 relative group hover:border-slate-700 transition-all">
                      <button 
                        onClick={() => removeMapping(m.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-all shadow-xl hover:scale-110 z-10"
                      >
                        ✕
                      </button>
                      
                      <div className="flex justify-between items-center mb-5">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">Slot #{m.id}</span>
                        <select 
                          value={m.event}
                          onChange={(e) => updateMapping(index, 'event', e.target.value)}
                          className="bg-slate-900 text-[10px] font-black text-pink-500 border-none outline-none rounded-lg px-2 py-1 uppercase tracking-wider"
                        >
                          <option value="gift">Gift (Nombre)</option>
                          <option value="gift_value">Gift (Valor)</option>
                          <option value="like_goal">Like Goal</option>
                          <option value="follow">Follow</option>
                        </select>
                      </div>

                      <div className="space-y-4">
                        {m.event === 'gift' && (
                          <div className="space-y-3">
                            <div className="flex gap-3">
                              <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-2xl">
                                {getGiftIcon(m.giftName)}
                              </div>
                              <div className="flex-1">
                                <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Identificador</label>
                                <input 
                                  type="text" 
                                  value={m.giftName || ''} 
                                  onChange={(e) => updateMapping(index, 'giftName', e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-pink-500/50 text-white"
                                  placeholder="Nombre exacto"
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                              {filteredGifts.map(gift => (
                                <button
                                  key={gift.name}
                                  onClick={() => updateMapping(index, 'giftName', gift.name)}
                                  className={`text-[9px] px-2 py-1 rounded-md border transition-all ${m.giftName === gift.name ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                                >
                                  {gift.icon} {gift.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.event === 'gift_value' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Min Monedas</label>
                              <input 
                                type="number" 
                                value={m.minValue} 
                                onChange={(e) => updateMapping(index, 'minValue', e.target.value)} 
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" 
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Max Monedas</label>
                              <input 
                                type="number" 
                                value={m.maxValue} 
                                onChange={(e) => updateMapping(index, 'maxValue', e.target.value)} 
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" 
                              />
                            </div>
                          </div>
                        )}

                        {m.event === 'like_goal' && (
                          <div className="space-y-3">
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Objetivo Likes</label>
                              <input 
                                type="number" 
                                value={m.threshold} 
                                onChange={(e) => updateMapping(index, 'threshold', e.target.value)} 
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" 
                              />
                            </div>
                            <button 
                              onClick={() => updateMapping(index, 'autoReset', !m.autoReset)}
                              className="w-full py-2 rounded-lg text-[9px] font-black uppercase transition-all border bg-pink-500/10 border-pink-500/30 text-pink-500"
                            >
                              Auto-Reinicio: {m.autoReset ? 'ON' : 'OFF'}
                            </button>
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-800/50">
                          <div>
                            <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">Actuadores (selección múltiple)</label>
                            <div className="grid grid-cols-2 gap-2">
                              {['relay_1', 'relay_2', 'relay_3', 'relay_4'].map(actuator => (
                                <label key={actuator} className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={(m.action || []).includes(actuator)}
                                    onChange={(e) => updateMappingActions(index, actuator, e.target.checked)}
                                    className="w-3 h-3 text-pink-500 bg-slate-800 border-slate-700 rounded focus:ring-pink-500"
                                  />
                                  <span className="text-[9px] font-bold text-slate-300 uppercase">{actuator.replace('_', ' ')}</span>
                                </label>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {['led_pulse', 'servo_wave'].map(actuator => (
                                <label key={actuator} className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={(m.action || []).includes(actuator)}
                                    onChange={(e) => updateMappingActions(index, actuator, e.target.checked)}
                                    className="w-3 h-3 text-pink-500 bg-slate-800 border-slate-700 rounded focus:ring-pink-500"
                                  />
                                  <span className="text-[9px] font-bold text-slate-300 uppercase">{actuator.replace('_', ' ')}</span>
                                </label>
                              ))}
                            </div>
                            {(m.action || []).length > 0 && (
                              <div className="mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-800">
                                <span className="text-[8px] font-black text-slate-500 uppercase mb-1 block">Activar:</span>
                                <span className="text-[9px] font-bold text-pink-400">{getActionsDisplay(m.action)}</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Duración (ms)</label>
                            <input 
                              type="number" 
                              value={m.duration} 
                              onChange={(e) => updateMapping(index, 'duration', e.target.value)} 
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-[10px] text-white outline-none" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={addMapping}
                    className="bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 hover:border-pink-500/30 hover:bg-slate-900/50 transition-all group min-h-[250px]"
                  >
                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <span className="text-2xl text-slate-600 group-hover:text-pink-500">+</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-400">Nuevo Mapeo</span>
                  </button>
                </div>
              </div>
          </div>
        )}

        {/* Global Event Log */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Volume2 size={14} className="text-violet-500" /> Monitor de Actividad
            </h3>
            <span className="text-[10px] font-bold text-slate-600 italic">Streaming en vivo...</span>
          </div>
          <div className="h-[500px] overflow-y-auto custom-scrollbar">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-2 opacity-50">
                <User size={40} strokeWidth={1} />
                <p className="text-xs font-bold uppercase tracking-widest">Sin actividad</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {events.map((ev, i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center text-slate-500 group-hover:border-pink-500/50 transition-all">
                        {ev.giftName ? (
                          <span className="text-xl">{getGiftIcon(ev.giftName)}</span>
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-100">{ev.user}</p>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${ev.level === 'super_fan' ? 'bg-pink-500 text-white' : (ev.level === 'fan' ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-400')}`}>
                            {ev.level}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                          {ev.eventName} <span className="text-slate-600 mx-1">•</span> <span className="text-pink-500/80">{ev.action}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-700 group-hover:text-emerald-500 transition-colors uppercase tabular-nums">
                        Sync: &lt;50ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}} />
    </div>
  );
}

export default App;
