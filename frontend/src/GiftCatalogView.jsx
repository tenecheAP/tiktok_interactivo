import React, { useState, useEffect } from 'react';
import { Gift, Search, Download, RefreshCw, Star, TrendingUp, DollarSign, Calendar, Eye } from 'lucide-react';
import socket from './socket';

export default function GiftCatalogView() {
    const [gifts, setGifts] = useState([]);
    const [stats, setStats] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('timesReceived'); // 'name', 'diamonds', 'timesReceived', 'lastSeen'
    const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
    const [filterTier, setFilterTier] = useState('all'); // 'all', 'free', 'low', 'medium', 'high'
    const [isLoading, setIsLoading] = useState(true);

    const backendUrl = import.meta.env.DEV 
        ? `http://${window.location.hostname}:3000` 
        : '';

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const giftsRes = await fetch(`${backendUrl}/api/catalog/gifts`);
            const giftsData = await giftsRes.json();
            setGifts(giftsData);

            const statsRes = await fetch(`${backendUrl}/api/catalog/stats`);
            const statsData = await statsRes.json();
            setStats(statsData);
        } catch (error) {
            console.error('Error fetching catalog data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Escuchar actualizaciones en tiempo real vía socket
        socket.on('gift_catalog_updated', (updatedGifts) => {
            console.log('[SOCKET] Catálogo de regalos actualizado.');
            setGifts(updatedGifts);
            
            // Refrescar las estadísticas
            fetch(`${backendUrl}/api/catalog/stats`)
                .then(res => res.json())
                .then(data => setStats(data))
                .catch(err => console.error(err));
        });

        return () => {
            socket.off('gift_catalog_updated');
        };
    }, []);

    // Filtrar regalos
    const filteredGifts = gifts.filter(gift => {
        const matchesSearch = gift.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             gift.id.toString().includes(searchQuery);
        
        let matchesTier = true;
        if (filterTier === 'free') matchesTier = gift.diamonds === 0;
        else if (filterTier === 'low') matchesTier = gift.diamonds > 0 && gift.diamonds < 100;
        else if (filterTier === 'medium') matchesTier = gift.diamonds >= 100 && gift.diamonds < 1000;
        else if (filterTier === 'high') matchesTier = gift.diamonds >= 1000;

        return matchesSearch && matchesTier;
    });

    // Ordenar regalos
    const sortedGifts = [...filteredGifts].sort((a, b) => {
        let fieldA, fieldB;
        if (sortBy === 'name') {
            fieldA = a.name.toLowerCase();
            fieldB = b.name.toLowerCase();
        } else if (sortBy === 'diamonds') {
            fieldA = a.diamonds;
            fieldB = b.diamonds;
        } else if (sortBy === 'timesReceived') {
            fieldA = a.timesReceived;
            fieldB = b.timesReceived;
        } else if (sortBy === 'lastSeen') {
            fieldA = new Date(a.lastSeen).getTime();
            fieldB = new Date(b.lastSeen).getTime();
        }

        if (fieldA < fieldB) return sortOrder === 'asc' ? -1 : 1;
        if (fieldA > fieldB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const toggleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'Nunca';
        const d = new Date(isoString);
        return d.toLocaleString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header del Catálogo */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border-card)]">
                <div>
                    <h2 className="text-xl font-black text-[var(--text-main)] uppercase tracking-tighter italic flex items-center gap-2">
                        <Gift className="text-pink-500 animate-pulse" size={24} />
                        Catálogo Inteligente de Regalos
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                        Sincronización en tiempo real y estadísticas del inventario de donaciones
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={fetchData}
                        className="bg-[var(--bg-input)] hover:bg-[var(--border-card)] border border-[var(--border-card)] text-[var(--text-main)] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        Refrescar
                    </button>
                    <a 
                        href={`${backendUrl}/api/catalog/export/csv`} 
                        download
                        className="bg-violet-500/10 hover:bg-violet-500 text-violet-400 hover:text-white border border-violet-500/20 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        <Download size={14} />
                        Exportar CSV
                    </a>
                    <a 
                        href={`${backendUrl}/api/catalog/export/json`} 
                        download
                        className="bg-pink-500/10 hover:bg-pink-500 text-pink-400 hover:text-white border border-pink-500/20 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        <Download size={14} />
                        Exportar JSON
                    </a>
                </div>
            </div>

            {/* Panel de Estadísticas */}
            {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-card)] flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-2 bottom-2 text-pink-500/5 group-hover:scale-110 transition-transform">
                            <Gift size={64} />
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-500">
                            <Star size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Regalos Detectados</p>
                            <p className="text-xl font-black text-[var(--text-main)] mt-0.5 tabular-nums">{stats.totalGifts}</p>
                        </div>
                    </div>

                    <div className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-card)] flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-2 bottom-2 text-violet-500/5 group-hover:scale-110 transition-transform">
                            <TrendingUp size={64} />
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                            <TrendingUp size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Regalo Más Recibido</p>
                            <p className="text-sm font-black text-[var(--text-main)] mt-0.5 truncate uppercase">
                                {stats.mostSentGift ? `${stats.mostSentGift.name} (x${stats.mostSentGift.timesReceived})` : 'Ninguno'}
                            </p>
                        </div>
                    </div>

                    <div className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-card)] flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-2 bottom-2 text-emerald-500/5 group-hover:scale-110 transition-transform">
                            <DollarSign size={64} />
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Diamantes Acumulados</p>
                            <p className="text-xl font-black text-emerald-400 mt-0.5 tabular-nums">💎 {stats.accumulatedDiamonds.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-card)] flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-2 bottom-2 text-blue-500/5 group-hover:scale-110 transition-transform">
                            <Calendar size={64} />
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Calendar size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Último Detectado</p>
                            <p className="text-sm font-black text-[var(--text-main)] mt-0.5 truncate uppercase">
                                {stats.lastSeenGift ? stats.lastSeenGift.name : 'Ninguno'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Barra de Filtros y Búsqueda */}
            <div className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-card)] flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre o ID..."
                        className="bg-[var(--bg-input)] border border-[var(--border-card)] rounded-xl pl-10 pr-4 py-2.5 text-xs w-full focus:ring-2 focus:ring-pink-500/50 outline-none text-[var(--text-main)] placeholder:opacity-50"
                    />
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    {['all', 'free', 'low', 'medium', 'high'].map(tier => (
                        <button
                            key={tier}
                            onClick={() => setFilterTier(tier)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                                filterTier === tier 
                                    ? 'bg-pink-500 border-pink-500 text-white shadow-md shadow-pink-500/20' 
                                    : 'bg-[var(--bg-input)] border-[var(--border-card)] text-slate-400 hover:text-[var(--text-main)]'
                            }`}
                        >
                            {tier === 'all' && 'Todos'}
                            {tier === 'free' && 'Gratis (0 💎)'}
                            {tier === 'low' && 'Bajo (<100 💎)'}
                            {tier === 'medium' && 'Medio (<1k 💎)'}
                            {tier === 'high' && 'Alto (1k+ 💎)'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabla / Grid de Regalos */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl overflow-hidden shadow-lg">
                {sortedGifts.length === 0 ? (
                    <div className="p-16 text-center text-slate-500 uppercase font-black tracking-widest text-[11px] italic">
                        No se encontraron regalos en la base de datos
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[var(--bg-input)]/50 border-b border-[var(--border-card)] text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="p-4 pl-6">Regalo</th>
                                    <th className="p-4 cursor-pointer hover:text-[var(--text-main)]" onClick={() => toggleSort('diamonds')}>
                                        Valor {sortBy === 'diamonds' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-[var(--text-main)]" onClick={() => toggleSort('timesReceived')}>
                                        Veces Recibido {sortBy === 'timesReceived' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-[var(--text-main)]" onClick={() => toggleSort('lastSeen')}>
                                        Última Aparición {sortBy === 'lastSeen' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="p-4">Primera Aparición</th>
                                    <th className="p-4 pr-6">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-card)] text-xs font-bold text-[var(--text-main)]">
                                {sortedGifts.map((gift) => (
                                    <tr key={gift.id} className="hover:bg-slate-800/20 transition-all group">
                                        <td className="p-4 pl-6 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] border border-[var(--border-card)] flex items-center justify-center overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                                                {gift.icon ? (
                                                    <img src={gift.icon} alt={gift.name} className="w-8 h-8 object-contain" />
                                                ) : (
                                                    <Gift size={18} className="text-slate-600" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-black text-sm">{gift.name}</p>
                                                <p className="text-[9px] text-slate-500 uppercase tracking-wider">ID: {gift.id}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 tabular-nums">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                                gift.diamonds >= 1000 
                                                    ? 'bg-amber-500/20 text-amber-500' 
                                                    : gift.diamonds >= 100 
                                                        ? 'bg-purple-500/20 text-purple-500' 
                                                        : gift.diamonds > 0 
                                                            ? 'bg-blue-500/20 text-blue-500' 
                                                            : 'bg-slate-500/20 text-slate-500'
                                            }`}>
                                                💎 {gift.diamonds}
                                            </span>
                                        </td>
                                        <td className="p-4 tabular-nums font-black text-slate-300">
                                            x{gift.timesReceived}
                                        </td>
                                        <td className="p-4 text-[10px] text-slate-400">
                                            {formatDate(gift.lastSeen)}
                                        </td>
                                        <td className="p-4 text-[10px] text-slate-500">
                                            {formatDate(gift.firstSeen)}
                                        </td>
                                        <td className="p-4 pr-6">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 group-hover:text-pink-500 transition-colors">
                                                Registrado OK
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
