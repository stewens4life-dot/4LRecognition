import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Se usa 'Link' de lucide-react (antes Link2) y se limpian imports
import { Upload, Trash2, Globe, Award, Lock, CheckCircle, Edit, Monitor, Eye, EyeOff, Search, Hash, AlertTriangle, ArrowUpCircle, ChevronDown, ChevronUp, Link, X, Image as ImageIcon } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from "firebase/firestore";

// --- FIREBASE SETUP ---

// 2. CONFIGURACIÓN PARA VERCEL / VITE (PRODUCCIÓN):

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID
};


// Inicialización segura
const app = initializeApp(Object.keys(firebaseConfig).length > 0 ? firebaseConfig : { apiKey: "demo" }); 
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'lrecognition-v1';

// --- ESTILOS GLOBALES ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap');
    body { font-family: 'Roboto', sans-serif; margin: 0; padding: 0; overflow: hidden; }
    /* Optimizaciones para TV */
    * { -webkit-font-smoothing: antialiased; }
    .gpu-accelerated { transform: translateZ(0); will-change: transform, opacity; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
  `}</style>
);

// --- CONFIGURACIÓN ---
const RANKS_CONFIG = [
  { name: "Presidencial", color: "#60A5FA", layout: 'vertical', single: false, hasQuote: false, theme: ["#1e3a8a", "#172554", "#0f172a"] },
  { name: "Presidencial Élite", color: "#3B82F6", layout: 'vertical', single: false, hasQuote: false, theme: ["#1e40af", "#1e3a8a", "#0f172a"] },
  { name: "Bronce", color: "#F59E0B", layout: 'vertical', single: false, hasQuote: false, theme: ["#fef08a", "#854d0e", "#000000"] },
  { name: "Bronce Élite", color: "#D97706", layout: 'vertical', single: false, hasQuote: false, theme: ["#fde047", "#713f12", "#000000"] },
  { name: "Plata", color: "#C0C0C0", layout: 'horizontal', single: true, hasQuote: false, theme: ["#9CA3AF", "#4B5563", "#111827"] },
  { name: "Plata Élite", color: "#A9A9A9", layout: 'horizontal', single: true, hasQuote: false, theme: ["#D1D5DB", "#6B7280", "#1F2937"] },
  { name: "Oro", color: "#FDE047", layout: 'horizontal', single: true, hasQuote: true, theme: ["#fef9c3", "#a16207", "#000000"] },
  { name: "Oro Élite", color: "#D4AF37", layout: 'horizontal', single: true, hasQuote: true, theme: ["#fef08a", "#854d0e", "#000000"] },
  { name: "Platino", color: "#E5E4E2", layout: 'horizontal', single: true, hasQuote: true, theme: ["#E2E8F0", "#64748B", "#0F172A"] },
  { name: "Platino Élite", color: "#FFFFFF", layout: 'horizontal', single: true, hasQuote: true, theme: ["#F8FAFC", "#94A3B8", "#1E293B"] },
];

const CLUB_ELIGIBLE_RANKS = ["Oro", "Oro Élite", "Platino", "Platino Élite"];
const EXTENDED_TIME_RANKS = ["Oro", "Oro Élite", "Platino", "Platino Élite"];

const DEFAULT_SETTINGS = {
    adminPassword: "admin"
};

// --- HELPERS ---
const generateId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Función de compresión ultra-ligera: WebP a 60% de calidad
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; 
        const scaleSize = MAX_WIDTH / img.width;
        const width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        const height = img.width > MAX_WIDTH ? img.height * scaleSize : img.height;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Usamos suavizado de imagen para mejor calidad al reducir
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // OPTIMIZACIÓN MÁXIMA: WebP con calidad 0.6 (60%)
        // Esto reduce el tamaño de los assets significativamente para el TV
        resolve(canvas.toDataURL('image/webp', 0.6)); 
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const getRankPriority = (rankName) => {
    return RANKS_CONFIG.findIndex(r => r.name === rankName);
};

const getVariants = (screen) => {
    const isVerticalLayout = screen.type === 'affiliate' && screen.rankConfig.layout === 'vertical';
    const isSeparator = screen.type === 'separator';
    if (isVerticalLayout) return { enter: { y: '-100%', opacity: 0 }, center: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } };
    else if (isSeparator) return { enter: { scale: 0.8, opacity: 0 }, center: { scale: 1, opacity: 1 }, exit: { scale: 1.2, opacity: 0 } };
    return { enter: { x: '100%', opacity: 0 }, center: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } };
};

// --- COMPONENTES VISUALES ---

// Componente Skeleton (Solo usado en el Dashboard Admin para feedback visual)
const ImageWithSkeleton = ({ src, alt, className, containerClassName, placeholderIcon = false, children, ...props }) => {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    if (!src) {
         return (
            <div className={`bg-white/5 flex items-center justify-center ${className || ''} ${containerClassName || ''}`}>
                {children ? children : (placeholderIcon && <ImageIcon className="text-white/20" size={24} />)}
            </div>
         );
    }

    return (
        <div className={`relative overflow-hidden ${containerClassName || ''} ${className}`}>
            {!loaded && !error && (
                <div className="absolute inset-0 bg-white/10 animate-pulse flex items-center justify-center z-10" />
            )}
            <img
                src={src}
                alt={alt}
                className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                {...props}
            />
        </div>
    );
};

const NameDisplay = ({ name = "", isSmall = false, maxLines = null }) => {
    const parts = name.trim().split(/\s+/);
    let boldPart = "";
    let lightPart = "";

    if (parts.length >= 4) {
        boldPart = parts.slice(0, 2).join(' ');
        lightPart = parts.slice(2).join(' ');
    } else if (parts.length > 0) {
        boldPart = parts[0];
        lightPart = parts.slice(1).join(' ');
    }
    
    const length = name.length;
    let sizeClass = 'text-[1em] leading-tight';

    if (length > 45) sizeClass = 'text-[0.45em] leading-[1.1]';
    else if (length > 35) sizeClass = 'text-[0.55em] leading-[1.1]';
    else if (length > 28) sizeClass = 'text-[0.65em] leading-[1.1]';
    else if (length > 22) sizeClass = 'text-[0.75em] leading-[1.1]';
    else if (length > 18) sizeClass = 'text-[0.9em] leading-[1.1]';

    return (
        <div 
            className="flex flex-col w-full"
            style={maxLines ? {
                display: '-webkit-box',
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
            } : {}}
        >
            <span className={`text-white uppercase tracking-tight ${sizeClass} transition-all duration-300`}>
                <span className="font-black">{boldPart}</span> <span className="font-light text-white/90">{lightPart}</span>
            </span>
        </div>
    );
};

const BackgroundEffect = ({ theme = ["#1e3a8a", "#172554", "#0f172a"] }) => {
    const safeTheme = theme && theme.length >= 3 ? theme : ["#000000", "#000000", "#000000"];

    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <motion.div 
                className="absolute inset-0 bg-black" 
                animate={{ backgroundColor: safeTheme[2] }} 
                transition={{ duration: 2 }} 
            />
            
            <motion.div
                className="absolute inset-0 opacity-60 gpu-accelerated"
                animate={{ backgroundImage: `linear-gradient(125deg, ${safeTheme[2]} 0%, ${safeTheme[1]} 40%, ${safeTheme[0]} 70%, ${safeTheme[2]} 100%)` }}
                transition={{ duration: 2 }}
                style={{ backgroundSize: "200% 200%" }}
            >
                <motion.div className="w-full h-full" animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} />
            </motion.div>
            
            <div className="absolute top-[-10%] right-[-10%] w-[80vw] h-[80vh] opacity-40">
                <svg className="w-full h-full" viewBox="0 0 500 500" preserveAspectRatio="none">
                    <defs><linearGradient id="gradTop" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={safeTheme[0]} stopOpacity="0.8" /><stop offset="100%" stopColor={safeTheme[1]} stopOpacity="0" /></linearGradient></defs>
                    {[0, 1].map(i => {
                        const d1 = `M${i*50},0 Q${250+i*50},${50+i*50} 500,${200+i*50}`;
                        const d2 = `M${i*50},0 Q${250+i*50},${150+i*50} 500,${200+i*50}`;
                        return (
                            <motion.path 
                                key={i} 
                                fill="none" 
                                stroke="url(#gradTop)" 
                                strokeWidth={3} 
                                initial={{ d: d1 }}
                                animate={{ d: [d1, d2, d1] }} 
                                transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i }} 
                                className="gpu-accelerated"
                            />
                        );
                    })}
                </svg>
            </div>

            <div className="absolute bottom-[-10%] left-[-10%] w-[80vw] h-[80vh] opacity-40 transform rotate-180">
                <svg className="w-full h-full" viewBox="0 0 500 500" preserveAspectRatio="none">
                    <defs><linearGradient id="gradBottom" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={safeTheme[0]} stopOpacity="0.8" /><stop offset="100%" stopColor={safeTheme[1]} stopOpacity="0" /></linearGradient></defs>
                    {[0, 1].map(i => {
                         const d1 = `M${i*50},0 Q${250+i*50},${50+i*50} 500,${200+i*50}`;
                         const d2 = `M${i*50},0 Q${250+i*50},${150+i*50} 500,${200+i*50}`;
                        return (
                            <motion.path 
                                key={i} 
                                fill="none" 
                                stroke="url(#gradBottom)" 
                                strokeWidth={3} 
                                initial={{ d: d1 }}
                                animate={{ d: [d1, d2, d1] }} 
                                transition={{ duration: 12 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i }}
                                className="gpu-accelerated" 
                            />
                        );
                    })}
                </svg>
            </div>

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_transparent_10%,_#000000_100%)]" />
        </div>
    );
};

const SeparatorView = ({ screen }) => (
  <div className="w-full h-full flex flex-col items-center justify-center text-center px-10 relative z-20">
    <motion.div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-16 gpu-accelerated">
        {screen.pin && (
            <motion.div initial={{ x: -100, opacity: 0, rotate: -20 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", duration: 1.5 }} className="flex-shrink-0">
                <img src={screen.pin} className="w-32 h-32 md:w-56 md:h-56 object-contain" alt="Rank Pin" />
            </motion.div>
        )}
        <div className="text-center md:text-left">
            <span className="text-sm md:text-base uppercase font-medium tracking-[0.8em] text-white/50 mb-2 md:mb-4 block">Reconocimiento</span>
            <h1 style={{ color: screen.color, textShadow: `0 0 40px ${screen.color}40` }} className="text-5xl md:text-7xl lg:text-[6rem] font-black tracking-tight leading-none uppercase">{screen.rankName}</h1>
            <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 0.5, duration: 1 }} className="h-[2px] bg-white/20 mt-8 w-full" />
        </div>
    </motion.div>
  </div>
);

const AffiliateView = ({ screen, clubPin, rankPins }) => {
  const isHorizontal = screen.rankConfig.layout === 'horizontal';
  const isVertical = !isHorizontal;
  const items = screen.items;
  const duration = screen.duration;
  const [contentMode, setContentMode] = useState('info');

  useEffect(() => {
    if (isHorizontal && screen.rankConfig.hasQuote) {
        setContentMode('info');
        const halfTime = duration / 2;
        const timer = setTimeout(() => setContentMode('quote'), halfTime);
        return () => clearTimeout(timer);
    } else {
        setContentMode('info'); 
    }
  }, [screen, isHorizontal, duration]);

  const imgWidth = isHorizontal ? 330 : 295; 
  const imgHeight = (imgWidth * 5) / 4;

  return (
    <div className={`flex items-center justify-center w-full h-full px-4 md:px-10 ${isVertical ? 'gap-8 md:gap-20' : ''}`}>
        {items.map((person, idx) => (
          <motion.div 
            key={person.id}
            initial={isVertical ? { y: -100, opacity: 0 } : {}}
            animate={isVertical ? { y: 0, opacity: 1 } : {}}
            transition={isVertical ? { type: "spring", stiffness: 60, damping: 20, delay: idx * 0.2 } : {}}
            className={`
                relative flex items-center gpu-accelerated
                bg-[#0a0a0a]/90 border border-white/[0.08]
                rounded-[2rem] shadow-xl
                ${isHorizontal 
                    ? 'flex-col md:flex-row w-full max-w-[970px] h-auto min-h-[495px] p-8 gap-8' 
                    : 'flex-col w-full max-w-[390px] h-[600px] p-6' 
                }
            `}
          >
            <div 
                className={`relative flex-shrink-0 mx-auto md:mx-0 ${isHorizontal ? '' : 'mb-6'}`}
                style={{ width: imgWidth, height: imgHeight }}
            >
              <div className="absolute inset-0 rounded-[1.5rem] border border-white/10 shadow-inner z-10" />
              <img
                src={person.foto || "https://via.placeholder.com/400x500?text=Leader"} 
                alt={person.nombre}
                className="w-full h-full object-cover rounded-[1.5rem] shadow-lg brightness-110 contrast-110 gpu-accelerated"
                loading="eager"
              />
              {isVertical && person.isPresidentsClub && clubPin && (
                  <div className="absolute -bottom-5 -right-5 w-20 h-20 z-30 drop-shadow-md animate-in zoom-in duration-700 delay-500">
                      <img src={clubPin} alt="Club" className="w-full h-full object-contain" />
                  </div>
              )}
            </div>

            <div className={`flex-1 flex flex-col ${isHorizontal ? 'text-left' : 'text-center w-full'} justify-center z-10 overflow-hidden min-w-0`}>
               <AnimatePresence mode="wait">
                  {(contentMode === 'info' || !person.frase) ? (
                    <motion.div
                        key="info"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.5 }}
                        className="w-full"
                    >
                        <div className="mb-2">
                            {isHorizontal ? (
                                <div className="mb-2 flex items-center gap-3 min-h-[70px]">
                                    {rankPins?.[person.rango] ? (
                                        <img src={rankPins[person.rango]} alt={person.rango} className="w-[60px] h-[60px] object-contain" />
                                    ) : (
                                        <span className="text-[9px] uppercase tracking-[0.3em] text-[#D4AF37] font-bold">{person.rango}</span>
                                    )}

                                    {person.isPresidentsClub && clubPin && (
                                         <img src={clubPin} alt="President's Club" className="w-[60px] h-[60px] object-contain animate-in zoom-in duration-500" />
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 mb-3 justify-center">
                                    <span className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] font-bold">{person.rango}</span>
                                </div>
                            )}

                            <div className={`${isHorizontal ? 'text-4xl md:text-6xl' : (items.length > 1 ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl')} mb-1`}>
                                <NameDisplay name={person.nombre} isSmall={items.length > 1} maxLines={2} />
                            </div>
                        </div>
                        
                        <div className={`flex items-center gap-4 ${isHorizontal ? 'justify-start' : 'justify-center'}`}>
                            <div className="px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] flex items-center gap-2">
                                <Globe size={10} className="text-white/40" />
                                <span className="text-[9px] uppercase tracking-[0.2em] text-white/60 font-medium">{person.pais || "Global"}</span>
                            </div>
                        </div>
                    </motion.div>
                  ) : (
                    <motion.div
                        key="quote"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.8 }}
                        className="w-full flex items-center justify-start"
                    >
                         <p className="text-lg md:text-xl italic font-serif text-gray-400 leading-relaxed font-light relative line-clamp-4">
                            "{person.frase}"
                         </p>
                    </motion.div>
                  )}
               </AnimatePresence>
            </div>
          </motion.div>
        ))}
    </div>
  );
};

// --- MODALES Y PORTAL ADMIN ---
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#151515] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
                <div className="flex items-center gap-3 text-red-500 mb-4">
                    <AlertTriangle size={24} />
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                </div>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">{message}</p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors">Cancelar</button>
                    <button onClick={onConfirm} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors">Confirmar</button>
                </div>
            </div>
        </div>
    );
};

const RankUpdateModal = ({ isOpen, onClose, onUpdate, conflicts }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#151515] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in duration-200 max-h-[80vh] flex flex-col">
                <div className="flex items-center gap-3 text-[#D4AF37] mb-4">
                    <ArrowUpCircle size={24} />
                    <h3 className="text-lg font-bold text-white">Mejoras de Rango Detectadas</h3>
                </div>
                <p className="text-white/60 text-xs mb-4 leading-relaxed">
                    Hemos detectado {conflicts.length} registros existentes con un rango superior en el archivo CSV. ¿Deseas actualizar estos registros a su nuevo rango?
                </p>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/30 rounded-xl p-2 mb-4 space-y-2 border border-white/5">
                    {conflicts.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                            <div className="min-w-0 flex-1 pr-2">
                                <div className="text-xs font-bold text-white truncate">{c.newItem.nombre}</div>
                                <div className="text-[10px] text-white/30 font-mono">{c.newItem.distribuidorId}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-white/30 line-through">{c.currentItem.rango}</div>
                                <div className="text-xs font-bold text-[#D4AF37]">{c.newItem.rango}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 mt-auto">
                    <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors">Ignorar</button>
                    <button onClick={onUpdate} className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#b8952b] text-black rounded-xl text-xs font-bold uppercase tracking-wider transition-colors">Actualizar Todo</button>
                </div>
            </div>
        </div>
    );
};

const AdminPortal = ({ affiliates, settings, saveAsset, deleteAsset, saveSettings, onClose, isAuthenticated, setIsAuthenticated, user }) => {
    const [passwordInput, setPasswordInput] = useState("");
    const [loginError, setLoginError] = useState(false);
    const [activeTab, setActiveTab] = useState("leaders");
    const [formData, setFormData] = useState({ distribuidorId: '', nombre: '', rango: 'Presidencial', pais: '', frase: '', foto: '', isPresidentsClub: false, hidden: false });
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    
    const [idError, setIdError] = useState("");
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null });
    const [clearAllModal, setClearAllModal] = useState(false);
    const [rankUpdateModal, setRankUpdateModal] = useState(false);
    
    const [expandedRanks, setExpandedRanks] = useState({});
    const [csvConflicts, setCsvConflicts] = useState([]); 
    
    const fileInputRef = useRef(null);

    const toggleRank = (rankName) => setExpandedRanks(prev => ({ ...prev, [rankName]: !prev[rankName] }));

    const handleSaveAffiliate = async () => {
        setIdError("");
        if (!formData.nombre || !user) return;
        
        if (!formData.distribuidorId || formData.distribuidorId.trim() === "") {
            setIdError("El ID de Distribuidor es obligatorio.");
            return;
        }

        const duplicate = affiliates.find(a => a.distribuidorId === formData.distribuidorId && a.id !== (editingId || ''));
        if (duplicate) {
            setIdError(`Este ID ya existe.`);
            return;
        }

        const affId = editingId || generateId('man');
        try { 
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', affId), { ...formData, id: affId }); 
            setEditingId(null); 
            setFormData({ distribuidorId: '', nombre: '', rango: 'Presidencial', pais: '', frase: '', foto: '', isPresidentsClub: false, hidden: false }); 
        } catch (error) { console.error("Error guardando:", error); }
    };

    const handleCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            if (!user) return;
            const rows = ev.target.result.split('\n').filter(r => r.trim());
            const header = rows[0].toLowerCase();
            const toAdd = [];
            const conflicts = [];
            const processedIds = new Set(); 

            rows.slice(1).forEach((row, i) => {
                const cols = row.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                const obj = { id: generateId(`csv-${i}`), isPresidentsClub: false, hidden: false, distribuidorId: '' };
                const hCols = header.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                
                hCols.forEach((h, idx) => {
                    const colVal = cols[idx];
                    if(!colVal) return;
                    if (h.includes('nombre')) obj.nombre = colVal;
                    else if (h.includes('rango')) obj.rango = colVal;
                    else if (h.includes('pais') || h.includes('país')) obj.pais = colVal;
                    else if (h.includes('foto')) obj.foto = colVal;
                    else if (h.includes('bio') || h.includes('frase')) obj.frase = colVal;
                    else if (h.includes('id') || h.includes('distribuidor') || h.includes('codigo')) obj.distribuidorId = colVal;
                    else if (h.includes('pc') || h.includes('club')) {
                         const val = colVal.toUpperCase();
                         if (val === 'SI' || val === 'YES' || val === '1') obj.isPresidentsClub = true;
                    }
                });

                if(!obj.distribuidorId || !obj.nombre) return;
                if(processedIds.has(obj.distribuidorId)) return;
                processedIds.add(obj.distribuidorId);
                if(!obj.rango) obj.rango = "Presidencial";

                const existing = affiliates.find(a => a.distribuidorId === obj.distribuidorId);
                if (existing) {
                    const oldP = getRankPriority(existing.rango);
                    const newP = getRankPriority(obj.rango);
                    if (newP > oldP) conflicts.push({ newItem: { ...obj, id: existing.id }, currentItem: existing });
                } else {
                    toAdd.push(obj);
                }
            });

            if (toAdd.length > 0) {
                const batch = writeBatch(db);
                toAdd.forEach(item => batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', item.id), item));
                await batch.commit();
            }

            if (conflicts.length > 0) {
                setCsvConflicts(conflicts);
                setRankUpdateModal(true);
            }
            if(fileInputRef.current) fileInputRef.current.value = "";
        };
        reader.readAsText(file);
    };

    const confirmRankUpdates = async () => {
        if (!user || csvConflicts.length === 0) return;
        const batch = writeBatch(db);
        csvConflicts.forEach(c => batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', c.newItem.id), c.newItem));
        await batch.commit();
        setRankUpdateModal(false);
        setCsvConflicts([]);
    };

    const confirmDelete = async () => {
        if (deleteModal.id && user) {
            try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', deleteModal.id)); }
            catch (error) { console.error("Error eliminando:", error); }
            setDeleteModal({ open: false, id: null });
        }
    };

    const confirmClearAll = async () => {
        if (!user) return;
        const batch = writeBatch(db);
        affiliates.forEach(a => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', a.id)));
        await batch.commit(); setClearAllModal(false);
    };

    const toggleHide = async (id) => {
        if (!user) return;
        const affiliate = affiliates.find(a => a.id === id);
        if (!affiliate) return;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', id), { hidden: !affiliate.hidden }, { merge: true });
    };

    const handleImageUpload = async (e, field) => { 
        const file = e.target.files[0]; if(!file) return; 
        try { 
            const base64 = await compressImage(file); 
            if (field === 'foto') setFormData(prev => ({ ...prev, foto: base64 })); 
        } catch (err) { console.error(err); } 
    };
    
    const handlePinUpload = async (e, rankName) => { 
        const file = e.target.files[0]; if(!file) return; 
        try { 
            const base64 = await compressImage(file); 
            await saveAsset(`rank-${rankName}`, base64); 
        } catch(err) { console.error(err); } 
    };

    const handlePinURL = async (e, rankName) => {
        await saveAsset(`rank-${rankName}`, e.target.value);
    };

    const handleClubPinUpload = async (e) => { 
        const file = e.target.files[0]; if(!file) return; 
        try { 
            const base64 = await compressImage(file); 
            await saveAsset('club-pin', base64); 
        } catch(err) { console.error(err); } 
    };

    const handleClubPinURL = async (e) => {
        await saveAsset('club-pin', e.target.value);
    };

    const handlePasswordChange = async (e) => {
        await saveSettings({ adminPassword: e.target.value });
    };

    const groupedAffiliates = useMemo(() => {
        const filtered = affiliates.filter(a => a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || (a.distribuidorId && a.distribuidorId.includes(searchTerm)));
        const grouped = {};
        RANKS_CONFIG.forEach(rank => { const inRank = filtered.filter(a => a.rango === rank.name); if (inRank.length > 0) grouped[rank.name] = inRank; });
        return grouped;
    }, [affiliates, searchTerm]);

    if (!isAuthenticated) return (
        <div className="absolute inset-0 z-[200] bg-[#050505] flex items-center justify-center font-sans">
             <div className="w-full max-w-md bg-[#0f0f0f] border border-white/10 rounded-3xl p-10 text-center shadow-2xl">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6"><Lock size={32} className="text-[#D4AF37]" /></div>
                <h2 className="text-3xl font-black mb-2 text-white">Panel de Control</h2>
                <input type="password" value={passwordInput} onChange={(e) => {setPasswordInput(e.target.value); setLoginError(false);}} className="w-full bg-black border border-white/10 rounded-xl p-4 text-center mb-4 text-white focus:border-[#D4AF37] outline-none" placeholder="Contraseña de acceso" />
                {loginError && <p className="text-red-500 text-xs mb-4">Contraseña incorrecta</p>}
                <button onClick={() => { if (passwordInput === settings.adminPassword) setIsAuthenticated(true); else setLoginError(true); }} className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl text-xs uppercase tracking-widest">Ingresar</button>
                <button onClick={onClose} className="mt-6 text-xs text-white/30 hover:text-white uppercase tracking-wider">Volver</button>
             </div>
        </div>
    );

    return (
        <div className="absolute inset-0 z-[200] bg-[#000000] text-white flex flex-col">
            <ConfirmationModal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, id: null })} onConfirm={confirmDelete} title="Eliminar" message="¿Deseas eliminar este registro?" />
            <ConfirmationModal isOpen={clearAllModal} onClose={() => setClearAllModal(false)} onConfirm={confirmClearAll} title="Borrar Todo" message="Se eliminarán todos los líderes." />
            <RankUpdateModal isOpen={rankUpdateModal} onClose={() => { setRankUpdateModal(false); setCsvConflicts([]); }} onUpdate={confirmRankUpdates} conflicts={csvConflicts} />

            <div className="h-20 border-b border-white/10 flex items-center justify-between px-8 bg-[#0a0a0a]">
                <div className="flex items-center gap-4">
                    <Monitor size={20} /> <h2 className="text-lg font-black tracking-widest uppercase">Admin</h2>
                    <nav className="flex gap-2 ml-4">
                        {['leaders', 'settings', 'security'].map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${activeTab === tab ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>{tab === 'leaders' ? 'Líderes' : tab === 'settings' ? 'Pines' : 'Seguridad'}</button>))}
                    </nav>
                </div>
                <button onClick={onClose} className="px-4 py-2 bg-white/5 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors">Salir</button>
            </div>
            <div className="flex-1 overflow-hidden p-8 bg-[#050505] flex justify-center">
                <div className="w-full max-w-7xl h-full flex gap-8">
                    {activeTab === 'leaders' && (
                        <>
                            <div className="w-80 bg-[#0f0f0f] border border-white/5 rounded-3xl p-6 overflow-y-auto flex flex-col flex-shrink-0">
                                <h3 className={`text-xs font-bold uppercase tracking-widest mb-6 ${editingId ? 'text-[#3B82F6]' : 'text-[#D4AF37]'}`}>
                                    {editingId ? 'Editando' : 'Nuevo'}
                                </h3>
                                <div className="space-y-4 flex-1">
                                    <input value={formData.distribuidorId} onChange={e => { setFormData({...formData, distribuidorId: e.target.value}); setIdError(""); }} className={`w-full bg-black border ${idError ? 'border-red-500' : 'border-white/10'} p-3 rounded-xl text-sm outline-none`} placeholder="ID Distribuidor" />
                                    {idError && <div className="text-red-500 text-[10px]">{idError}</div>}
                                    <input value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Nombre..." className="w-full bg-black border border-white/10 p-3 rounded-xl text-sm outline-none" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <select value={formData.rango} onChange={e => setFormData({...formData, rango: e.target.value})} className="bg-black border border-white/10 p-3 rounded-xl text-sm">{RANKS_CONFIG.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}</select>
                                        <input value={formData.pais} onChange={e => setFormData({...formData, pais: e.target.value})} placeholder="País" className="bg-black border border-white/10 p-3 rounded-xl text-sm outline-none" />
                                    </div>
                                    <input value={formData.foto} onChange={e => setFormData({...formData, foto: e.target.value})} placeholder="URL Foto..." className="w-full bg-black border border-white/10 p-3 rounded-xl text-xs outline-none" />
                                    
                                    {CLUB_ELIGIBLE_RANKS.includes(formData.rango) && (
                                        <div 
                                            onClick={() => setFormData({...formData, isPresidentsClub: !formData.isPresidentsClub})} 
                                            className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${formData.isPresidentsClub ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]' : 'bg-black border-white/10 text-white/50 hover:border-white/30'}`}
                                        >
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${formData.isPresidentsClub ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-white/30'}`}>
                                                {formData.isPresidentsClub && <CheckCircle size={14} className="text-black" />}
                                            </div>
                                            <span className="text-xs font-bold uppercase tracking-wider">President's Club</span>
                                        </div>
                                    )}

                                    <label className="block w-full border border-dashed border-white/20 py-3 rounded-xl text-xs uppercase tracking-widest text-white/40 hover:text-white hover:border-white hover:bg-white/5 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                        <Upload size={14} /> Foto (WebP Optimizada)
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'foto')} />
                                    </label>

                                    <button onClick={handleSaveAffiliate} className="w-full bg-white text-black font-bold py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-[#D4AF37] transition-all">Guardar</button>
                                </div>
                                <div className="mt-6 pt-6 border-t border-white/10">
                                    <input type="file" ref={fileInputRef} hidden onChange={handleCSV} accept=".csv" />
                                    <button onClick={() => fileInputRef.current.click()} className="w-full border border-dashed border-white/20 py-4 rounded-xl text-xs uppercase tracking-widest text-white/40 hover:text-white hover:border-white hover:bg-white/5 transition-all flex items-center justify-center gap-2">Importar CSV</button>
                                </div>
                            </div>
                            <div className="flex-1 bg-[#0f0f0f] border border-white/5 rounded-3xl p-6 flex flex-col">
                                <div className="mb-6 flex gap-4 items-center">
                                    <div className="relative flex-1"><Search size={16} className="absolute left-4 top-3.5 text-white/30" /><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar..." className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none" /></div>
                                    <button onClick={() => setClearAllModal(true)} className="text-xs text-red-500">Limpiar BD</button>
                                </div>
                                <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                                    {Object.entries(groupedAffiliates).map(([rank, items]) => (
                                        <div key={rank} className="mb-4 bg-white/5 rounded-xl overflow-hidden border border-white/5">
                                            <button onClick={() => toggleRank(rank)} className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                                                <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37] flex items-center gap-2">
                                                    <Award size={14} /> {rank} ({items.length})
                                                </h4>
                                                {expandedRanks[rank] ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                                            </button>
                                            
                                            {expandedRanks[rank] && (
                                                <div className="p-4 bg-black/20 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {items.map(a => (
                                                        <div key={a.id} className="flex items-center gap-3 p-3 bg-black/40 rounded-xl border border-white/5">
                                                            <ImageWithSkeleton 
                                                                src={a.foto} 
                                                                alt={a.nombre}
                                                                className="rounded-lg object-cover"
                                                                containerClassName="w-10 h-10 rounded-lg flex-shrink-0"
                                                                placeholderIcon={true}
                                                            />
                                                            <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white truncate">{a.nombre}</div><div className="text-[9px] text-white/40">{a.distribuidorId}</div></div>
                                                            <div className="flex gap-1"><button onClick={() => toggleHide(a.id)} className="p-2 hover:bg-white/10">{a.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button><button onClick={() => {setFormData(a); setEditingId(a.id);}} className="p-2 hover:bg-white/10"><Edit size={14} /></button><button onClick={() => setDeleteModal({ open: true, id: a.id })} className="p-2 hover:bg-red-500/20 text-red-500"><Trash2 size={14} /></button></div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    {activeTab === 'settings' && (
                        <div className="w-full flex gap-8">
                            <div className="flex-1 bg-[#0f0f0f] border border-white/5 rounded-3xl p-8 overflow-y-auto">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37] mb-8 border-b border-white/10 pb-4">Pines de Rango</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {RANKS_CONFIG.map(rank => (
                                        <div key={rank.name} className="flex flex-col gap-3 p-4 bg-black/40 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-4">
                                                <label className="relative cursor-pointer group flex-shrink-0">
                                                    <ImageWithSkeleton 
                                                        src={settings.rankPins[rank.name]}
                                                        className="object-contain p-2"
                                                        containerClassName="w-14 h-14 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 group-hover:border-[#D4AF37] transition-colors"
                                                        placeholderIcon={true}
                                                    />
                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePinUpload(e, rank.name)} />
                                                </label>
                                                <div className="text-xs font-bold text-white">{rank.name}</div>
                                                {settings.rankPins[rank.name] && (<button onClick={() => deleteAsset(`rank-${rank.name}`)} className="p-2 text-white/20 hover:text-red-500"><Trash2 size={14} /></button>)}
                                            </div>
                                            <div className="relative">
                                                <Link size={12} className="absolute left-3 top-3 text-white/20" />
                                                <input value={settings.rankPins[rank.name]?.startsWith('http') ? settings.rankPins[rank.name] : ''} onChange={(e) => handlePinURL(e, rank.name)} placeholder="URL de imagen..." className="w-full bg-white/5 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-[10px] text-white/70 outline-none" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="w-80 flex flex-col gap-6">
                                <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-8 text-center">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37] mb-6">President's Club</h3>
                                    <label className="block w-40 h-40 mx-auto bg-black rounded-full border border-dashed border-white/20 hover:border-[#D4AF37] cursor-pointer flex items-center justify-center relative overflow-hidden group transition-all mb-4">
                                        <ImageWithSkeleton 
                                            src={settings.presidentsClubPin}
                                            className="object-contain p-6"
                                            containerClassName="w-full h-full"
                                        >
                                            {!settings.presidentsClubPin && (
                                                <div className="flex flex-col items-center gap-2 text-white/30">
                                                    <Upload size={24} />
                                                    <span className="text-[10px] uppercase">Subir Pin</span>
                                                </div>
                                            )}
                                        </ImageWithSkeleton>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleClubPinUpload} />
                                    </label>
                                    <div className="relative mb-4">
                                        <Link size={12} className="absolute left-3 top-3 text-white/20" />
                                        <input value={settings.presidentsClubPin?.startsWith('http') ? settings.presidentsClubPin : ''} onChange={handleClubPinURL} placeholder="URL de imagen..." className="w-full bg-white/5 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-[10px] text-white/70 outline-none" />
                                    </div>
                                    {settings.presidentsClubPin && (<button onClick={() => deleteAsset('club-pin')} className="text-xs text-red-500 underline">Borrar Pin</button>)}
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'security' && (
                        <div className="w-full max-w-lg mx-auto bg-[#0f0f0f] border border-white/5 rounded-3xl p-12 self-center">
                            <h3 className="text-xl font-bold text-white mb-8 text-center">Seguridad</h3>
                            <label className="text-[10px] uppercase text-white/40 font-bold ml-1 mb-2 block">Nueva Contraseña</label>
                            <input type="password" value={settings.adminPassword} onChange={handlePasswordChange} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:border-[#D4AF37] outline-none text-center text-lg" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const App = () => {
  const [affiliates, setAffiliates] = useState([]);
  const [settingsConfig, setSettingsConfig] = useState(DEFAULT_SETTINGS);
  const [assets, setAssets] = useState({});
  const [user, setUser] = useState(null);
  const [view, setView] = useState('tv');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [stylesLoaded, setStylesLoaded] = useState(false); 

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (window.tailwind) { setStylesLoaded(true); return; }
    const existingScript = document.querySelector('script[src*="tailwindcss"]');
    if (existingScript) { existingScript.addEventListener('load', () => setStylesLoaded(true)); setTimeout(() => setStylesLoaded(true), 500); } 
    else {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      script.onload = () => setStylesLoaded(true);
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribeAffiliates = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'affiliates'), (snapshot) => setAffiliates(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubscribeConfig = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), (docSnap) => { if (docSnap.exists()) setSettingsConfig({ ...DEFAULT_SETTINGS, ...docSnap.data() }); else setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), DEFAULT_SETTINGS); });
    const unsubscribeAssets = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'assets'), (snapshot) => {
        const newAssets = {}; snapshot.forEach(doc => { newAssets[doc.id] = doc.data().image; }); setAssets(newAssets);
    });
    return () => { unsubscribeAffiliates(); unsubscribeConfig(); unsubscribeAssets(); };
  }, [user]);

  const finalSettings = useMemo(() => {
      const rankPins = {};
      Object.keys(assets).forEach(key => { if (key.startsWith('rank-')) rankPins[key.replace('rank-', '')] = assets[key]; });
      return { ...settingsConfig, presidentsClubPin: assets['club-pin'] || "", rankPins };
  }, [settingsConfig, assets]);

  const saveSettings = async (newConfig) => { if (user) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), newConfig, { merge: true }); };
  const saveAsset = async (assetId, imageString) => { if (user) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'assets', assetId), { image: imageString }); };
  const deleteAsset = async (assetId) => { if (user) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'assets', assetId)); };

  const timeline = useMemo(() => {
    let sequence = [];
    const activeAffiliates = affiliates.filter(a => !a.hidden);
    RANKS_CONFIG.forEach(rank => {
      const filtered = activeAffiliates.filter(a => a && a.rango === rank.name);
      if (filtered.length === 0) return;
      sequence.push({ type: 'separator', rankName: rank.name, color: rank.color, duration: 4000, id: `sep-${rank.name}`, pin: finalSettings.rankPins[rank.name], theme: rank.theme });
      const slideDuration = EXTENDED_TIME_RANKS.includes(rank.name) ? 12000 : 8000;
      if (rank.single) filtered.forEach(aff => sequence.push({ type: 'affiliate', items: [aff], rankConfig: rank, duration: slideDuration, id: `aff-${aff.id}` }));
      else {
        for (let i = 0; i < filtered.length; i += 2) {
          const group = filtered.slice(i, i + 2);
          sequence.push({ type: 'affiliate', items: group, rankConfig: rank, duration: slideDuration, id: `group-${group.map(p=>p.id).join('-')}` });
        }
      }
    });
    if (sequence.length === 0) sequence.push({ type: 'empty', duration: 5000, id: 'empty', theme: ["#000000", "#111111", "#000000"] });
    return sequence;
  }, [affiliates, finalSettings]);

  useEffect(() => {
    if (timeline.length <= 1 && timeline[0]?.id === 'empty' || view === 'admin') return;
    const timer = setTimeout(() => { setCurrentIndex((prev) => (prev + 1) % timeline.length); }, timeline[currentIndex]?.duration || 5000);
    return () => clearTimeout(timer);
  }, [currentIndex, timeline, view]);

  const currentScreen = timeline[currentIndex] || { type: 'empty', theme: ["#000000", "#111111", "#000000"] };

  if (!stylesLoaded) return <div className="fixed inset-0 bg-[#020617] flex items-center justify-center text-[#D4AF37]">Optimizando rendimiento...</div>;

  if (view === 'admin') return (
    <>
      <GlobalStyles />
      <AdminPortal affiliates={affiliates} settings={finalSettings} saveAsset={saveAsset} deleteAsset={deleteAsset} saveSettings={saveSettings} onClose={() => setView('tv')} isAuthenticated={isAdminAuthenticated} setIsAuthenticated={setIsAdminAuthenticated} user={user} />
    </>
  );

  return (
    <div className="fixed inset-0 bg-[#020617] text-white overflow-hidden flex items-center justify-center select-none">
      <GlobalStyles />
      <BackgroundEffect theme={currentScreen.theme || currentScreen.rankConfig?.theme} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
            key={currentScreen.id || currentIndex}
            variants={getVariants(currentScreen)} initial="enter" animate="center" exit="exit"
            transition={{ x: { type: "spring", stiffness: 80, damping: 20 }, y: { type: "spring", stiffness: 70, damping: 20 }, opacity: { duration: 0.4 }, scale: { duration: 0.5 } }}
            className="absolute inset-0 flex items-center justify-center z-10 w-full h-full"
        >
            {currentScreen?.type === 'separator' ? <SeparatorView screen={currentScreen} /> : currentScreen?.type === 'empty' ? (
                <div className="text-center text-white/30"><p className="text-2xl uppercase tracking-widest font-light">Esperando datos...</p></div>
            ) : <AffiliateView screen={currentScreen} clubPin={finalSettings.presidentsClubPin} rankPins={finalSettings.rankPins} />}
        </motion.div>
      </AnimatePresence>
      <button onClick={() => setView('admin')} className="absolute bottom-5 right-5 z-[150] p-3 opacity-10 hover:opacity-100 transition-opacity duration-500"><Lock size={16} /></button>
    </div>
  );
};

export default App;
