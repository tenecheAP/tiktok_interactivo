import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Trash2, ArrowLeft, Headphones, Users, Volume2 } from 'lucide-react';
import socket from '../socket';
import { TtsQueue } from './ttsQueue';
import { reduceGift, reduceChat } from './botRulesEngine';
import {
  DEFAULT_BOT_CONFIG,
  loadBotConfig,
  saveBotConfig,
} from './defaultBotConfig';

const TTS_STORAGE_KEY = 'tiktok_bot_lector_tts_params';

function loadTtsParams() {
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (!raw) return { rate: 1, pitch: 1, volume: 1, voiceURI: '', lang: 'es-ES' };
    return { ...JSON.parse(raw) };
  } catch {
    return { rate: 1, pitch: 1, volume: 1, voiceURI: '', lang: 'es-ES' };
  }
}

function saveTtsParams(p) {
  localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(p));
}

export default function BotLectorView() {
  const [botConfig, setBotConfig] = useState(() => loadBotConfig());
  const [ttsParams, setTtsParams] = useState(() => loadTtsParams());
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => loadTtsParams().voiceURI || '');

  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [liveInfo, setLiveInfo] = useState({ viewerCount: 0 });

  const [viewerMap, setViewerMap] = useState({});
  const viewerMapRef = useRef({});

  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ totalGiftsProcessed: 0, totalChatsProcessed: 0, totalUtterances: 0 });
  const pushLog = useCallback((level, message) => {
    const line = `[${new Date().toLocaleTimeString()}] ${level.toUpperCase()}: ${message}`;
    setLogs((prev) => [line, ...prev].slice(0, 200));
  }, []);

  const ttsRef = useRef(null);
  const [ttsPaused, setTtsPaused] = useState(false);
  const ttsPausedRef = useRef(false);
  useEffect(() => {
    ttsPausedRef.current = ttsPaused;
  }, [ttsPaused]);

  // Persistir viewerMap en sessionStorage para recuperación tras refresh
  const VIEWER_MAP_KEY = 'tiktok_bot_lector_viewer_map';
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(VIEWER_MAP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        viewerMapRef.current = parsed;
        setViewerMap(parsed);
      }
    } catch (e) {
      pushLog('warn', 'No se pudo cargar mapa de espectadores guardado.');
    }
  }, []);
  useEffect(() => {
    sessionStorage.setItem(VIEWER_MAP_KEY, JSON.stringify(viewerMap));
  }, [viewerMap]);

  useEffect(() => {
    if (!ttsRef.current) ttsRef.current = new TtsQueue();
    return () => {
      ttsRef.current?.flush();
    };
  }, []);

   useEffect(() => {
     const refreshVoices = () => {
       const list = window.speechSynthesis.getVoices();
       setVoices(list);
       if (!selectedVoiceURI && list.length) {
         const pick = TtsQueue.pickFemaleSpanishVoice(list);
         if (pick) {
           setSelectedVoiceURI(pick.voiceURI);
           setTtsParams((p) => ({ ...p, voiceURI: pick.voiceURI }));
         }
       }
     };
     refreshVoices();
     window.speechSynthesis.onvoiceschanged = refreshVoices;
     return () => {
       window.speechSynthesis.onvoiceschanged = null;
     };
   }, [selectedVoiceURI]);

   // TTS error handling – fallback a AudioContext synth
   useEffect(() => {
     const handleTtsError = (e) => {
       pushLog('warn', `TTS error: ${e.error?.message || e.type}. Activando fallback...`);
       // Aquí se podría activar un fallback a Web Audio API synth
     };
     window.speechSynthesis.onerror = handleTtsError;
     return () => {
       window.speechSynthesis.onerror = null;
     };
   }, [pushLog]);

  useEffect(() => {
    const q = ttsRef.current;
    if (!q) return;
    q.setParams({
      rate: ttsParams.rate,
      pitch: ttsParams.pitch,
      volume: ttsParams.volume,
      lang: ttsParams.lang || 'es-ES',
      voice: selectedVoiceURI
        ? voices.find((x) => x.voiceURI === selectedVoiceURI) || null
        : null,
    });
    saveTtsParams({ ...ttsParams, voiceURI: selectedVoiceURI });
  }, [ttsParams, voices, selectedVoiceURI]);

   const processGift = useCallback(
     (payload) => {
       const prev = viewerMapRef.current;
       const { viewers: next, outputs } = reduceGift(botConfig, prev, payload);
       viewerMapRef.current = next;
       setViewerMap(next);
       setStats(s => ({ ...s, totalGiftsProcessed: s.totalGiftsProcessed + 1 }));
       queueMicrotask(() => {
         outputs.forEach((o) => {
           if (o.type === 'log') pushLog(o.level, o.message);
         });
       });
     },
     [botConfig, pushLog]
   );

   const processChat = useCallback(
     (payload) => {
       const prev = viewerMapRef.current;
       const { viewers: next, outputs } = reduceChat(botConfig, prev, payload);
       viewerMapRef.current = next;
       setViewerMap(next);
       setStats(s => ({ ...s, totalChatsProcessed: s.totalChatsProcessed + 1 }));
       queueMicrotask(() => {
         outputs.forEach((o) => {
           if (o.type === 'log') pushLog(o.level, o.message);
           if (o.type === 'utterance' && !ttsPausedRef.current) {
             ttsRef.current?.speak(o.text, o.priority);
             setStats(s => ({ ...s, totalUtterances: s.totalUtterances + 1 }));
           }
         });
       });
     },
     [botConfig, pushLog]
   );

   useEffect(() => {
     socket.on('connection_status', (data) => {
       setStatus(data.status);
       if (data.status === 'connected') {
         setConnectionError('');
         setReconnectAttempts(0);
         pushLog('info', 'Conectado al live.');
       } else if (data.status === 'error') {
         setConnectionError(data.error || 'Error');
         pushLog('error', `Error de conexión: ${data.error || 'desconocido'}`);
       } else if (data.status === 'disconnected') {
         pushLog('warn', 'Desconectado del live.');
       }
     });

     socket.on('live_info', (data) => {
       setLiveInfo((prev) => ({ ...prev, viewerCount: data.viewerCount }));
     });

     socket.on('connect', () => {
       pushLog('info', 'Socket conectado al servidor.');
     });

     socket.on('disconnect', (reason) => {
       pushLog('warn', `Socket desconectado: ${reason}`);
     });

     socket.on('reconnect_attempt', (attempt) => {
       setReconnectAttempts(attempt);
       pushLog('warn', `Reintentando conexión (intento ${attempt})...`);
     });

     socket.on('reconnect', (attempt) => {
       setReconnectAttempts(0);
       pushLog('info', `Reconexión exitosa después de ${attempt || 0} intentos.`);
     });

     socket.on('reconnect_failed', () => {
       pushLog('error', 'Fallo de reconexión después de 10 intentos. Recarga la página.');
     });

    const onGift = (payload) => processGift(payload);
    const onChat = (payload) => processChat(payload);

    socket.on('live_gift', onGift);
    socket.on('live_chat', onChat);

     return () => {
       socket.off('connection_status');
       socket.off('live_info');
       socket.off('live_gift', onGift);
       socket.off('live_chat', onChat);
       socket.off('connect');
       socket.off('disconnect');
       socket.off('reconnect_attempt');
       socket.off('reconnect');
       socket.off('reconnect_failed');
     };
   }, [processGift, processChat, pushLog]);

  const connectToLive = () => {
    if (!username.trim()) {
      pushLog('warn', 'Nombre de usuario vacío.');
      return;
    }
    setConnectionError('');
    socket.emit('set_username', username.trim());
    setStatus('connecting');
    pushLog('info', `Intentando conectar a @${username.trim()}...`);
  };

  const resetSession = () => {
    viewerMapRef.current = {};
    setViewerMap({});
    ttsRef.current?.flush();
    pushLog('info', 'Estado de espectadores reiniciado para esta sesión.');
  };

  const togglePause = () => {
    const q = ttsRef.current;
    if (!q) return;
    if (ttsPaused) {
      q.resume();
      setTtsPaused(false);
      pushLog('info', 'TTS reanudado.');
    } else {
      q.pause();
      setTtsPaused(true);
      pushLog('info', 'TTS pausado.');
    }
  };

  const persistBotField = (patch) => {
    const next = { ...botConfig, ...patch };
    setBotConfig(next);
    saveBotConfig(next);
  };

  const spanishVoices = useMemo(
    () => TtsQueue.listSpanishVoices(voices),
    [voices]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-bold uppercase"
            >
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <Headphones className="text-pink-500" size={22} />
              Bot lector
            </h1>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono uppercase">
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${
              status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
              status === 'connecting' ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                status === 'connected' ? 'bg-emerald-500' :
                status === 'connecting' ? 'bg-amber-500 animate-pulse' :
                'bg-red-500'
              }`}></div>
              {status === 'connected' ? 'ACTIVO' : status === 'connecting' ? `CONECTANDO${reconnectAttempts > 0 ? ` (${reconnectAttempts})` : ''}` : 'INACTIVO'}
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} className="text-slate-500" />
              {liveInfo.viewerCount}
            </span>
            <span className="text-slate-600">|</span>
            <span title="Regalos procesados">🎁 {stats.totalGiftsProcessed}</span>
            <span title="Chats procesados">💬 {stats.totalChatsProcessed}</span>
            <span title="Utterances TTS">🔊 {stats.totalUtterances}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <p className="text-xs text-slate-500 leading-relaxed">
          Sin API oficial de TikTok: depende de{' '}
          <code className="text-slate-400">tiktok-live-connector</code>. Si no
          llega <code className="text-slate-400">uniqueId</code>, la clave es el
          nickname (riesgo de colisión entre usuarios).
        </p>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Conexión al live
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@usuario TikTok en vivo"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500/40"
            />
            <button
              type="button"
              onClick={connectToLive}
              disabled={status === 'connecting'}
              className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-2 rounded-xl disabled:opacity-50"
            >
              {status === 'connecting' ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
          {connectionError && (
            <p className="text-sm text-red-400">{connectionError}</p>
          )}
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Volume2 size={14} /> Voz (Web Speech API)
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">
              Voz
              <select
                value={selectedVoiceURI}
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Predeterminada del navegador</option>
                {spanishVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-bold text-slate-500 uppercase">
              Idioma utterance
              <input
                type="text"
                value={ttsParams.lang}
                onChange={(e) =>
                  setTtsParams((p) => ({ ...p, lang: e.target.value }))
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              ['rate', 'Velocidad', 0.5, 2, 0.05],
              ['pitch', 'Tono', 0, 2, 0.05],
              ['volume', 'Volumen', 0, 1, 0.05],
            ].map(([key, label, min, max, step]) => (
              <label
                key={key}
                className="block text-[10px] font-bold text-slate-500 uppercase"
              >
                {label}: {Number(ttsParams[key]).toFixed(2)}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={ttsParams[key]}
                  onChange={(e) =>
                    setTtsParams((p) => ({
                      ...p,
                      [key]: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full mt-1 accent-pink-500"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={togglePause}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold uppercase border border-slate-700"
            >
              {ttsPaused ? <Mic size={16} /> : <MicOff size={16} />}
              {ttsPaused ? 'Reanudar lectura' : 'Pausar lectura'}
            </button>
            <button
              type="button"
              onClick={() => {
                ttsRef.current?.flush();
                pushLog('info', 'Cola TTS vaciada.');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold uppercase border border-slate-700"
            >
              <Trash2 size={16} /> Vaciar cola
            </button>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Reglas de regalos
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Regalos activación (coma)
              </span>
              <input
                type="text"
                value={botConfig.activationGiftNames.join(', ')}
                onChange={(e) =>
                  persistBotField({
                    activationGiftNames: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Regalos continuación (coma)
              </span>
              <input
                type="text"
                value={botConfig.continuationGiftNames.join(', ')}
                onChange={(e) =>
                  persistBotField({
                    continuationGiftNames: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Comentarios por bloque
              </span>
              <input
                type="number"
                min={1}
                value={botConfig.commentsPerBlock}
                onChange={(e) =>
                  persistBotField({
                    commentsPerBlock: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Máx. comentarios por espectador (sesión)
              </span>
              <input
                type="number"
                min={1}
                value={botConfig.maxCommentsPerViewerSession}
                onChange={(e) =>
                  persistBotField({
                    maxCommentsPerViewerSession: Math.max(
                      1,
                      parseInt(e.target.value, 10) || 1
                    ),
                  })
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                VIP: mínimo monedas (activa lectura)
              </span>
              <input
                type="number"
                min={0}
                value={botConfig.vipMinCoinValue}
                onChange={(e) =>
                  persistBotField({
                    vipMinCoinValue: Math.max(
                      0,
                      parseInt(e.target.value, 10) || 0
                    ),
                  })
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                VIP nombres (coma)
              </span>
              <input
                type="text"
                value={botConfig.vipGiftNames.join(', ')}
                onChange={(e) =>
                  persistBotField({
                    vipGiftNames: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={botConfig.priorityVipFirst}
                onChange={(e) =>
                  persistBotField({ priorityVipFirst: e.target.checked })
                }
                className="rounded border-slate-600"
              />
              <span className="text-xs">Prioridad VIP en cola TTS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={botConfig.readUsername}
                onChange={(e) =>
                  persistBotField({ readUsername: e.target.checked })
                }
                className="rounded border-slate-600"
              />
              <span className="text-xs">Leer nombre de usuario</span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setBotConfig({ ...DEFAULT_BOT_CONFIG });
              saveBotConfig({ ...DEFAULT_BOT_CONFIG });
            }}
            className="text-xs text-slate-500 underline"
          >
            Restaurar valores por defecto
          </button>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
              Espectadores
            </h2>
            <button
              type="button"
              onClick={resetSession}
              className="text-[10px] font-bold uppercase text-amber-500 hover:text-amber-400"
            >
              Reiniciar sesión bot
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-2">Clave</th>
                  <th className="py-2 pr-2">Estado</th>
                  <th className="py-2 pr-2">Leídos</th>
                  <th className="py-2 pr-2">Bloque rest.</th>
                  <th className="py-2">VIP cola</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(viewerMap).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-slate-600 italic">
                      Aún no hay espectadores en el mapa (espera regalos o chat).
                    </td>
                  </tr>
                ) : (
                  Object.entries(viewerMap).map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-800/50">
                      <td className="py-2 font-mono text-[10px] truncate max-w-[140px]">
                        {k}
                      </td>
                      <td className="py-2">{v.state}</td>
                      <td className="py-2">{v.totalRead}</td>
                      <td className="py-2">{v.blockRemaining}</td>
                      <td className="py-2">{v.vipBoost ? 'sí' : 'no'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Simulación (mismo socket que el dashboard)
          </h2>
          <div className="flex flex-wrap gap-2">
            {['gift', 'chat'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => socket.emit('simulate_event', t)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-[10px] font-black uppercase border border-slate-700"
              >
                Simular {t}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-600">
            Simula <code>gift</code> y luego <code>chat</code> para probar la
            cadena (activación Rose → comentarios).
          </p>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
            Registro
          </h2>
          <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap max-h-56 overflow-y-auto">
            {logs.length === 0 ? 'Sin mensajes.' : logs.join('\n')}
          </pre>
        </section>
      </main>
    </div>
  );
}
