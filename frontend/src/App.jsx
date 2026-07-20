import React, { useState, useEffect, useRef } from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import { Settings, Play, Wifi, Volume2, User, Zap, Gift, Target, Heart, Search } from 'lucide-react';
import socket from './socket';
import BotLectorView from './bot-lector/BotLectorView';
import GiftCatalogView from './GiftCatalogView';
// import AccountsEnjambre from './accounts-enjambre/AccountsEnjambre';

function App() {
  const [theme, setTheme] = useState('neon');
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('tiktok_current_username') || '';
  });
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('tiktok_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [status, setStatus] = useState(() => {
    const saved = localStorage.getItem('tiktok_session_status');
    return saved || 'disconnected';
  });
  const [connectionError, setConnectionError] = useState('');
  const [config, setConfig] = useState(null);
  const [localMappings, setLocalMappings] = useState(() => {
    try {
      const saved = localStorage.getItem('tiktok_local_mappings');
      if (saved) return JSON.parse(saved);
    } catch { /* ignorar */ }
    return [];
  });
  const [events, setEvents] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [aggregatedGifts, setAggregatedGifts] = useState([]);
  const [globalGiftStats, setGlobalGiftStats] = useState({});
  const [likesStatus, setLikesStatus] = useState({ current: 0, goal: 1000 });
  const [queues, setQueues] = useState({});
  const [activeActions, setActiveActions] = useState({});
  const [stats, setStats] = useState({ totalLikes: 0, totalGifts: 0, totalFollowers: 0 });
  const [liveInfo, setLiveInfo] = useState({ viewerCount: 0, startTime: null, elapsed: '00:00:00' });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isBotActive, setIsBotActive] = useState(false);
  const [showBotModal, setShowBotModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingGifts, setIsLoadingGifts] = useState(false);
  const [giftsError, setGiftsError] = useState('');
  const [giftSearchQuery, setGiftSearchQuery] = useState('');

  // Nombres personalizados de actuadores (persistidos)
  const [actuatorNames, setActuatorNames] = useState(() => {
    try {
      const saved = localStorage.getItem('tiktok_actuator_names');
      if (saved) return JSON.parse(saved);
    } catch { /* ignorar */ }
    return {
      relay_1: '',
      relay_2: '',
      relay_3: '',
      relay_4: '',
      led_pulse: '',
      servo_wave: '',
    };
  });

  const updateActuatorName = (id, name) => {
    setActuatorNames(prev => {
      const next = { ...prev, [id]: name };
      localStorage.setItem('tiktok_actuator_names', JSON.stringify(next));
      return next;
    });
  };

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (showConfig || showBotModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showConfig, showBotModal]);

  // Tipo técnico legible
  const getActuatorType = (id) => {
    if (id.startsWith('relay')) return 'Relay';
    if (id.startsWith('led')) return 'LED';
    if (id.startsWith('servo')) return 'Servo';
    return id;
  };

  // Etiqueta completa: "Mi Motor (Relay 1)" o "Relay 1" si no tiene nombre
  const getActuatorLabel = (id) => {
    const customName = actuatorNames[id];
    const typeName = getActuatorType(id);
    const num = id.match(/_(\d+)$/)?.[1];
    const techLabel = num ? `${typeName} ${num}` : typeName;
    return customName ? `${customName} (${techLabel})` : techLabel;
  };

  const lastSoundTime = useRef(0);
  const saveTimeoutRef = useRef(null);

  // Fallback estático — se usa solo si el backend no envía la lista dinámica
  const FALLBACK_GIFTS = [
    { name: 'Rose', icon: '🌹', value: 1 },
    { name: 'TikTok', icon: '📱', value: 1 },
    { name: 'Ice Cream Cone', icon: '🍦', value: 1 },
    { name: 'Finger Heart', icon: '🫰', value: 5 },
    { name: 'Panda', icon: '🐼', value: 5 },
    { name: 'Mic', icon: '🎤', value: 5 },
    { name: 'Perfume', icon: '🧴', value: 20 },
    { name: 'Doughnut', icon: '🍩', value: 30 },
    { name: 'Cap', icon: '🧢', value: 99 },
    { name: 'Confetti', icon: '🎊', value: 100 },
    { name: 'Paper Crane', icon: '🦢', value: 100 },
    { name: 'Crown', icon: '👑', value: 199 },
    { name: 'Corgi', icon: '🐕', value: 299 },
    { name: 'Concert', icon: '🎫', value: 500 },
    { name: 'Ferris Wheel', icon: '🎡', value: 1000 },
    { name: 'Whale', icon: '🐳', value: 2150 },
    { name: 'Supercar', icon: '🏎️', value: 2999 },
    { name: 'Airplane', icon: '✈️', value: 6000 },
    { name: 'Interstellar', icon: '🚀', value: 10000 },
    { name: 'Universe', icon: '🌌', value: 34999 },
  ];

  // Genera mappings automáticos inteligentes según el valor de cada regalo
  // Criterio:
  //   value <= 10   → relay_1 (1 actuador, efecto rápido)
  //   11–99         → relay_2 (otro actuador diferente)
  //   100–499       → relay_1 + relay_2 (combo de 2)
  //   500–999       → relay_1 + relay_2 + led_pulse (combo + luz)
  //   1000–4999     → relay_1 + relay_2 + relay_3 + led_pulse (casi todos)
  //   5000+         → TODOS: relay_1..4 + led_pulse + servo_wave (¡espectáculo completo!)
  const generateSmartDefaults = (gifts) => {
    const tiers = [
      { max: 10,    actions: ['relay_1'],                                     duration: 1000 },
      { max: 99,    actions: ['relay_2'],                                     duration: 1500 },
      { max: 499,   actions: ['relay_1', 'relay_2'],                          duration: 2000 },
      { max: 999,   actions: ['relay_1', 'relay_2', 'led_pulse'],             duration: 2500 },
      { max: 4999,  actions: ['relay_1', 'relay_2', 'relay_3', 'led_pulse'],  duration: 3000 },
      { max: Infinity, actions: ['relay_1', 'relay_2', 'relay_3', 'relay_4', 'led_pulse', 'servo_wave'], duration: 5000 },
    ];

    // Elegir 1 regalo representativo por tier (el más popular/conocido de cada rango)
    const selected = [];
    const usedNames = new Set();

    for (const tier of tiers) {
      const prevMax = tiers[tiers.indexOf(tier) - 1]?.max || 0;
      const candidates = gifts.filter(g =>
        g.value > prevMax && g.value <= tier.max && !usedNames.has(g.name)
      );
      if (candidates.length > 0) {
        // Elegir el que tenga el valor más bajo del tier (el más accesible)
        candidates.sort((a, b) => a.value - b.value);
        const pick = candidates[0];
        usedNames.add(pick.name);
        selected.push({
          id: selected.length + 1,
          event: 'gift',
          giftName: pick.name,
          action: tier.actions,
          duration: tier.duration,
          sound: 'gift.mp3',
          autoReset: true,
          _autoGenerated: true,
        });
      }
    }

    // Añadir un mapping de "follow" como bonus
    selected.push({
      id: selected.length + 1,
      event: 'follow',
      giftName: '',
      action: ['led_pulse'],
      duration: 500,
      sound: 'welcome.mp3',
      autoReset: true,
      _autoGenerated: true,
    });

    return selected;
  };

  // giftsList: dinámico (del socket) o fallback estático
  const [giftsList, setGiftsList] = useState(FALLBACK_GIFTS);

  // Al iniciar: si no hay mappings guardados, generar defaults inteligentes
  useEffect(() => {
    const saved = localStorage.getItem('tiktok_local_mappings');
    if (!saved || JSON.parse(saved).length === 0) {
      const defaults = generateSmartDefaults(FALLBACK_GIFTS);
      setLocalMappings(defaults);
      localStorage.setItem('tiktok_local_mappings', JSON.stringify(defaults));
      console.info(`[AUTO-CONFIG] Generados ${defaults.length} mappings iniciales inteligentes`);
    }
  }, []); // Solo al montar

  const [giftFilter, setGiftFilter] = useState('all');
  
  const filteredGifts = giftsList.filter(gift => {
    if (giftFilter === 'all') return true;
    if (giftFilter === 'low') return gift.value <= 10;
    if (giftFilter === 'medium') return gift.value > 10 && gift.value <= 500;
    if (giftFilter === 'high') return gift.value > 500;
    return true;
  });

  // Devuelve imagen <img> o emoji según la fuente de datos
  const getGiftIcon = (name) => {
    const gift = giftsList.find(g => g.name.toLowerCase() === name?.toLowerCase());
    if (gift?.image_url) {
      return <img src={gift.image_url} alt={gift.name} className="w-6 h-6 object-contain" />;
    }
    return gift?.icon || '🎁';
  };

  const getActionsDisplay = (actions) => {
    if (!actions || actions.length === 0) return 'Ninguno';
    return actions.map(a => getActuatorLabel(a)).join(', ');
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
        localStorage.setItem('tiktok_session_status', 'connected');
      } else if (data.status === 'error' || data.status === 'disconnected') {
        setConnectionError(data.error || 'Error de conexión');
        localStorage.setItem('tiktok_session_status', 'disconnected');
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
      // Y solo si no hay mappings guardados localmente (para respetar la config local)
      setLocalMappings(prev => {
        if (!showConfig || prev.length === 0) {
          // Si tenemos mappings locales guardados, no sobreescribir con los del server
          const localSaved = localStorage.getItem('tiktok_local_mappings');
          if (localSaved && JSON.parse(localSaved).length > 0 && prev.length > 0) {
            return prev;
          }
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
      console.log('📦 action_executing recibido:', data);
      setEvents(prev => [data, ...prev].slice(0, 20));
      
      if (data.giftName) {
        // 1. Historial de sesión (Agredado por usuario + tipo)
        setAggregatedGifts(prev => {
          const existingIndex = prev.findIndex(g => g.user === data.user && g.giftName === data.giftName);
          if (existingIndex !== -1) {
            const updated = [...prev];
            const item = { ...updated[existingIndex] };
            item.repeatCount = (item.repeatCount || 0) + (data.repeatCount || 1);
            item.ts = Date.now();
            updated.splice(existingIndex, 1);
            return [item, ...updated];
          }
          return [{ ...data, repeatCount: data.repeatCount || 1, ts: Date.now() }, ...prev].slice(0, 30);
        });

        // 2. Estadísticas Globales (Totales por tipo)
        setGlobalGiftStats(prev => {
          const current = prev[data.giftName] || { count: 0, totalValue: 0 };
          return {
            ...prev,
            [data.giftName]: {
              count: current.count + (data.repeatCount || 1),
              totalValue: current.totalValue + (data.giftValue || 0) * (data.repeatCount || 1)
            }
          };
        });

        setStats(prev => ({ ...prev, totalGifts: prev.totalGifts + (data.repeatCount || 1) }));
      }
      
      if (data.eventName === 'follow') {
        setStats(prev => ({ ...prev, totalFollowers: prev.totalFollowers + 1 }));
      }

      // 3. Actuador activo para UI
      setActiveActions(prev => ({ ...prev, [data.action]: data }));
      setTimeout(() => {
        setActiveActions(prev => {
          const next = { ...prev };
          // Solo borrar si es la misma acción (evitar borrar una nueva acción que empezó)
          if (next[data.action]?.ts === data.ts) {
            delete next[data.action];
          }
          return next;
        });
      }, data.duration);

      playEventSound(data.sound);
    });

    socket.on('action', (data) => {
      // Para regalos sin acción física
      if (data.giftName) {
        setAggregatedGifts(prev => {
          const existingIndex = prev.findIndex(g => g.user === data.user && g.giftName === data.giftName);
          if (existingIndex !== -1) {
            const updated = [...prev];
            const item = { ...updated[existingIndex] };
            item.repeatCount = (item.repeatCount || 0) + (data.repeatCount || 1);
            item.ts = Date.now();
            updated.splice(existingIndex, 1);
            return [item, ...updated];
          }
          return [{ ...data, repeatCount: data.repeatCount || 1, ts: Date.now() }, ...prev].slice(0, 30);
        });

        setGlobalGiftStats(prev => {
          const current = prev[data.giftName] || { count: 0, totalValue: 0 };
          return {
            ...prev,
            [data.giftName]: {
              count: current.count + (data.repeatCount || 1),
              totalValue: current.totalValue + (data.giftValue || 0) * (data.repeatCount || 1)
            }
          };
        });

        setStats(prev => ({ ...prev, totalGifts: prev.totalGifts + (data.repeatCount || 1) }));
      }
    });

    socket.on('gift_list', (list) => {
      if (Array.isArray(list) && list.length > 0) {
        console.info(`[GIFTS] Recibidos ${list.length} regalos dinámicos del servidor`);
        setGiftsList(list);
        setIsLoadingGifts(false);
        setGiftsError('');

        // Auto-migrar mappings: si un giftName configurado no existe en la nueva lista,
        // buscar el regalo más cercano en valor (diamond_count)
        setLocalMappings(prev => {
          let changed = false;
          const migrated = prev.map(m => {
            if (m.event !== 'gift' || !m.giftName) return m;
            const exists = list.find(g => g.name.toLowerCase() === m.giftName.toLowerCase());
            if (exists) return m; // El regalo existe, no migrar

            // Buscar el valor del regalo en la lista fallback para saber su rango
            const fallbackGift = FALLBACK_GIFTS.find(g => g.name.toLowerCase() === m.giftName.toLowerCase());
            const targetValue = fallbackGift?.value || 1;

            // Buscar el regalo más cercano en valor en la nueva lista
            let closest = list[0];
            let minDiff = Math.abs((list[0]?.value || 0) - targetValue);
            for (const g of list) {
              const diff = Math.abs((g.value || 0) - targetValue);
              if (diff < minDiff) {
                minDiff = diff;
                closest = g;
              }
            }

            console.warn(`[AUTO-MATCH] "${m.giftName}" (${targetValue} coins) no encontrado. Asignado: "${closest.name}" (${closest.value} coins)`);
            changed = true;
            return { ...m, giftName: closest.name, _migratedFrom: m.giftName };
          });

          if (changed) {
            localStorage.setItem('tiktok_local_mappings', JSON.stringify(migrated));
            // Sincronizar con backend
            setTimeout(() => saveConfig(migrated), 500);
          }
          return changed ? migrated : prev;
        });
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
      socket.off('gift_list');
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
      
      // Persistir en localStorage
      localStorage.setItem('tiktok_local_mappings', JSON.stringify(sanitizedMappings));
      
      const configToSave = config || {
        levels: {
          follower: { priority: 1, color: '#00ff00' },
          fan: { priority: 2, color: '#0000ff' },
          super_fan: { priority: 3, color: '#ff0000' }
        }
      };
      
      socket.emit('update_config', { ...configToSave, mappings: sanitizedMappings });
      console.log('Configuración sincronizada con el backend y guardada localmente');
      setIsSaving(false);
    }, 800);
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
      localStorage.removeItem('tiktok_local_mappings');
      socket.emit('reset_config');
    }
  };
    const connectToLive = (selectedUsername) => {
    const userToConnect = selectedUsername || username;
    if (userToConnect) {
      setConnectionError('');
      socket.emit('set_username', userToConnect);
      setStatus('connecting');
       // NO guardar 'connecting' en localStorage, solo connected o disconnected
       localStorage.setItem('tiktok_current_username', userToConnect);
      
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

  const closeSession = () => {
     if (window.confirm('¿Cerrar la sesión actual?')) {
       socket.emit('disconnect_live');
       setUsername('');
       setStatus('disconnected');
       localStorage.removeItem('tiktok_current_username');
       localStorage.setItem('tiktok_session_status', 'disconnected');
       setStats({ totalLikes: 0, totalGifts: 0, totalFollowers: 0 });
       setLiveInfo({ viewerCount: 0, startTime: null, elapsed: '00:00:00' });
     }
  };

  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans selection:bg-pink-500/30 transition-colors duration-500">
      {/* Top Stats Bar */}
      <div className="bg-[var(--bg-card)]/80 backdrop-blur-md border-b border-[var(--border-card)] sticky top-0 z-40">
       <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
         {/* Izquierda: Logo y Nav */}
         <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0 overflow-x-auto pb-1">
           <Link to="/">
             <h1 className="text-xs sm:text-lg font-black tracking-tighter bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent uppercase italic hover:opacity-90 whitespace-nowrap">
               TikTok<span className="text-[var(--text-main)] not-italic text-[9px] sm:text-base"> Pro</span>
             </h1>
           </Link>
           <Link
             to="/catalog"
             className="hidden sm:block text-[9px] font-black uppercase tracking-widest text-pink-400 hover:text-pink-300 border border-pink-500/40 px-1.5 py-0.5 rounded"
           >
             Catálogo
           </Link>
           <Link
             to="/bot-lector"
             target="_blank"
             rel="noopener noreferrer"
             className="hidden lg:block text-[9px] font-black uppercase tracking-widest text-violet-400 hover:text-violet-300 border border-violet-500/40 px-1.5 py-0.5 rounded"
           >
             Bot
           </Link>
           <button
             onClick={() => { setIsBotActive(true); setShowBotModal(true); }}
             className={`hidden sm:block text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border transition-all ${
               isBotActive 
                 ? 'text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10' 
                 : 'text-pink-400 hover:text-pink-300 border-pink-500/40'
             }`}
           >
             {isBotActive ? '🎙️' : '🎙️'}
           </button>
         </div>

         {/* Centro: Sesión actual si está conectado */}
         {status === 'connected' && username && (
           <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold flex-shrink-0 whitespace-nowrap">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
             @{username}
           </div>
         )}

         {/* Derecha: Botones de control */}
         <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button 
              onClick={toggleAudio}
              className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded text-xs font-bold transition-all flex-shrink-0 ${audioEnabled ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-pink-500 text-[var(--text-main)]'}`}
              title={audioEnabled ? 'Audio On' : 'Activar Audio'}
            >
              <Volume2 size={13} className="sm:w-3.5 sm:h-3.5" />
            </button>
            
            <button 
              onClick={() => setTheme(theme === 'neon' ? 'dark' : (theme === 'dark' ? 'light' : 'neon'))}
              className={`hidden sm:flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded text-xs font-bold transition-all border border-[var(--border-card)] bg-[var(--bg-card)] flex-shrink-0`}
              title={`Tema: ${theme === 'neon' ? 'Neon' : (theme === 'dark' ? 'Dark' : 'Light')}`}
            >
              {theme === 'neon' ? '🌟' : (theme === 'dark' ? '🌙' : '☀️')}
            </button>

            <button 
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded transition-all flex-shrink-0 ${showConfig ? 'bg-pink-500 text-[var(--text-main)] shadow-lg shadow-pink-500/20' : 'bg-[var(--bg-input)] border border-[var(--border-card)] text-[var(--text-main)] opacity-80 hover:opacity-100'}`}
              title="Configuración"
            >
              <Settings size={13} className="sm:w-3.5 sm:h-3.5" />
            </button>

            {status === 'connected' && (
              <button 
                onClick={closeSession}
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-[var(--text-main)] transition-all flex-shrink-0"
                title="Cerrar sesión"
              >
                <User size={13} className="sm:w-3.5 sm:h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      
      {/* Bot Lector Modal */}
      {isBotActive && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity ${showBotModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
           <div className="bg-[var(--bg-card)] border border-pink-500/30 rounded-2xl p-0 shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-4 border-b border-[var(--border-card)] bg-[var(--bg-card)]">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-[var(--text-main)] uppercase tracking-tighter italic">Bot Lector <span className="text-pink-500">Integrado</span></h2>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-black">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> ACTIVO
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setIsBotActive(false); setShowBotModal(false); }} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-[var(--text-main)] transition-all">Apagar Bot</button>
                  <button onClick={() => setShowBotModal(false)} className="bg-[var(--bg-input)] hover:bg-[var(--border-card)] border border-[var(--border-card)] text-[var(--text-main)] px-4 py-2 rounded-xl text-xs font-bold transition-all">
                    Volver al Dashboard (Seguirá leyendo de fondo)
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto relative bg-[var(--bg-main)]">
                 <BotLectorView embedded={true} />
              </div>
           </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">

        <Routes>
          <Route path="/bot-lector" element={<BotLectorView />} />
          <Route path="/catalog" element={<GiftCatalogView />} />
          {/* <Route path="/accounts-enjambre" element={<AccountsEnjambre />} /> */}
          <Route path="/" element={
            <div className="space-y-6">
              <div className="grid grid-cols-12 gap-6">
                {/* Área Principal - Pantalla Completa */}
                <div className="col-span-12 space-y-6 transition-all duration-500">
                  {status !== 'connected' && (
                    <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-6 shadow-[var(--glow-shadow)] animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1 space-y-2">
                          <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
                            <Play size={18} className="text-pink-500" /> Control de Conexión
                          </h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Ingresa tu usuario de TikTok para iniciar el monitoreo en vivo</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="@usuario"
                            className="bg-[var(--bg-input)] border border-[var(--border-card)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-pink-500/50 outline-none transition-all w-full sm:w-64"
                          />
                          <button
                            onClick={() => connectToLive()}
                            disabled={status === 'connecting'}
                            className="bg-slate-100 text-slate-950 px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50"
                          >
                            {status === 'connecting' ? 'Conectando...' : 'Conectar'}
                          </button>
                        </div>
                      </div>
                      {connectionError && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                          <p className="text-xs font-bold text-red-400 text-center">{connectionError}</p>
                        </div>
                      )}
                    </section>
                  )}
            <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-6 shadow-[var(--glow-shadow)] ring-1 ring-blue-500/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
                  <Settings size={18} className="text-blue-500" /> Panel de Actuadores (Relays)
                </h3>
                <span className="text-[10px] font-black bg-blue-500/10 text-blue-500 px-2 py-1 rounded">ESTADO EN VIVO</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['relay_1', 'relay_2', 'relay_3', 'relay_4'].map(act => (
                  <div key={act} className={`p-4 rounded-2xl border transition-all min-h-[160px] relative flex flex-col items-center justify-center overflow-hidden ${queues[act] > 0 ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-[var(--bg-input)] border-[var(--border-card)]'}`}>
                    {/* Badge de Regalo Activo (Esquina Superior) */}
                    {activeActions[act] && (
                      <div className="absolute top-2 right-2 flex flex-col items-end animate-in fade-in zoom-in duration-300 z-20">
                        <div className="bg-blue-500 text-white w-8 h-8 rounded-lg shadow-lg flex items-center justify-center text-lg border border-white/20">
                          {getGiftIcon(activeActions[act].giftName)}
                        </div>
                        <span className="text-[6px] font-black bg-blue-500/80 text-white px-1 rounded mt-1 uppercase truncate max-w-[50px]">
                          {activeActions[act].user}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col items-center gap-3 relative z-10">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${queues[act] > 0 ? 'bg-blue-500 text-[var(--text-main)] scale-110 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-[var(--bg-card)] text-slate-600'}`}>
                        <Zap size={18} className={queues[act] > 0 ? 'animate-pulse' : ''} />
                      </div>
                      <div className="text-center">
                        {actuatorNames[act] && (
                          <span className="text-[11px] font-black text-[var(--text-main)] block mb-0.5">{actuatorNames[act]}</span>
                        )}
                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">{getActuatorType(act)} {act.match(/_(\d+)$/)?.[1]}</span>
                        {queues[act] > 0 ? (
                          <span className="text-xs font-black text-blue-400 tabular-nums animate-bounce">Cola: {queues[act]}</span>
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
                  <div key={act} className={`p-4 rounded-2xl border transition-all ${queues[act] > 0 ? 'bg-violet-500/10 border-violet-500/50' : 'bg-[var(--bg-input)] border-[var(--border-card)]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${queues[act] > 0 ? 'bg-violet-500 text-[var(--text-main)] animate-bounce' : 'bg-[var(--bg-card)] text-slate-600'}`}>
                          <Settings size={14} />
                        </div>
                        <div>
                          {actuatorNames[act] && (
                            <span className="text-[11px] font-black text-[var(--text-main)] block">{actuatorNames[act]}</span>
                          )}
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{getActuatorType(act)}</span>
                        </div>
                      </div>
                      {queues[act] > 0 && <span className="text-xs font-black text-violet-400">Activo</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-6 shadow-[var(--glow-shadow)] ring-1 ring-pink-500/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
                  <Zap size={18} className="text-pink-500" /> Meta de la Comunidad
                </h3>
                <span className="text-[10px] font-black bg-pink-500/10 text-pink-500 px-2 py-1 rounded">
                  {((likesStatus.current / likesStatus.goal) * 100).toFixed(0)}% COMPLETADO
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-3xl font-black text-[var(--text-main)] tabular-nums">{likesStatus.current.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Likes acumulados</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-bold text-slate-400">Objetivo: {likesStatus.goal.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Siguiente Activación</p>
                  </div>
                </div>
                <div className="w-full bg-[var(--bg-input)] h-4 rounded-full overflow-hidden border border-[var(--border-card)] p-0.5">
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

        {/* Sistema de Regalos y Estadísticas */}
        <div className="grid grid-cols-12 gap-6 mb-10">
            {/* Panel de Donantes Agregados */}
            <section className="col-span-12 lg:col-span-8 bg-[var(--bg-card)] backdrop-[var(--backdrop)] border border-[var(--border-card)] rounded-2xl p-6 shadow-[var(--glow-shadow)]">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Gift size={14} className="text-pink-500" /> Donantes Recientes (Agrupados)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {aggregatedGifts.length === 0 ? (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-[var(--border-card)] rounded-2xl opacity-50">
                    <p className="text-[10px] text-slate-500 font-bold uppercase italic">Esperando actividad de regalos...</p>
                  </div>
                ) : (
                  aggregatedGifts.map((g, i) => (
                    <div key={i} className="bg-[var(--bg-input)] p-4 rounded-2xl border border-[var(--border-card)]/50 group hover:border-pink-500/30 transition-all relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Gift size={40} />
                      </div>
                      <div className="flex flex-col items-center text-center relative z-10">
                        <div className="w-12 h-12 mb-3 bg-[var(--bg-card)] rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          {getGiftIcon(g.giftName)}
                        </div>
                        <p className="text-[11px] font-black text-[var(--text-main)] truncate w-full mb-1">{g.user}</p>
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            {g.giftName}
                          </span>
                          <span className="text-xs font-black text-white tabular-nums">
                            x{g.repeatCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Inventario Global de Sesión */}
            <section className="col-span-12 lg:col-span-4 bg-[var(--bg-card)] backdrop-[var(--backdrop)] border border-[var(--border-card)] rounded-2xl p-6 shadow-[var(--glow-shadow)]">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Target size={14} className="text-emerald-500" /> Inventario de Sesión
              </h3>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.keys(globalGiftStats).length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic text-center py-10">Sin acumulados todavía</p>
                ) : (
                  Object.entries(globalGiftStats)
                    .sort(([,a], [,b]) => b.count - a.count)
                    .map(([name, data]) => (
                      <div key={name} className="flex items-center justify-between p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-card)]/30 hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] flex items-center justify-center">
                            {getGiftIcon(name)}
                          </div>
                          <span className="text-[10px] font-bold text-slate-300 uppercase">{name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-400 tabular-nums block">x{data.count}</span>
                          <span className="text-[7px] text-slate-500 font-bold tabular-nums italic">{data.totalValue} 💎</span>
                        </div>
                      </div>
                    ))
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-[var(--border-card)]">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500">
                  <span>Total Monedas (Est.)</span>
                  <span className="text-[var(--text-main)] text-sm">
                    {Object.values(globalGiftStats).reduce((acc, curr) => acc + curr.totalValue, 0).toLocaleString()} 💎
                  </span>
                </div>
              </div>
            </section>
          </div>
  
        {/* Monitor y Registro de Actividad Consolidado */}
        <div className="grid grid-cols-12 gap-6">
          {/* Columna 1: Registro Detallado */}
          <section className="col-span-12 lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl overflow-hidden shadow-[var(--glow-shadow)]">
            <div className="px-6 py-4 border-b border-[var(--border-card)] flex justify-between items-center bg-[var(--bg-input)]/50">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Volume2 size={14} className="text-pink-500" /> Registro Detallado
              </h3>
              <span className="text-[10px] font-bold text-slate-600 italic uppercase">Eventos en Tiempo Real</span>
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
                        <div className="w-10 h-10 bg-[var(--bg-input)] rounded-xl border border-[var(--border-card)] flex items-center justify-center text-slate-500 group-hover:border-pink-500/50 transition-all">
                          {ev.giftName ? (
                            <span className="text-xl">{getGiftIcon(ev.giftName)}</span>
                          ) : (
                            <User size={18} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-[var(--text-main)]">{ev.user}</p>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${ev.level === 'super_fan' ? 'bg-pink-500 text-[var(--text-main)]' : (ev.level === 'fan' ? 'bg-violet-500 text-[var(--text-main)]' : 'bg-[var(--border-card)] text-[var(--text-main)] opacity-70')}`}>
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
                          Sync OK
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Columna 2: Monitor de Usuarios */}
          <section className="col-span-12 lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl overflow-hidden shadow-[var(--glow-shadow)]">
            <div className="px-6 py-4 border-b border-[var(--border-card)] flex justify-between items-center bg-[var(--bg-input)]/50">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <User size={14} className="text-blue-500" /> Actividad de Usuarios
              </h3>
              <span className="text-[10px] font-bold text-slate-600 italic uppercase">Estado</span>
            </div>
            <div className="h-[500px] overflow-y-auto custom-scrollbar">
              {events.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-2 opacity-50">
                  <User size={40} strokeWidth={1} />
                  <p className="text-xs font-bold uppercase tracking-widest">Esperando interacción...</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/30">
                  {events.map((ev, i) => (
                    <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-slate-800/20 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-[var(--bg-input)] rounded-lg border border-[var(--border-card)] flex items-center justify-center text-slate-500">
                          {ev.giftName ? <span className="text-lg">{getGiftIcon(ev.giftName)}</span> : <User size={14} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black text-[var(--text-main)]">{ev.user}</p>
                            <span className={`text-[7px] px-1 py-0.5 rounded font-black uppercase ${ev.level === 'super_fan' ? 'bg-pink-500 text-[var(--text-main)]' : 'bg-[var(--border-card)] text-[var(--text-main)] opacity-70'}`}>
                              {ev.level}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-emerald-500">LIVE</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>


        {/* Configuration Overlay */}
        {showConfig && (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-[var(--bg-main)]/95 backdrop-blur-md overflow-y-auto py-10 custom-scrollbar">
              <div className="bg-[var(--bg-card)] border border-pink-500/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-300 w-full max-w-6xl my-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 border-b border-[var(--border-card)] pb-8">
                  <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-[var(--text-main)] uppercase tracking-tighter italic">Panel de Configuración</h2>
                    {isSaving && (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest animate-pulse">
                        <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                        Guardando...
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Mapeo de lógica y actuadores físicos</p>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded mt-1 inline-block ${giftsList[0]?.image_url ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {giftsList[0]?.image_url ? `🟢 ${giftsList.length} regalos dinámicos (TikTok API)` : `🟡 ${giftsList.length} regalos (fallback local)`}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                      if (window.confirm('¿Regenerar mappings automáticos? Se reemplazarán los actuales.')) {
                        const defaults = generateSmartDefaults(giftsList);
                        setLocalMappings(defaults);
                        localStorage.setItem('tiktok_local_mappings', JSON.stringify(defaults));
                        saveConfig(defaults);
                      }
                    }}
                    className="bg-violet-500/10 hover:bg-violet-500 text-violet-400 hover:text-[var(--text-main)] px-4 py-2 rounded-xl text-xs font-bold transition-all border border-violet-500/20"
                  >
                    ⚡ Auto-Generar
                  </button>
                  <button 
                    onClick={resetConfig}
                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-[var(--text-main)] px-4 py-2 rounded-xl text-xs font-bold transition-all border border-red-500/20"
                  >
                    Restablecer
                  </button>
                  <button onClick={() => setShowConfig(false)} className="bg-[var(--bg-input)] hover:bg-[var(--border-card)] border border-[var(--border-card)] text-[var(--text-main)] px-4 py-2 rounded-xl text-xs font-bold transition-all">Cerrar</button>
                </div>
              </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {/* Personalizar Nombres de Actuadores */}
                  <div className="p-4 bg-[var(--bg-input)]/30 rounded-2xl border border-[var(--border-card)]">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Settings size={14} /> Nombres de Actuadores
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.keys(actuatorNames).map(id => (
                        <div key={id} className="space-y-1">
                          <label className="text-[7px] font-black text-slate-600 uppercase block pl-1">
                            {getActuatorType(id)} {id.match(/_(\d+)$/)?.[1] || ''}
                          </label>
                          <input
                            type="text"
                            value={actuatorNames[id]}
                            placeholder={id.replace('_', ' ')}
                            onChange={(e) => updateActuatorName(id, e.target.value)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-pink-500/50 text-[var(--text-main)] placeholder:opacity-30"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metas de la Comunidad */}
                  <div className="p-4 bg-[var(--bg-input)]/30 rounded-2xl border border-[var(--border-card)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5">
                      <Target size={60} />
                    </div>
                    <div className="flex justify-between items-center mb-4 relative z-10">
                      <h3 className="text-[10px] font-black text-pink-500 uppercase tracking-widest flex items-center gap-2">
                        <Heart size={14} /> Metas de la Comunidad
                      </h3>
                      <button 
                        onClick={() => {
                          const newId = localMappings.length > 0 ? Math.max(...localMappings.map(m => m.id)) + 1 : 1;
                          const newGoal = { id: newId, event: 'like_goal', threshold: 1000, action: ['relay_1'], autoReset: true, duration: 1000 };
                          setLocalMappings([...localMappings, newGoal]);
                        }}
                        className="text-[9px] font-black bg-pink-500 text-white px-2 py-1 rounded-lg uppercase transition-all hover:bg-pink-600"
                      >
                        + Añadir Meta
                      </button>
                    </div>

                    <div className="space-y-4 relative z-10 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {localMappings.filter(m => m.event.endsWith('_goal')).map((m) => {
                        const idx = localMappings.findIndex(lm => lm.id === m.id);
                        return (
                          <div key={m.id} className="p-4 bg-[var(--bg-card)]/50 rounded-2xl border border-pink-500/20 space-y-4 relative group/goal">
                            <button 
                              onClick={() => {
                                if (window.confirm('¿Estás seguro de que quieres eliminar esta meta de comunidad?')) {
                                  const next = localMappings.filter(lm => lm.id !== m.id);
                                  setLocalMappings(next);
                                  saveConfig(next);
                                }
                              }}
                              className="absolute top-2 right-2 text-slate-600 hover:text-red-500 opacity-0 group-hover/goal:opacity-100 transition-opacity"
                            >
                              <Zap size={12} className="rotate-45" />
                            </button>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[7px] font-black text-slate-500 uppercase mb-1 block">Tipo de Meta</label>
                                <select 
                                  value={m.event} 
                                  onChange={(e) => updateMapping(idx, 'event', e.target.value)}
                                  className="w-full bg-[var(--bg-input)] border border-[var(--border-card)] rounded-lg px-2 py-1.5 text-[10px] text-[var(--text-main)] outline-none"
                                >
                                  <option value="like_goal">Likes del Live</option>
                                  <option value="follow_goal">Nuevos Seguidores</option>
                                  <option value="share_goal">Compartidas</option>
                                  <option value="viewer_goal">Récord Espectadores</option>
                                  <option value="gift_value_goal">Diamantes (Monedas)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[7px] font-black text-slate-500 uppercase mb-1 block">Objetivo (Cantidad)</label>
                                <input 
                                  type="number" 
                                  value={m.threshold} 
                                  onChange={(e) => updateMapping(idx, 'threshold', e.target.value)} 
                                  className="w-full bg-[var(--bg-input)] border border-pink-500/20 rounded-lg px-2 py-1.5 text-[10px] font-black text-pink-500 outline-none focus:border-pink-500/50" 
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[7px] font-black text-slate-500 uppercase mb-2 block">Actuadores a disparar</label>
                              <div className="grid grid-cols-3 gap-2">
                                {Object.keys(actuatorNames).map(actId => (
                                  <label key={actId} className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all cursor-pointer ${m.action.includes(actId) ? 'bg-pink-500/10 border-pink-500/30' : 'bg-[var(--bg-input)] border-transparent'}`}>
                                    <input 
                                      type="checkbox"
                                      checked={m.action.includes(actId)}
                                      onChange={() => {
                                        const nextActions = m.action.includes(actId) 
                                          ? m.action.filter(a => a !== actId)
                                          : [...m.action, actId];
                                        updateMapping(idx, 'action', nextActions);
                                      }}
                                      className="hidden"
                                    />
                                    <span className={`text-[8px] font-bold truncate ${m.action.includes(actId) ? 'text-pink-400' : 'text-slate-600'}`}>
                                      {actuatorNames[actId] || actId.replace('_', ' ')}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <label className="text-[7px] font-black text-slate-500 uppercase mb-1 block">Duración (ms)</label>
                                <input 
                                  type="number" 
                                  value={m.duration} 
                                  onChange={(e) => updateMapping(idx, 'duration', e.target.value)} 
                                  className="w-full bg-[var(--bg-input)] border border-[var(--border-card)] rounded-lg px-2 py-1.5 text-[10px] text-[var(--text-main)] outline-none" 
                                />
                              </div>
                              <button 
                                onClick={() => updateMapping(idx, 'autoReset', !m.autoReset)}
                                className={`mt-3 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all border ${m.autoReset ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-slate-500/10 border-slate-500/30 text-slate-500'}`}
                              >
                                Auto-Reset: {m.autoReset ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {localMappings.filter(m => m.event.endsWith('_goal')).length === 0 && (
                        <div className="py-10 text-center opacity-30 italic text-[10px] font-bold uppercase">No hay metas activas</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-10 border-t border-[var(--border-card)] pt-8">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Zap size={14} className="text-pink-500" /> Mapeo de Regalos Específicos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {localMappings.map((m, index) => (
                    <div key={m.id} className="bg-[var(--bg-input)] p-5 rounded-2xl border border-[var(--border-card)] relative group hover:border-[var(--border-card-hover)] transition-all">
                      <button 
                        onClick={() => {
                          if (window.confirm(`¿Estás seguro de que quieres eliminar el mapeo del Slot #${m.id}?`)) {
                            removeMapping(m.id);
                          }
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-[var(--text-main)] w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-all shadow-xl hover:scale-110 z-10"
                      >
                        ✕
                      </button>
                      
                      <div className="flex justify-between items-center mb-5">
                        <div>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">Slot #{m.id}</span>
                          {m._migratedFrom && (
                            <span className="block text-[8px] text-amber-400 font-bold mt-0.5">
                              ⚠️ Auto-migrado desde "{m._migratedFrom}"
                            </span>
                          )}
                        </div>
                        <select 
                          value={m.event}
                          onChange={(e) => updateMapping(index, 'event', e.target.value)}
                          className="bg-[var(--bg-card)] text-[10px] font-black text-pink-500 border-none outline-none rounded-lg px-2 py-1 uppercase tracking-wider"
                        >
                          <option value="gift">Gift (Nombre)</option>
                          <option value="gift_value">Gift (Valor)</option>
                          <option value="gift_any">Gift (Cualquiera)</option>
                          <option value="like_goal">Like Goal</option>
                          <option value="follow">Follow</option>
                        </select>
                      </div>

                      <div className="space-y-4">
                        {m.event === 'gift' && (
                          <div className="space-y-3">
                            <div className="flex gap-3">
                              <div className="w-12 h-12 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl flex items-center justify-center text-2xl">
                                {getGiftIcon(m.giftName)}
                              </div>
                              <div className="flex-1">
                                <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Identificador</label>
                                <input 
                                  type="text" 
                                  value={m.giftName || ''} 
                                  onChange={(e) => updateMapping(index, 'giftName', e.target.value)}
                                  className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-3 py-2 text-xs outline-none focus:border-pink-500/50 text-[var(--text-main)]"
                                  placeholder="Nombre exacto"
                                />
                              </div>
                            </div>
                            <div className="space-y-2 mt-2">
                              <div className="flex gap-1.5 items-center bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-2.5 py-1">
                                <Search size={10} className="text-slate-500" />
                                <input
                                  type="text"
                                  placeholder="Buscar por nombre..."
                                  value={giftSearchQuery}
                                  onChange={(e) => setGiftSearchQuery(e.target.value)}
                                  className="bg-transparent text-[10px] outline-none text-[var(--text-main)] placeholder:opacity-50 w-full"
                                />
                                {giftSearchQuery && (
                                  <button onClick={() => setGiftSearchQuery('')} className="text-[10px] text-slate-500 hover:text-white">✕</button>
                                )}
                              </div>
                              <div className="flex gap-1 justify-between">
                                {['all', 'low', 'medium', 'high'].map(filter => (
                                  <button
                                    key={filter}
                                    onClick={() => setGiftFilter(filter)}
                                    type="button"
                                    className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border transition-all ${giftFilter === filter ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'border-transparent text-slate-500 hover:text-[var(--text-main)]'}`}
                                  >
                                    {filter === 'all' && 'Todos'}
                                    {filter === 'low' && 'Bajo'}
                                    {filter === 'medium' && 'Medio'}
                                    {filter === 'high' && 'Alto'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                              {(() => {
                                const uniqueMap = new Map();
                                filteredGifts.forEach(g => {
                                  if (g.name) {
                                    const key = g.name.toLowerCase();
                                    if (!uniqueMap.has(key) || (!uniqueMap.get(key).image_url && g.image_url)) {
                                      uniqueMap.set(key, g);
                                    }
                                  }
                                });
                                return Array.from(uniqueMap.values())
                                  .filter(g => g.name.toLowerCase().includes(giftSearchQuery.toLowerCase()))
                                  .map((gift, gi) => {
                                    const imgUrl = gift.image_url || (typeof gift.icon === 'string' && gift.icon.startsWith('http') ? gift.icon : null);
                                    return (
                                      <button
                                        key={gift.id || gift.name + gi}
                                        onClick={() => updateMapping(index, 'giftName', gift.name)}
                                        className={`text-[9px] px-2 py-1 rounded-md border transition-all flex items-center gap-1 ${m.giftName === gift.name ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-[var(--bg-card)] border-[var(--border-card)] text-slate-500 hover:border-slate-600'}`}
                                      >
                                        {imgUrl ? (
                                          <img src={imgUrl} alt={gift.name} className="w-4 h-4 object-contain" />
                                        ) : (
                                          <span>{typeof gift.icon === 'string' ? gift.icon : '🎁'}</span>
                                        )}
                                        {gift.name}
                                      </button>
                                    );
                                  });
                              })()}
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
                                className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)]" 
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Max Monedas</label>
                              <input 
                                type="number" 
                                value={m.maxValue} 
                                onChange={(e) => updateMapping(index, 'maxValue', e.target.value)} 
                                className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)]" 
                              />
                            </div>
                          </div>
                        )}

                        {m.event === 'gift_any' && (
                          <div className="space-y-3">
                            <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">Categoría de Regalo</label>
                            <div className="flex gap-2 flex-wrap">
                              {[
                                { value: 'all', label: 'Todos', color: 'slate' },
                                { value: 'low', label: 'Bajo', color: 'blue' },
                                { value: 'medium', label: 'Medio', color: 'amber' },
                                { value: 'high', label: 'Alto', color: 'pink' }
                              ].map(cat => (
                                <button
                                  key={cat.value}
                                  onClick={() => updateMapping(index, 'giftCategory', cat.value)}
                                  className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all border ${
                                    m.giftCategory === cat.value
                                      ? `bg-${cat.color}-500/20 border-${cat.color}-500/50 text-${cat.color}-400`
                                      : `border-[var(--border-card)] text-slate-500 hover:text-[var(--text-main)]`
                                  }`}
                                >
                                  {cat.label}
                                </button>
                              ))}
                            </div>
                            <p className="text-[8px] text-slate-500 italic">
                              {m.giftCategory === 'all' && '✓ Se activará con CUALQUIER regalo'}
                              {m.giftCategory === 'low' && '✓ Se activará con regalos de bajo valor'}
                              {m.giftCategory === 'medium' && '✓ Se activará con regalos de valor medio'}
                              {m.giftCategory === 'high' && '✓ Se activará con regalos de alto valor'}
                            </p>
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
                                className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)]" 
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

                        <div className="pt-3 border-t border-[var(--border-card)]/50">
                          <div>
                            <label className="text-[8px] font-black text-slate-600 uppercase mb-2 block">Actuadores (selección múltiple)</label>
                            <div className="grid grid-cols-2 gap-2">
                              {['relay_1', 'relay_2', 'relay_3', 'relay_4'].map(actuator => (
                                <label key={actuator} className="flex items-center gap-2 cursor-pointer hover:bg-[var(--border-card)] p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={(m.action || []).includes(actuator)}
                                    onChange={(e) => updateMappingActions(index, actuator, e.target.checked)}
                                    className="w-3 h-3 text-pink-500 bg-[var(--bg-input)] border-[var(--border-card)] rounded focus:ring-pink-500"
                                  />
                                  <div className="leading-tight">
                                    {actuatorNames[actuator] && (
                                      <span className="text-[9px] font-black text-[var(--text-main)] block">{actuatorNames[actuator]}</span>
                                    )}
                                    <span className="text-[8px] font-bold text-slate-500 uppercase">{getActuatorType(actuator)} {actuator.match(/_(\d+)$/)?.[1]}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {['led_pulse', 'servo_wave'].map(actuator => (
                                <label key={actuator} className="flex items-center gap-2 cursor-pointer hover:bg-[var(--border-card)] p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={(m.action || []).includes(actuator)}
                                    onChange={(e) => updateMappingActions(index, actuator, e.target.checked)}
                                    className="w-3 h-3 text-pink-500 bg-[var(--bg-input)] border-[var(--border-card)] rounded focus:ring-pink-500"
                                  />
                                  <div className="leading-tight">
                                    {actuatorNames[actuator] && (
                                      <span className="text-[9px] font-black text-[var(--text-main)] block">{actuatorNames[actuator]}</span>
                                    )}
                                    <span className="text-[8px] font-bold text-slate-500 uppercase">{getActuatorType(actuator)}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                            {(m.action || []).length > 0 && (
                              <div className="mt-2 p-2 bg-[var(--bg-card)]/50 rounded-lg border border-[var(--border-card)]">
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
                              className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg px-2 py-2 text-[10px] text-[var(--text-main)] outline-none" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={addMapping}
                    className="bg-[var(--bg-input)] border-2 border-dashed border-[var(--border-card)] rounded-2xl flex flex-col items-center justify-center p-8 hover:border-pink-500/30 hover:bg-[var(--bg-card)]/50 transition-all group min-h-[250px]"
                  >
                    <div className="w-12 h-12 bg-[var(--border-card)] rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <span className="text-2xl text-slate-600 group-hover:text-pink-500">+</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-400">Nuevo Mapeo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

            </div>
          } />
        </Routes>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        
        :root {
          --bg-main: #0f172a; /* slate-900 */
          --text-main: #f8fafc; /* slate-50 */
          --bg-card: #1e293b; /* slate-800 */
          --border-card: #334155; /* slate-700 */
          --border-card-hover: #475569;
          --bg-input: #020617;
          --glow-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
          --backdrop: none;
        }
        [data-theme="neon"] {
          --bg-main: #020617; /* slate-950 */
          --text-main: #f8fafc; /* slate-50 */
          --bg-card: rgba(15, 23, 42, 0.4);
          --border-card: rgba(236, 72, 153, 0.3);
          --border-card-hover: rgba(236, 72, 153, 0.6);
          --bg-input: rgba(2, 6, 23, 0.6);
          --glow-shadow: 0 0 20px rgba(236, 72, 153, 0.15);
          --backdrop: blur(12px);
        }
        [data-theme="light"] {
          --bg-main: #f8fafc;
          --text-main: #0f172a;
          --bg-card: #ffffff;
          --border-card: #e2e8f0;
          --border-card-hover: #cbd5e1;
          --bg-input: #f1f5f9;
          --glow-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
          --backdrop: none;
        }

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
