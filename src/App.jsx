import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import {
  Upload, Trash2, Globe, Award, Lock, CheckCircle, Edit, Monitor, Eye, EyeOff,
  Search, Hash, AlertTriangle, ArrowUpCircle, ChevronDown, ChevronUp, Link, X,
  Image as ImageIcon, Cloud, Save, FileText, AlertCircle, Info, CheckSquare,
  Table, Download, Plus, RefreshCw, Shield, Wifi, WifiOff, Settings,
  Users, Star, Layers, BarChart2, HelpCircle, Sparkles
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from "firebase/firestore";

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

const app = initializeApp(Object.keys(firebaseConfig).length > 0 ? firebaseConfig : { apiKey: "demo" });
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'lrecognition-v1';

// --- CONFIGURATION ---
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
  adminPassword: "admin",
  imgbbApiKey: ""
};

// CSV required columns documentation
const CSV_COLUMNS = [
  { key: 'id / distribuidor / codigo', required: true, description: 'ID único del distribuidor', example: 'D001' },
  { key: 'nombre', required: true, description: 'Nombre completo', example: 'María González López' },
  { key: 'rango', required: true, description: 'Nombre exacto del rango', example: 'Oro Élite' },
  { key: 'pais / país', required: false, description: 'País de origen', example: 'México' },
  { key: 'foto', required: false, description: 'URL de imagen de perfil', example: 'https://...' },
  { key: 'bio / frase', required: false, description: 'Frase o cita motivacional', example: 'El éxito...' },
  { key: 'pc / club', required: false, description: "President's Club: SI / YES / 1", example: 'SI' },
];

// --- HELPERS ---
const generateId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const getRankPriority = (rankName) => RANKS_CONFIG.findIndex(r => r.name === rankName);

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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.6));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

const uploadToImgBB = async (base64Image, apiKey) => {
  if (!apiKey) return base64Image;
  try {
    const imageBody = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const formData = new FormData();
    formData.append("image", imageBody);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: "POST", body: formData });
    const data = await response.json();
    if (data.success) return data.data.url;
    throw new Error("ImgBB error");
  } catch {
    return base64Image;
  }
};

// --- TV KEEP-ALIVE: Previene suspensión en Smart TVs ---
const useWakeLock = () => {
  const wakeLockRef = useRef(null);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          setTimeout(requestWakeLock, 1000);
        });
      } catch (err) {
        console.warn('WakeLock no disponible:', err);
      }
    }
  }, []);

  useEffect(() => {
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockRef.current?.release();
    };
  }, [requestWakeLock]);
};

// --- ANIMATION VARIANTS (TV Optimized) ---
const getVariants = (screen) => {
  const isVertical = screen.type === 'affiliate' && screen.rankConfig?.layout === 'vertical';
  const isSeparator = screen.type === 'separator';

  if (isVertical) return { enter: { y: 40, opacity: 0 }, center: { y: 0, opacity: 1 }, exit: { y: -40, opacity: 0 } };
  if (isSeparator) return { enter: { scale: 0.95, opacity: 0 }, center: { scale: 1, opacity: 1 }, exit: { scale: 1.05, opacity: 0 } };
  return { enter: { x: 40, opacity: 0 }, center: { x: 0, opacity: 1 }, exit: { x: -40, opacity: 0 } };
};

// =====================================================
// TOAST NOTIFICATION
// =====================================================
const Toast = ({ message, type = 'success', onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const colors = {
    success: { bg: 'rgba(48,209,88,0.15)', border: 'rgba(48,209,88,0.30)', icon: '✓', color: '#4ade80' },
    error: { bg: 'rgba(255,69,58,0.15)', border: 'rgba(255,69,58,0.30)', icon: '✕', color: '#f87171' },
    info: { bg: 'rgba(10,132,255,0.15)', border: 'rgba(10,132,255,0.30)', icon: 'ℹ', color: '#60a5fa' },
  };
  const c = colors[type] || colors.info;

  return (
    <div className="toast" style={{ background: c.bg, borderColor: c.border }}>
      <span style={{ color: c.color, fontWeight: 700, fontSize: 15 }}>{c.icon}</span>
      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>{message}</span>
    </div>
  );
};

// =====================================================
// IMAGE WITH SKELETON
// =====================================================
const ImageWithSkeleton = ({ src, alt, className, containerClassName, placeholderIcon = false, children, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!src) return (
    <div className={`flex items-center justify-center ${className || ''} ${containerClassName || ''}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
      {children ? children : (placeholderIcon && <ImageIcon style={{ color: 'rgba(255,255,255,0.20)' }} size={20} />)}
    </div>
  );

  return (
    <div className={`relative overflow-hidden ${containerClassName || ''} ${className || ''}`}>
      {!loaded && !error && <div className="skeleton" style={{ position: 'absolute', inset: 0, zIndex: 10, borderRadius: 'inherit' }} />}
      <img src={src} alt={alt}
        className="gpu-layer"
        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.3s ease', opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        {...props}
      />
    </div>
  );
};

// =====================================================
// NAME DISPLAY
// =====================================================
const NameDisplay = ({ name = "", isSmall = false, maxLines = null }) => {
  const parts = name.trim().split(/\s+/);
  let boldPart = "", lightPart = "";
  if (parts.length >= 4) { boldPart = parts.slice(0, 2).join(' '); lightPart = parts.slice(2).join(' '); }
  else if (parts.length > 0) { boldPart = parts[0]; lightPart = parts.slice(1).join(' '); }

  const length = name.length;
  let sizeClass = 'text-[1em] leading-tight';
  if (length > 45) sizeClass = 'text-[0.45em] leading-[1.1]';
  else if (length > 35) sizeClass = 'text-[0.55em] leading-[1.1]';
  else if (length > 28) sizeClass = 'text-[0.65em] leading-[1.1]';
  else if (length > 22) sizeClass = 'text-[0.75em] leading-[1.1]';
  else if (length > 18) sizeClass = 'text-[0.9em] leading-[1.1]';

  return (
    <div className="flex flex-col w-full" style={maxLines ? { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}}>
      <span className={`text-white uppercase tracking-tight ${sizeClass}`}>
        <span style={{ fontWeight: 900 }}>{boldPart}</span>{' '}
        <span style={{ fontWeight: 300, color: 'rgba(255,255,255,0.88)' }}>{lightPart}</span>
      </span>
    </div>
  );
};

// =====================================================
// BACKGROUND EFFECT (TV OPTIMIZED)
// =====================================================
const BackgroundEffect = ({ theme = ["#1e3a8a", "#172554", "#0f172a"] }) => {
  const safeTheme = theme && theme.length >= 3 ? theme : ["#000000", "#000000", "#000000"];
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none gpu-layer">
      <motion.div className="absolute inset-0" animate={{ backgroundColor: safeTheme[2] }} transition={{ duration: 2 }} />
      <motion.div
        className="absolute inset-0 gpu-layer"
        style={{ opacity: 0.6, backgroundSize: "200% 200%" }}
        animate={{ backgroundImage: `linear-gradient(125deg, ${safeTheme[2]} 0%, ${safeTheme[1]} 40%, ${safeTheme[0]} 70%, ${safeTheme[2]} 100%)` }}
        transition={{ duration: 2 }}
      >
        <motion.div className="w-full h-full" animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} />
      </motion.div>
      <div className="absolute top-[-10%] right-[-10%] w-[80vw] h-[80vh] opacity-40">
        <svg className="w-full h-full" viewBox="0 0 500 500" preserveAspectRatio="none">
          <defs><linearGradient id="gradTop" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={safeTheme[0]} stopOpacity="0.8" /><stop offset="100%" stopColor={safeTheme[1]} stopOpacity="0" /></linearGradient></defs>
          {[0, 1].map(i => {
            const d1 = `M${i * 50},0 Q${250 + i * 50},${50 + i * 50} 500,${200 + i * 50}`;
            const d2 = `M${i * 50},0 Q${250 + i * 50},${150 + i * 50} 500,${200 + i * 50}`;
            return <motion.path key={i} fill="none" stroke="url(#gradTop)" strokeWidth={3} initial={{ d: d1 }} animate={{ d: [d1, d2, d1] }} transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i }} className="gpu-layer" />;
          })}
        </svg>
      </div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[80vw] h-[80vh] opacity-40" style={{ transform: 'rotate(180deg)' }}>
        <svg className="w-full h-full" viewBox="0 0 500 500" preserveAspectRatio="none">
          <defs><linearGradient id="gradBottom" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={safeTheme[0]} stopOpacity="0.8" /><stop offset="100%" stopColor={safeTheme[1]} stopOpacity="0" /></linearGradient></defs>
          {[0, 1].map(i => {
            const d1 = `M${i * 50},0 Q${250 + i * 50},${50 + i * 50} 500,${200 + i * 50}`;
            const d2 = `M${i * 50},0 Q${250 + i * 50},${150 + i * 50} 500,${200 + i * 50}`;
            return <motion.path key={i} fill="none" stroke="url(#gradBottom)" strokeWidth={3} initial={{ d: d1 }} animate={{ d: [d1, d2, d1] }} transition={{ duration: 12 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i }} className="gpu-layer" />;
          })}
        </svg>
      </div>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, transparent 10%, #000000 100%)' }} />
    </div>
  );
};

// =====================================================
// SEPARATOR VIEW
// =====================================================
const SeparatorView = ({ screen }) => (
  <div className="w-full h-full flex flex-col items-center justify-center text-center px-10 relative" style={{ zIndex: 20 }}>
    <motion.div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-16 gpu-layer">
      {screen.pin && (
        <motion.div initial={{ x: -100, opacity: 0, rotate: -20 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", duration: 1.5 }} className="flex-shrink-0">
          <img src={screen.pin} className="w-32 h-32 md:w-56 md:h-56 object-contain" alt="Rank Pin" />
        </motion.div>
      )}
      <div className="text-center md:text-left">
        <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.8em', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '0.5rem' }}>Reconocimiento</span>
        <h1 style={{ color: screen.color, textShadow: `0 0 40px ${screen.color}40`, fontSize: 'clamp(3rem, 8vw, 6rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, textTransform: 'uppercase' }}>{screen.rankName}</h1>
        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 0.5, duration: 1 }} style={{ height: 2, background: 'rgba(255,255,255,0.20)', marginTop: '2rem', width: '100%' }} />
      </div>
    </motion.div>
  </div>
);

// =====================================================
// AFFILIATE VIEW
// =====================================================
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
    } else setContentMode('info');
  }, [screen, isHorizontal, duration]);

  const imgWidth = isHorizontal ? 330 : 295;
  const imgHeight = (imgWidth * 5) / 4;

  return (
    <div className={`flex items-center justify-center w-full h-full px-4 md:px-10 ${isVertical ? 'gap-8 md:gap-20' : ''}`}>
      {items.map((person, idx) => (
        <motion.div
          key={person.id}
          initial={isVertical ? { y: 40, opacity: 0 } : {}}
          animate={isVertical ? { y: 0, opacity: 1 } : {}}
          transition={isVertical ? { duration: 0.8, ease: "easeOut", delay: idx * 0.2 } : {}}
          className={`relative flex items-center gpu-layer ${isHorizontal ? 'flex-col md:flex-row w-full max-w-[970px] h-auto min-h-[495px] p-8 gap-8' : 'flex-col w-full max-w-[390px] h-[600px] p-6'}`}
          style={{ background: 'rgba(10,10,10,0.90)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2rem', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
        >
          <div className={`relative flex-shrink-0 mx-auto md:mx-0 ${isHorizontal ? '' : 'mb-6'}`} style={{ width: imgWidth, height: imgHeight }}>
            <div className="absolute inset-0 z-10" style={{ borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }} />
            <img
              src={person.foto || "https://via.placeholder.com/400x500?text=Leader"}
              alt={person.nombre}
              className="gpu-layer"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1.5rem', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', filter: 'brightness(1.1) contrast(1.1)' }}
              loading="eager"
            />
            {isVertical && person.isPresidentsClub && clubPin && (
              <div className="absolute" style={{ bottom: -20, right: -20, width: 80, height: 80, zIndex: 30 }}>
                <img src={clubPin} alt="Club" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            )}
          </div>

          <div className={`flex-1 flex flex-col ${isHorizontal ? 'text-left' : 'text-center w-full'} justify-center`} style={{ zIndex: 10, overflow: 'hidden', minWidth: 0 }}>
            <AnimatePresence mode="wait">
              {(contentMode === 'info' || !person.frase) ? (
                <motion.div key="info" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5 }} className="w-full">
                  <div style={{ marginBottom: '0.5rem' }}>
                    {isHorizontal ? (
                      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 12, minHeight: 70 }}>
                        {rankPins?.[person.rango] ? (
                          <img src={rankPins[person.rango]} alt={person.rango} style={{ width: 60, height: 60, objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#D4AF37', fontWeight: 700 }}>{person.rango}</span>
                        )}
                        {person.isPresidentsClub && clubPin && (
                          <img src={clubPin} alt="President's Club" style={{ width: 60, height: 60, objectFit: 'contain' }} />
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#D4AF37', fontWeight: 700 }}>{person.rango}</span>
                      </div>
                    )}
                    <div className={`${isHorizontal ? 'text-4xl md:text-6xl' : (items.length > 1 ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl')} mb-1`}>
                      <NameDisplay name={person.nombre} isSmall={items.length > 1} maxLines={2} />
                    </div>
                  </div>
                  <div className={`flex items-center gap-4 ${isHorizontal ? 'justify-start' : 'justify-center'}`}>
                    <div style={{ padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={10} style={{ color: 'rgba(255,255,255,0.40)' }} />
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.60)', fontWeight: 500 }}>{person.pais || "Global"}</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="quote" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.8 }} className="w-full flex items-center justify-start">
                  <p style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', fontStyle: 'italic', fontFamily: 'Georgia, serif', color: 'rgba(180,180,180,0.9)', lineHeight: 1.6, fontWeight: 300, WebkitLineClamp: 4, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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

// =====================================================
// APPLE MODAL BASE
// =====================================================
const AppleModal = ({ isOpen, onClose, children, width = 440 }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ width: '100%', maxWidth: width }}>
        {children}
      </div>
    </div>
  );
};

// =====================================================
// CONFIRMATION MODAL
// =====================================================
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', danger = true }) => (
  <AppleModal isOpen={isOpen} onClose={onClose} width={380}>
    <div style={{ padding: '28px 28px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: danger ? 'rgba(255,69,58,0.15)' : 'rgba(10,132,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={20} style={{ color: danger ? '#ff453a' : '#0a84ff' }} />
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 2 }}>{title}</h3>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', lineHeight: 1.6, marginBottom: 24 }}>{message}</p>
    </div>
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 28px', display: 'flex', gap: 10 }}>
      <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>Cancelar</button>
      <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{confirmLabel}</button>
    </div>
  </AppleModal>
);

// =====================================================
// CSV HELP MODAL
// =====================================================
const CSVHelpModal = ({ isOpen, onClose }) => (
  <AppleModal isOpen={isOpen} onClose={onClose} width={680}>
    <div style={{ padding: '28px 28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(10,132,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} style={{ color: '#60a5fa' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Formato CSV Requerido</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>Separador: punto y coma ( ; )</p>
          </div>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {/* Required notice */}
      <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.20)', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'rgba(200,220,255,0.80)', lineHeight: 1.6 }}>
          La primera fila debe ser el <strong>encabezado</strong> con los nombres de columnas. Los nombres de columna deben contener las palabras clave indicadas (no son case-sensitive).
        </p>
      </div>

      {/* Columns table */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        <table className="csv-table">
          <thead>
            <tr>
              <th>Columna (clave)</th>
              <th>¿Requerida?</th>
              <th>Descripción</th>
              <th>Ejemplo</th>
            </tr>
          </thead>
          <tbody>
            {CSV_COLUMNS.map((col) => (
              <tr key={col.key}>
                <td><code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 5, fontSize: 11, color: '#e2e8f0' }}>{col.key}</code></td>
                <td>
                  {col.required
                    ? <span className="info-pill red">Requerida</span>
                    : <span className="info-pill" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.08)' }}>Opcional</span>}
                </td>
                <td style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{col.description}</td>
                <td style={{ color: 'rgba(255,255,255,0.40)', fontSize: 11, fontFamily: 'monospace' }}>{col.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Valid ranks */}
      <div style={{ padding: '16px 0', marginTop: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', marginBottom: 10 }}>Rangos válidos (exactos)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {RANKS_CONFIG.map(r => (
            <span key={r.name} style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: r.color, fontWeight: 500 }}>{r.name}</span>
          ))}
        </div>
      </div>

      {/* Example */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', marginBottom: 8 }}>Ejemplo de archivo</p>
        <div style={{ background: 'rgba(0,0,0,0.50)', borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <code style={{ fontSize: 11, color: 'rgba(150,255,150,0.80)', lineHeight: 1.8, display: 'block', whiteSpace: 'pre' }}>
{`id;nombre;rango;pais;foto;bio;pc
D001;María González López;Oro Élite;México;https://..../foto.jpg;El éxito...;SI
D002;Carlos Pérez Martínez;Platino;Colombia;;La disciplina...;NO
D003;Ana Torres;Bronce;Argentina;;;`}
          </code>
        </div>
      </div>
    </div>
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 28px' }}>
      <button onClick={onClose} className="btn-primary" style={{ width: '100%', borderRadius: 12, padding: '12px 20px', fontSize: 14 }}>Entendido</button>
    </div>
  </AppleModal>
);

// =====================================================
// CSV PREVIEW MODAL
// =====================================================
const CSVPreviewModal = ({ isOpen, onClose, onConfirm, previewData, conflicts }) => {
  const toAdd = previewData.filter(r => !r.isConflict && !r.isDuplicate);
  const toUpdate = previewData.filter(r => r.isConflict);
  const skipped = previewData.filter(r => r.isDuplicate || r.hasError);

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} width={760}>
      <div style={{ padding: '28px 28px 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Table size={20} style={{ color: '#D4AF37' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Vista previa de importación</h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>{previewData.length} registros encontrados</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
          <span className="info-pill green"><CheckCircle size={11} />{toAdd.length} nuevos</span>
          {toUpdate.length > 0 && <span className="info-pill gold"><ArrowUpCircle size={11} />{toUpdate.length} actualizaciones de rango</span>}
          {skipped.length > 0 && <span className="info-pill red"><AlertCircle size={11} />{skipped.length} omitidos</span>}
        </div>

        {/* Table */}
        <div className="apple-scroll" style={{ flex: 1, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', overflow: 'auto', marginBottom: 20 }}>
          <table className="csv-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>ID</th>
                <th>Nombre</th>
                <th>Rango</th>
                <th>País</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, i) => (
                <tr key={i}>
                  <td style={{ color: 'rgba(255,255,255,0.30)', fontSize: 11 }}>{i + 1}</td>
                  <td><code style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', background: 'rgba(255,255,255,0.04)', padding: '2px 5px', borderRadius: 4 }}>{row.distribuidorId || '—'}</code></td>
                  <td style={{ fontWeight: 500 }}>{row.nombre || <span style={{ color: 'rgba(255,69,58,0.7)' }}>Sin nombre</span>}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, color: RANKS_CONFIG.find(r => r.name === row.rango)?.color || 'rgba(255,255,255,0.50)' }}>
                      {row.rango || '—'}
                    </span>
                  </td>
                  <td style={{ color: 'rgba(255,255,255,0.50)', fontSize: 12 }}>{row.pais || '—'}</td>
                  <td>
                    {row.hasError ? <span className="info-pill red"><AlertCircle size={9} />Error</span>
                      : row.isDuplicate ? <span className="info-pill" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 9 }}>Duplicado</span>
                        : row.isConflict ? <span className="info-pill gold"><ArrowUpCircle size={9} />Mejora rango: {row.newRango}</span>
                          : <span className="info-pill green"><Plus size={9} />Nuevo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 28px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>Cancelar</button>
        {(toAdd.length > 0 || toUpdate.length > 0) && (
          <button onClick={() => onConfirm(toAdd, toUpdate)} className="btn-primary btn-gold" style={{ flex: 2, padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Save size={14} />Importar {toAdd.length + toUpdate.length} registros
          </button>
        )}
      </div>
    </AppleModal>
  );
};

// =====================================================
// RANK UPDATE MODAL
// =====================================================
const RankUpdateModal = ({ isOpen, onClose, onUpdate, conflicts }) => (
  <AppleModal isOpen={isOpen} onClose={onClose} width={480}>
    <div style={{ padding: '28px 28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpCircle size={20} style={{ color: '#D4AF37' }} />
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Mejoras de Rango</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>{conflicts.length} registros con rango superior detectados</p>
        </div>
      </div>
      <div className="apple-scroll" style={{ maxHeight: 280, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'auto', marginBottom: 20 }}>
        {conflicts.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <div style={{ minWidth: 0, flex: 1, paddingRight: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.newItem.nombre}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace', marginTop: 2 }}>{c.newItem.distribuidorId}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', textDecoration: 'line-through', marginBottom: 2 }}>{c.currentItem.rango}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#D4AF37' }}>→ {c.newItem.rango}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 28px', display: 'flex', gap: 10 }}>
      <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>Ignorar</button>
      <button onClick={onUpdate} className="btn-primary btn-gold" style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>Actualizar Todo</button>
    </div>
  </AppleModal>
);

// =====================================================
// ADMIN LOGIN
// =====================================================
const AdminLogin = ({ settings, onSuccess, onClose }) => {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pwd === settings.adminPassword) onSuccess();
    else { setError(true); setPwd(''); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'radial-gradient(ellipse at center, rgba(10,10,20,0.98) 0%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Subtle background noise */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(10,132,255,0.05) 0%, transparent 60%), radial-gradient(circle at 70% 70%, rgba(212,175,55,0.05) 0%, transparent 60%)' }} />

      <div className="login-card" style={{ position: 'relative' }}>
        {/* Logo area */}
        <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg, rgba(212,175,55,0.20), rgba(212,175,55,0.05))', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(212,175,55,0.20)' }}>
          <Shield size={32} style={{ color: '#D4AF37' }} />
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'white', marginBottom: 4, letterSpacing: '-0.02em' }}>Panel de Control</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 32 }}>4L Recognition System</p>

        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              ref={inputRef}
              type={showPwd ? 'text' : 'password'}
              value={pwd}
              onChange={e => { setPwd(e.target.value); setError(false); }}
              className={`apple-input ${error ? 'error' : ''}`}
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', paddingRight: 44 }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', padding: 4 }}>
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,69,58,0.10)', border: '1px solid rgba(255,69,58,0.25)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} style={{ color: '#ff453a', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#ff453a' }}>Contraseña incorrecta</span>
            </div>
          )}

          <button type="submit" className="btn-primary btn-gold" style={{ width: '100%', padding: '14px 20px', borderRadius: 14, fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            Ingresar
          </button>
        </form>

        <button onClick={onClose} style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, transition: 'color 0.2s' }}
          onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.60)'}
          onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.30)'}>
          ← Volver a la pantalla
        </button>
      </div>
    </div>
  );
};

// =====================================================
// ADMIN PORTAL - MAIN
// =====================================================
const AdminPortal = ({ affiliates, settings, saveAsset, deleteAsset, saveSettings, onClose, isAuthenticated, setIsAuthenticated, user }) => {
  const [activeTab, setActiveTab] = useState("leaders");
  const [formData, setFormData] = useState({ distribuidorId: '', nombre: '', rango: 'Presidencial', pais: '', frase: '', foto: '', isPresidentsClub: false, hidden: false });
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [idError, setIdError] = useState("");
  const [expandedRanks, setExpandedRanks] = useState({});

  // Modals
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: '' });
  const [clearAllModal, setClearAllModal] = useState(false);
  const [rankUpdateModal, setRankUpdateModal] = useState(false);
  const [csvPreviewModal, setCsvPreviewModal] = useState(false);
  const [csvHelpModal, setCsvHelpModal] = useState(false);

  // CSV data
  const [csvPreviewData, setCsvPreviewData] = useState([]);
  const [csvConflicts, setCsvConflicts] = useState([]);

  // Toast
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const toggleRank = (rankName) => setExpandedRanks(prev => ({ ...prev, [rankName]: !prev[rankName] }));

  const handleSaveAffiliate = async () => {
    setIdError("");
    if (!formData.nombre || !user) return;
    if (!formData.distribuidorId?.trim()) { setIdError("El ID de Distribuidor es obligatorio."); return; }
    const duplicate = affiliates.find(a => a.distribuidorId === formData.distribuidorId && a.id !== (editingId || ''));
    if (duplicate) { setIdError("Este ID ya existe."); return; }

    const affId = editingId || generateId('man');
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', affId), { ...formData, id: affId });
      setEditingId(null);
      setFormData({ distribuidorId: '', nombre: '', rango: 'Presidencial', pais: '', frase: '', foto: '', isPresidentsClub: false, hidden: false });
      showToast(editingId ? 'Registro actualizado' : 'Líder agregado exitosamente', 'success');
    } catch { showToast('Error al guardar', 'error'); }
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (!user) return;
      const rows = ev.target.result.split('\n').filter(r => r.trim());
      const header = rows[0].toLowerCase();
      const hCols = header.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      const previewRows = [];
      const processedIds = new Set();

      rows.slice(1).forEach((row, i) => {
        const cols = row.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        const obj = { id: generateId(`csv-${i}`), isPresidentsClub: false, hidden: false, distribuidorId: '', hasError: false, isDuplicate: false, isConflict: false };

        hCols.forEach((h, idx) => {
          const colVal = cols[idx];
          if (!colVal) return;
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

        if (!obj.distribuidorId || !obj.nombre) { obj.hasError = true; previewRows.push(obj); return; }
        if (processedIds.has(obj.distribuidorId)) { obj.isDuplicate = true; previewRows.push(obj); return; }
        processedIds.add(obj.distribuidorId);
        if (!obj.rango) obj.rango = "Presidencial";

        const existing = affiliates.find(a => a.distribuidorId === obj.distribuidorId);
        if (existing) {
          const oldP = getRankPriority(existing.rango);
          const newP = getRankPriority(obj.rango);
          if (newP > oldP) { obj.isConflict = true; obj.newRango = obj.rango; obj.originalId = existing.id; }
          else { obj.isDuplicate = true; }
        }
        previewRows.push(obj);
      });

      setCsvPreviewData(previewRows);
      const conflicts = previewRows.filter(r => r.isConflict);
      setCsvConflicts(conflicts.map(c => ({
        newItem: { ...c, id: c.originalId || c.id },
        currentItem: affiliates.find(a => a.distribuidorId === c.distribuidorId) || {}
      })));
      setCsvPreviewModal(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleCSVConfirm = async (toAdd, toUpdate) => {
    setCsvPreviewModal(false);
    try {
      if (toAdd.length > 0) {
        const batch = writeBatch(db);
        toAdd.forEach(item => {
          const cleanItem = { ...item };
          delete cleanItem.hasError; delete cleanItem.isDuplicate; delete cleanItem.isConflict; delete cleanItem.newRango; delete cleanItem.originalId;
          batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', cleanItem.id), cleanItem);
        });
        await batch.commit();
      }
      if (toUpdate.length > 0) {
        const batch = writeBatch(db);
        toUpdate.forEach(item => {
          const cleanItem = { ...item };
          delete cleanItem.hasError; delete cleanItem.isDuplicate; delete cleanItem.isConflict; delete cleanItem.newRango; delete cleanItem.originalId;
          const existing = affiliates.find(a => a.distribuidorId === cleanItem.distribuidorId);
          if (existing) batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', existing.id), { ...existing, rango: cleanItem.rango });
        });
        await batch.commit();
      }
      showToast(`${toAdd.length} nuevos + ${toUpdate.length} actualizados`, 'success');
    } catch { showToast('Error al importar CSV', 'error'); }
  };

  const confirmDelete = async () => {
    if (deleteModal.id && user) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', deleteModal.id)); showToast('Registro eliminado', 'info'); }
      catch { showToast('Error al eliminar', 'error'); }
      setDeleteModal({ open: false, id: null, name: '' });
    }
  };

  const confirmClearAll = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    affiliates.forEach(a => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', a.id)));
    await batch.commit();
    setClearAllModal(false);
    showToast('Base de datos limpiada', 'info');
  };

  const confirmRankUpdates = async () => {
    if (!user || csvConflicts.length === 0) return;
    const batch = writeBatch(db);
    csvConflicts.forEach(c => batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', c.newItem.id), c.newItem));
    await batch.commit();
    setRankUpdateModal(false);
    setCsvConflicts([]);
    showToast('Rangos actualizados', 'success');
  };

  const toggleHide = async (id) => {
    if (!user) return;
    const affiliate = affiliates.find(a => a.id === id);
    if (!affiliate) return;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'affiliates', id), { hidden: !affiliate.hidden }, { merge: true });
    showToast(affiliate.hidden ? 'Visible en pantalla' : 'Oculto de pantalla', 'info');
  };

  const handleImageUpload = async (e, field) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const base64 = await compressImage(file);
      const finalUrl = await uploadToImgBB(base64, settings.imgbbApiKey);
      if (field === 'foto') setFormData(prev => ({ ...prev, foto: finalUrl }));
      showToast('Imagen subida', 'success');
    } catch { showToast('Error al subir imagen', 'error'); }
    finally { setUploading(false); }
  };

  const handlePinUpload = async (e, rankName) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const base64 = await compressImage(file);
      const finalUrl = await uploadToImgBB(base64, settings.imgbbApiKey);
      await saveAsset(`rank-${rankName}`, finalUrl);
      showToast(`Pin de ${rankName} guardado`, 'success');
    } catch { showToast('Error al subir pin', 'error'); }
    finally { setUploading(false); }
  };

  const handleClubPinUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const base64 = await compressImage(file);
      const finalUrl = await uploadToImgBB(base64, settings.imgbbApiKey);
      await saveAsset('club-pin', finalUrl);
      showToast("Pin del Club guardado", 'success');
    } catch { showToast('Error al subir pin', 'error'); }
    finally { setUploading(false); }
  };

  const groupedAffiliates = useMemo(() => {
    const filtered = affiliates.filter(a =>
      a.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.distribuidorId && a.distribuidorId.includes(searchTerm))
    );
    const grouped = {};
    RANKS_CONFIG.forEach(rank => {
      const inRank = filtered.filter(a => a.rango === rank.name);
      if (inRank.length > 0) grouped[rank.name] = inRank;
    });
    return grouped;
  }, [affiliates, searchTerm]);

  const totalActive = affiliates.filter(a => !a.hidden).length;
  const totalHidden = affiliates.filter(a => a.hidden).length;

  if (!isAuthenticated) return (
    <AdminLogin settings={settings} onSuccess={() => setIsAuthenticated(true)} onClose={onClose} />
  );

  const tabs = [
    { id: 'leaders', label: 'Líderes', icon: <Users size={13} /> },
    { id: 'settings', label: 'Pines', icon: <Star size={13} /> },
    { id: 'security', label: 'Seguridad', icon: <Shield size={13} /> },
  ];

  return (
    <div className="admin-wrapper" style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Modals */}
      <ConfirmationModal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, id: null, name: '' })} onConfirm={confirmDelete} title="Eliminar Registro" message={`¿Eliminar a "${deleteModal.name}"? Esta acción no se puede deshacer.`} confirmLabel="Eliminar" danger />
      <ConfirmationModal isOpen={clearAllModal} onClose={() => setClearAllModal(false)} onConfirm={confirmClearAll} title="Limpiar Base de Datos" message="Se eliminarán TODOS los líderes de la base de datos. Esta acción es irreversible." confirmLabel="Borrar Todo" danger />
      <RankUpdateModal isOpen={rankUpdateModal} onClose={() => { setRankUpdateModal(false); setCsvConflicts([]); }} onUpdate={confirmRankUpdates} conflicts={csvConflicts} />
      <CSVPreviewModal isOpen={csvPreviewModal} onClose={() => setCsvPreviewModal(false)} onConfirm={handleCSVConfirm} previewData={csvPreviewData} conflicts={csvConflicts} />
      <CSVHelpModal isOpen={csvHelpModal} onClose={() => setCsvHelpModal(false)} />

      {/* Toast */}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* TOP BAR */}
      <div className="admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* App icon */}
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(212,175,55,0.08))', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,0.18)', flexShrink: 0 }}>
            <Layers size={16} style={{ color: '#D4AF37' }} />
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>4L Recognition</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>Admin</span>
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.10)', margin: '0 4px' }} />

          {/* Tabs */}
          <div className="tab-group">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-item ${activeTab === tab.id ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Stats pills */}
          {affiliates.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="info-pill green"><span style={{ fontWeight: 700 }}>{totalActive}</span> activos</span>
              {totalHidden > 0 && <span className="info-pill" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.08)' }}><EyeOff size={10} />{totalHidden} ocultos</span>}
            </div>
          )}
          <button onClick={onClose} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600 }}>
            <Monitor size={13} />Vista TV
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="admin-content">

        {/* ==================== TAB: LEADERS ==================== */}
        {activeTab === 'leaders' && (
          <>
            {/* LEFT: Form panel */}
            <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Form card */}
              <div className="glass-card" style={{ padding: '20px', flex: 1, overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: editingId ? '#60a5fa' : '#D4AF37' }}>
                    {editingId ? '✎ Editando' : '+ Nuevo Líder'}
                  </span>
                  {editingId && (
                    <button onClick={() => { setEditingId(null); setFormData({ distribuidorId: '', nombre: '', rango: 'Presidencial', pais: '', frase: '', foto: '', isPresidentsClub: false, hidden: false }); setIdError(""); }}
                      style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                      Cancelar
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* ID Field */}
                  <div>
                    <input
                      value={formData.distribuidorId}
                      onChange={e => { setFormData({ ...formData, distribuidorId: e.target.value }); setIdError(""); }}
                      className={`apple-input ${idError ? 'error' : ''}`}
                      placeholder="ID Distribuidor *"
                      style={{ fontSize: 13 }}
                    />
                    {idError && <p style={{ fontSize: 11, color: '#ff453a', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={11} />{idError}</p>}
                  </div>

                  {/* Name */}
                  <input value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} placeholder="Nombre completo *" className="apple-input" style={{ fontSize: 13 }} />

                  {/* Rank + Country */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select value={formData.rango} onChange={e => setFormData({ ...formData, rango: e.target.value })} className="apple-input" style={{ fontSize: 12, cursor: 'pointer' }}>
                      {RANKS_CONFIG.map(r => <option key={r.name} value={r.name} style={{ background: '#1c1c1e' }}>{r.name}</option>)}
                    </select>
                    <input value={formData.pais} onChange={e => setFormData({ ...formData, pais: e.target.value })} placeholder="País" className="apple-input" style={{ fontSize: 13 }} />
                  </div>

                  {/* Photo URL */}
                  <input value={formData.foto} onChange={e => setFormData({ ...formData, foto: e.target.value })} placeholder="URL de foto..." className="apple-input" style={{ fontSize: 12 }} />

                  {/* Photo Preview */}
                  {formData.foto && (
                    <div style={{ width: '100%', height: 100, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
                      <img src={formData.foto} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                    </div>
                  )}

                  {/* Upload button */}
                  <label className="drop-zone" style={{ padding: '14px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {uploading ? <RefreshCw size={13} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite' }} /> : <Upload size={13} style={{ color: 'rgba(255,255,255,0.40)' }} />}
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: uploading ? '#60a5fa' : 'rgba(255,255,255,0.40)' }}>
                        {uploading ? 'Subiendo...' : settings.imgbbApiKey ? 'Subir a ImgBB' : 'Subir foto (WebP)'}
                      </span>
                    </div>
                    <input type="file" style={{ display: 'none' }} accept="image/*" disabled={uploading} onChange={e => handleImageUpload(e, 'foto')} />
                  </label>

                  {/* Quote/Bio */}
                  <textarea value={formData.frase} onChange={e => setFormData({ ...formData, frase: e.target.value })} placeholder="Frase motivacional (opcional)..." className="apple-input" style={{ fontSize: 12, resize: 'vertical', minHeight: 60, lineHeight: 1.5 }} />

                  {/* President's Club toggle */}
                  {CLUB_ELIGIBLE_RANKS.includes(formData.rango) && (
                    <div onClick={() => setFormData({ ...formData, isPresidentsClub: !formData.isPresidentsClub })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${formData.isPresidentsClub ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.08)'}`, background: formData.isPresidentsClub ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                      <label className="apple-toggle" onClick={e => e.stopPropagation()} style={{ pointerEvents: 'none' }}>
                        <input type="checkbox" checked={formData.isPresidentsClub} readOnly />
                        <span className="apple-toggle-track" />
                      </label>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: formData.isPresidentsClub ? '#D4AF37' : 'rgba(255,255,255,0.70)' }}>President's Club</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Muestra pin especial</div>
                      </div>
                    </div>
                  )}

                  {/* Save button */}
                  <button onClick={handleSaveAffiliate} disabled={uploading} className="btn-primary" style={{ width: '100%', padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, marginTop: 4, background: editingId ? '#0A84FF' : 'linear-gradient(135deg, #D4AF37, #c9a227)', color: editingId ? 'white' : '#000' }}>
                    <Save size={13} style={{ marginRight: 6 }} />{editingId ? 'Actualizar Registro' : 'Agregar Líder'}
                  </button>
                </div>
              </div>

              {/* CSV Import card */}
              <div className="glass-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)' }}>Importar CSV</span>
                  <button onClick={() => setCsvHelpModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#60a5fa', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: 'rgba(10,132,255,0.10)', border: '1px solid rgba(10,132,255,0.20)' }}>
                    <HelpCircle size={10} />Guía de formato
                  </button>
                </div>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCSV} accept=".csv" />
                <button onClick={() => fileInputRef.current.click()} className="drop-zone" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', cursor: 'pointer', background: 'none', border: '2px dashed rgba(255,255,255,0.10)' }}>
                  <FileText size={14} style={{ color: 'rgba(255,255,255,0.40)' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seleccionar archivo .csv</span>
                </button>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
                  Separador: <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>;</code> · Se mostrará vista previa antes de importar
                </p>
              </div>
            </div>

            {/* RIGHT: Affiliates list */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* Search + actions bar */}
              <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, borderRadius: 16 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.30)' }} />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre o ID..."
                    className="apple-input"
                    style={{ paddingLeft: 36, fontSize: 13 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', paddingRight: 6 }}>{affiliates.length} líderes</span>
                  <button onClick={() => setClearAllModal(true)} className="btn-danger" style={{ padding: '8px 14px', borderRadius: 9, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Trash2 size={11} />Limpiar BD
                  </button>
                </div>
              </div>

              {/* Grouped list */}
              <div className="apple-scroll" style={{ flex: 1 }}>
                {Object.keys(groupedAffiliates).length === 0 ? (
                  <div className="glass-card" style={{ padding: 48, textAlign: 'center', borderRadius: 20 }}>
                    <Users size={40} style={{ color: 'rgba(255,255,255,0.10)', margin: '0 auto 16px' }} />
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.30)', fontWeight: 500 }}>
                      {searchTerm ? 'Sin resultados para tu búsqueda' : 'No hay líderes registrados'}
                    </p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
                      {searchTerm ? 'Intenta con otro término' : 'Agrega líderes manualmente o importa un CSV'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
                    {Object.entries(groupedAffiliates).map(([rank, items]) => {
                      const rankConfig = RANKS_CONFIG.find(r => r.name === rank);
                      const isExpanded = expandedRanks[rank];
                      return (
                        <div key={rank} className="glass-card" style={{ borderRadius: 16, overflow: 'hidden' }}>
                          {/* Rank header */}
                          <button onClick={() => toggleRank(rank)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', transition: 'background 0.2s', background: 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 3, background: rankConfig?.color || '#fff', flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: rankConfig?.color || '#fff' }}>{rank}</span>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>({items.length})</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{isExpanded ? 'Ocultar' : 'Mostrar'}</span>
                              {isExpanded ? <ChevronUp size={14} style={{ color: 'rgba(255,255,255,0.30)' }} /> : <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.30)' }} />}
                            </div>
                          </button>

                          {/* Items */}
                          {isExpanded && (
                            <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, paddingTop: 12 }}>
                              {items.map(a => (
                                <div key={a.id} className="person-card" style={{ opacity: a.hidden ? 0.45 : 1 }}>
                                  {/* Avatar */}
                                  <div style={{ width: 40, height: 50, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <ImageWithSkeleton src={a.foto} alt={a.nombre} containerClassName="w-full h-full" className="" placeholderIcon />
                                  </div>

                                  {/* Info */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                      <code style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>{a.distribuidorId}</code>
                                      {a.pais && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>· {a.pais}</span>}
                                      {a.isPresidentsClub && <span className="info-pill gold" style={{ padding: '1px 5px', fontSize: 9 }}>PC</span>}
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    <button onClick={() => toggleHide(a.id)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: a.hidden ? '#60a5fa' : 'rgba(255,255,255,0.40)' }}
                                      title={a.hidden ? 'Mostrar' : 'Ocultar'}>
                                      {a.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                    <button onClick={() => { setEditingId(a.id); setFormData({ distribuidorId: a.distribuidorId || '', nombre: a.nombre || '', rango: a.rango || 'Presidencial', pais: a.pais || '', frase: a.frase || '', foto: a.foto || '', isPresidentsClub: a.isPresidentsClub || false, hidden: a.hidden || false }); }}
                                      style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: 'rgba(255,255,255,0.40)' }}>
                                      <Edit size={12} />
                                    </button>
                                    <button onClick={() => setDeleteModal({ open: true, id: a.id, name: a.nombre })}
                                      style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,69,58,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: 'rgba(255,69,58,0.60)' }}>
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ==================== TAB: SETTINGS (PINS) ==================== */}
        {activeTab === 'settings' && (
          <div style={{ flex: 1, display: 'flex', gap: 16 }}>
            {/* Rank Pins */}
            <div className="glass-card" style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>Pines de Rango</h3>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Imágenes PNG que aparecen junto al nombre del rango en pantalla</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {RANKS_CONFIG.map(rank => (
                  <div key={rank.name} style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      {/* Pin preview */}
                      <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${settings.rankPins[rank.name] ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'border-color 0.2s', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = rank.color + '60'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = settings.rankPins[rank.name] ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}>
                          {settings.rankPins[rank.name]
                            ? <img src={settings.rankPins[rank.name]} alt={rank.name} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                            : <Upload size={16} style={{ color: 'rgba(255,255,255,0.25)' }} />
                          }
                        </div>
                        <input type="file" style={{ display: 'none' }} accept="image/*" disabled={uploading} onChange={e => handlePinUpload(e, rank.name)} />
                      </label>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: rank.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rank.name}</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{rank.layout === 'horizontal' ? 'Vista individual' : 'Vista grupal'}</span>
                      </div>

                      {settings.rankPins[rank.name] && (
                        <button onClick={() => deleteAsset(`rank-${rank.name}`)} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,69,58,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,69,58,0.60)', flexShrink: 0 }}>
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>

                    {/* URL input */}
                    <div style={{ position: 'relative' }}>
                      <Link size={10} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
                      <input
                        value={settings.rankPins[rank.name]?.startsWith('http') ? settings.rankPins[rank.name] : ''}
                        onChange={e => saveAsset(`rank-${rank.name}`, e.target.value)}
                        placeholder="O pega una URL..."
                        className="apple-input"
                        style={{ paddingLeft: 26, fontSize: 11, padding: '7px 10px 7px 26px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Presidents Club pin */}
            <div style={{ width: 260, flexShrink: 0 }}>
              <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#D4AF37', marginBottom: 4 }}>President's Club</h3>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginBottom: 20, lineHeight: 1.5 }}>Pin exclusivo para miembros del club presidencial</p>

                <label style={{ cursor: 'pointer', display: 'block', marginBottom: 16 }}>
                  <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'rgba(212,175,55,0.06)', border: `2px dashed ${settings.presidentsClubPin ? 'rgba(212,175,55,0.40)' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: '0 auto', transition: 'all 0.2s', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,175,55,0.60)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = settings.presidentsClubPin ? 'rgba(212,175,55,0.40)' : 'rgba(255,255,255,0.12)'}>
                    {settings.presidentsClubPin
                      ? <img src={settings.presidentsClubPin} alt="Club Pin" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                      : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.25)' }}><Upload size={22} /><span style={{ fontSize: 11, fontWeight: 500 }}>Subir Pin</span></div>
                    }
                  </div>
                  <input type="file" style={{ display: 'none' }} accept="image/*" disabled={uploading} onChange={handleClubPinUpload} />
                </label>

                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Link size={10} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
                  <input
                    value={settings.presidentsClubPin?.startsWith('http') ? settings.presidentsClubPin : ''}
                    onChange={e => saveAsset('club-pin', e.target.value)}
                    placeholder="O pega una URL..."
                    className="apple-input"
                    style={{ paddingLeft: 26, fontSize: 11, padding: '8px 10px 8px 26px' }}
                  />
                </div>

                {settings.presidentsClubPin && (
                  <button onClick={() => deleteAsset('club-pin')} className="btn-danger" style={{ width: '100%', padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Trash2 size={12} />Eliminar Pin
                  </button>
                )}
              </div>

              {/* Upload status */}
              {uploading && (
                <div className="glass-card" style={{ padding: '14px 16px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', animation: 'pulse-dot 1s infinite' }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>Subiendo imagen...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB: SECURITY ==================== */}
        {activeTab === 'security' && (
          <div style={{ flex: 1, display: 'flex', gap: 16, alignItems: 'flex-start' }}>

            {/* Password card */}
            <div className="glass-card" style={{ flex: 1, maxWidth: 440, padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,69,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={18} style={{ color: '#ff453a' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Contraseña Admin</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Protege el acceso al panel</p>
                </div>
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', display: 'block', marginBottom: 8 }}>Nueva contraseña</label>
              <input
                type="password"
                value={settings.adminPassword}
                onChange={e => saveSettings({ adminPassword: e.target.value })}
                className="apple-input"
                style={{ fontSize: 16, letterSpacing: '0.15em', textAlign: 'center', marginBottom: 8 }}
                placeholder="••••••••"
              />
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6, lineHeight: 1.5 }}>Los cambios se guardan automáticamente en Firebase.</p>
            </div>

            {/* ImgBB card */}
            <div className="glass-card" style={{ flex: 1, maxWidth: 480, padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(10,132,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cloud size={18} style={{ color: '#60a5fa' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Optimización para Smart TV</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Almacenamiento en nube de imágenes</p>
                </div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.15)', marginBottom: 20 }}>
                <p style={{ fontSize: 12, color: 'rgba(180,210,255,0.80)', lineHeight: 1.6 }}>
                  Usa <strong style={{ color: '#60a5fa' }}>ImgBB</strong> para guardar imágenes en la nube en lugar de en Firestore. Esto mejora drásticamente la velocidad de carga en Smart TVs con conexiones limitadas.
                </p>
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', display: 'block', marginBottom: 8 }}>ImgBB API Key (gratuita)</label>
              <input
                type="text"
                value={settings.imgbbApiKey || ''}
                onChange={e => saveSettings({ imgbbApiKey: e.target.value })}
                placeholder="Pega tu Key aquí (ej: 5f9d3a8b2c1e...)"
                className="apple-input"
                style={{ fontSize: 13, marginBottom: 8, fontFamily: 'monospace' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                  {settings.imgbbApiKey ? '✅ API Key configurada' : 'Sin key: las fotos se guardan como base64 (más lento en TV)'}
                </p>
                <a href="https://api.imgbb.com" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}>
                  Obtener key →
                </a>
              </div>
            </div>

            {/* TV Tips card */}
            <div className="glass-card" style={{ flex: 1, maxWidth: 360, padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(48,209,88,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Monitor size={18} style={{ color: '#4ade80' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Smart TV — Consejos</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Mantener pantalla activa</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: '🔒', title: 'Wake Lock API', desc: 'El sistema usa la Wake Lock API automáticamente para prevenir que el TV se suspenda. Funciona en Chromium-based browsers.' },
                  { icon: '⚡', title: 'Interacción periódica', desc: 'Mueve el ratón o remote cada 30 min si el TV lo requiere. Algunos TVs tienen apagado automático independiente del software.' },
                  { icon: '🖥️', title: 'Modo Kiosco', desc: 'Para presentaciones largas, activa el modo Kiosco en el navegador del TV (F11 o pantalla completa) para evitar barras y notificaciones.' },
                  { icon: '🌐', title: 'Navegador recomendado', desc: 'Usa Chrome o Edge en el TV. Evita el navegador nativo de Samsung/LG ya que tienen soporte CSS limitado.' },
                ].map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{tip.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 3 }}>{tip.title}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{tip.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================
// MAIN APP
// =====================================================
const App = () => {
  const [affiliates, setAffiliates] = useState([]);
  const [settingsConfig, setSettingsConfig] = useState(DEFAULT_SETTINGS);
  const [assets, setAssets] = useState({});
  const [user, setUser] = useState(null);
  const [view, setView] = useState('tv');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  // TV Stay-awake
  useWakeLock();

  // Periodic activity simulation to prevent TV sleep (fallback for TVs without WakeLock support)
  useEffect(() => {
    if (view !== 'tv') return;
    const interval = setInterval(() => {
      // Create a tiny canvas render to keep GPU active
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, 1, 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [view]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error('Auth error:', e);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubAff = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'affiliates'),
      (snapshot) => setAffiliates(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubConfig = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'),
      (docSnap) => {
        if (docSnap.exists()) setSettingsConfig({ ...DEFAULT_SETTINGS, ...docSnap.data() });
        else setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), DEFAULT_SETTINGS);
      });
    const unsubAssets = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'assets'),
      (snapshot) => { const a = {}; snapshot.forEach(d => { a[d.id] = d.data().image; }); setAssets(a); });
    return () => { unsubAff(); unsubConfig(); unsubAssets(); };
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
          sequence.push({ type: 'affiliate', items: group, rankConfig: rank, duration: slideDuration, id: `group-${group.map(p => p.id).join('-')}` });
        }
      }
    });
    if (sequence.length === 0) sequence.push({ type: 'empty', duration: 5000, id: 'empty', theme: ["#000000", "#111111", "#000000"] });
    return sequence;
  }, [affiliates, finalSettings]);

  useEffect(() => {
    if ((timeline.length <= 1 && timeline[0]?.id === 'empty') || view === 'admin') return;
    const timer = setTimeout(() => setCurrentIndex(prev => (prev + 1) % timeline.length), timeline[currentIndex]?.duration || 5000);
    return () => clearTimeout(timer);
  }, [currentIndex, timeline, view]);

  const currentScreen = timeline[currentIndex] || { type: 'empty', theme: ["#000000", "#111111", "#000000"] };

  // Loading
  if (!ready) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 60, height: 60, background: 'linear-gradient(135deg, rgba(212,175,55,0.20), rgba(212,175,55,0.05))', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,0.20)' }}>
        <Sparkles size={28} style={{ color: '#D4AF37' }} />
      </div>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.05em' }}>Cargando...</p>
    </div>
  );

  // Admin view
  if (view === 'admin') return (
    <AdminPortal
      affiliates={affiliates}
      settings={finalSettings}
      saveAsset={saveAsset}
      deleteAsset={deleteAsset}
      saveSettings={saveSettings}
      onClose={() => setView('tv')}
      isAuthenticated={isAdminAuthenticated}
      setIsAuthenticated={setIsAdminAuthenticated}
      user={user}
    />
  );

  // TV view
  return (
    <div className="no-select" style={{ position: 'fixed', inset: 0, background: '#020617', color: 'white', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <BackgroundEffect theme={currentScreen.theme || currentScreen.rankConfig?.theme} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentScreen.id || currentIndex}
          variants={getVariants(currentScreen)}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="gpu-layer"
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, width: '100%', height: '100%' }}
        >
          {currentScreen?.type === 'separator' ? (
            <SeparatorView screen={currentScreen} />
          ) : currentScreen?.type === 'empty' ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.30)' }}>
              <Monitor size={48} style={{ margin: '0 auto 16px', color: 'rgba(255,255,255,0.10)' }} />
              <p style={{ fontSize: 20, fontWeight: 300, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Esperando datos...</p>
              <p style={{ fontSize: 13, marginTop: 8, color: 'rgba(255,255,255,0.20)' }}>Agrega líderes desde el panel de administración</p>
            </div>
          ) : (
            <AffiliateView screen={currentScreen} clubPin={finalSettings.presidentsClubPin} rankPins={finalSettings.rankPins} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Hidden admin button */}
      <button
        onClick={() => setView('admin')}
        style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 150, padding: 12, opacity: 0.08, transition: 'opacity 0.5s ease', cursor: 'pointer', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.08'}
      >
        <Lock size={16} style={{ color: 'white' }} />
      </button>
    </div>
  );
};

export default App;
