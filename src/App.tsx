import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  setDoc,
  limit,
  getDocs,
  getDoc,
  deleteDoc,
  Timestamp,
  where
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { 
  Column as ColumnType, 
  Card as CardType, 
  Message, 
  UserReadStatus,
  UserProfile,
  Incident,
  Attendance,
  DailyTask
} from './types';
import { 
  Plus, 
  LogOut, 
  MessageSquare, 
  Send, 
  X, 
  Layout,
  Users,
  Settings,
  Shield,
  UserCheck,
  UserCog,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  CalendarCheck,
  ClipboardList,
  BarChart3,
  Activity,
  Check,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// --- Error Handling ---
enum OperationType {
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const formatTimestamp = (ts: any, formatStr: string) => {
  if (!ts) return '...';
  try {
    if (typeof ts.toDate === 'function') return format(ts.toDate(), formatStr);
    if (ts instanceof Date) return format(ts, formatStr);
    if (typeof ts === 'number') return format(new Date(ts), formatStr);
  } catch (e) {
    console.error('Error formatting timestamp:', e);
  }
  return '...';
};

// --- Components ---

const Countdown = ({ createdAt, finalizedAt }: { createdAt: Timestamp; finalizedAt?: Timestamp }) => {
  const [timeLeft, setTimeLeft] = useState<string>('24:00:00');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!createdAt) return;
    if (finalizedAt) {
      setTimeLeft('DETENIDO');
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const start = createdAt.toDate().getTime();
      const deadline = start + (24 * 60 * 60 * 1000);
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setIsUrgent(true);
        clearInterval(timer);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
      
      if (hours < 4) setIsUrgent(true);
    }, 1000);

    return () => clearInterval(timer);
  }, [createdAt, finalizedAt]);

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-lg border font-mono text-[10px] font-black tracking-tighter",
      finalizedAt ? "bg-slate-100 border-slate-200 text-slate-400" :
      isUrgent ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : "bg-blue-50 border-blue-200 text-[#00aeef]"
    )}>
      <RefreshCw className={cn("w-3 h-3", !finalizedAt && "animate-spin-slow")} />
      <span>{timeLeft}</span>
    </div>
  );
};

interface CardProps {
  key?: React.Key;
  card: CardType;
  user: User;
  userProfile: UserProfile | null;
  onOpenDetail: () => void;
  onRecibir: (e: React.MouseEvent) => void;
  onAsignar: (techId: string, techName: string) => void;
  technicians: UserProfile[];
}

const Card = ({ 
  card, 
  user, 
  userProfile,
  onOpenDetail,
  onRecibir,
  onAsignar,
  technicians
}: CardProps) => {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!card.lastMessageAt) return;

    const statusId = `${user.uid}_${card.id}`;
    const unsubscribe = onSnapshot(doc(db, 'userReadStatus', statusId), (snapshot) => {
      if (!snapshot.exists()) {
        setHasUnread(true);
        return;
      }
      const status = snapshot.data() as UserReadStatus;
      if (card.lastMessageAt && status.lastReadAt) {
        setHasUnread(card.lastMessageAt.toMillis() > status.lastReadAt.toMillis());
      } else {
        setHasUnread(true);
      }
    });

    return () => unsubscribe();
  }, [card.id, card.lastMessageAt, user.uid]);

  const isRecepcion = card.currentStep === 'recepcion';
  const isTaller = card.currentStep === 'taller';
  const isFinalizada = card.currentStep === 'finalizada';

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white p-4 rounded-2xl border border-slate-300 shadow-sm group hover:border-[#00aeef]/30 transition-all cursor-pointer relative overflow-hidden",
        isFinalizada && "opacity-75 grayscale-[0.5]"
      )}
      onClick={onOpenDetail}
    >
      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {card.tags?.map(tag => (
          <span 
            key={tag} 
            className={cn(
              "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border",
              tag === 'URGENTE' ? "bg-red-50 border-red-200 text-red-600" : 
              tag === 'GARANTIA' ? "bg-orange-50 border-orange-200 text-orange-600" :
              "bg-slate-50 border-slate-200 text-slate-600"
            )}
          >
            {tag}
          </span>
        ))}
        {isFinalizada && (
          <span className={cn(
            "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border",
            card.isRepaired ? "bg-green-50 border-green-200 text-green-600" : "bg-red-50 border-red-200 text-red-600"
          )}>
            {card.isRepaired ? 'REPARADO' : 'NO REPARADO'}
          </span>
        )}
      </div>

      {/* Title & Chat Notification */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-sm font-black text-slate-950 group-hover:text-[#00aeef] transition-colors tracking-tight leading-tight">
            {card.title}
          </h4>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            {isFinalizada ? `Cerrada: ${formatTimestamp(card.finalizedAt, 'dd/MM/yy')}` : `Ingreso: ${formatTimestamp(card.createdAt, 'dd/MM/yy')}`}
          </p>
        </div>
        {(hasUnread || isTaller || card.currentStep === 'reparacion' || card.currentStep === 'espera' || isFinalizada) && (
          <div className="relative">
            <MessageSquare className={cn("w-4 h-4", hasUnread ? "text-[#00aeef]" : "text-slate-300")} />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-[#00aeef] shadow-[0_0_10px_rgba(0,174,239,0.5)] animate-pulse" />
            )}
          </div>
        )}
      </div>
      
      {/* State Specific Info */}
      <div className="space-y-3">
        {!isFinalizada && (
          <Countdown createdAt={card.createdAt} finalizedAt={card.finalizedAt} />
        )}

        {isFinalizada && card.closingComment && (
          <p className="text-[10px] text-slate-600 italic line-clamp-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
            "{card.closingComment}"
          </p>
        )}

        {/* Technician Info (Not in Recepcion) */}
        {!isRecepcion && card.assignedTechnicianName && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
            <UserCog className="w-3 h-3 text-[#00aeef]/50" />
            <span className="text-[10px] text-slate-700 font-bold truncate">{card.assignedTechnicianName}</span>
          </div>
        )}

        {/* Actions */}
        {isRecepcion && (userProfile?.role === 'recepcion' || userProfile?.role === 'admin') && (
          <button 
            onClick={onRecibir}
            className="w-full py-2 bg-[#00aeef] hover:bg-[#0088cc] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all active:scale-95 shadow-lg shadow-[#00aeef]/10"
          >
            Recibir
          </button>
        )}

        {isTaller && (userProfile?.role === 'admin') && (
          <select 
            className="w-full py-2 bg-white border border-slate-300 rounded-xl text-[10px] font-bold text-slate-800 focus:outline-none focus:border-[#00aeef]/50 transition-all cursor-pointer"
            onChange={(e) => {
              const tech = technicians.find(t => t.uid === e.target.value);
              if (tech) onAsignar(tech.uid, tech.displayName || 'Técnico');
            }}
            defaultValue=""
            onClick={e => e.stopPropagation()}
          >
            <option value="" disabled>Asignar Técnico</option>
            {technicians.map(t => (
              <option key={t.uid} value={t.uid}>{t.displayName}</option>
            ))}
          </select>
        )}
      </div>
    </motion.div>
  );
};

interface ColumnProps {
  key?: React.Key;
  column: ColumnType;
  cards: CardType[];
  user: User;
  userProfile: UserProfile | null;
  onOpenDetail: (card: CardType) => void;
  onRecibir: (card: CardType) => void;
  onAsignar: (card: CardType, techId: string, techName: string) => void;
  technicians: UserProfile[];
}

const Column = ({ 
  column, 
  cards, 
  user, 
  userProfile,
  onOpenDetail,
  onRecibir,
  onAsignar,
  technicians
}: ColumnProps) => {
  return (
    <div className="flex flex-col flex-1 min-w-[220px] max-w-[280px] h-full bg-slate-100/50 rounded-3xl border border-slate-300 overflow-hidden backdrop-blur-sm">
      <div className="p-5 flex items-center justify-between bg-white/50 border-b border-slate-300">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-4 bg-[#00aeef] rounded-full shadow-[0_0_8px_rgba(0,174,239,0.4)]"></div>
          <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em]">{column.name}</h3>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[10px] text-slate-700 font-bold">
            {cards.length}
          </span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-none">
        <AnimatePresence mode="popLayout">
          {cards.map(card => (
            <Card 
              key={card.id} 
              card={card} 
              user={user} 
              userProfile={userProfile}
              onOpenDetail={() => onOpenDetail(card)}
              onRecibir={(e) => {
                e.stopPropagation();
                onRecibir(card);
              }}
              onAsignar={(techId, techName) => onAsignar(card, techId, techName)}
              technicians={technicians}
            />
          ))}
        </AnimatePresence>
        {cards.length === 0 && (
          <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-3xl text-slate-500">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50">Vacío</span>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Modals ---

interface CardDetailModalProps {
  card: CardType;
  user: User;
  userProfile: UserProfile | null;
  onClose: () => void;
  onPausar: (comment: string) => void;
  onReanudar: (comment: string) => void;
  onFinalizar: (isRepaired: boolean, comment: string) => void;
}

const CardDetailModal = ({ 
  card, 
  user, 
  userProfile, 
  onClose,
  onPausar,
  onReanudar,
  onFinalizar
}: CardDetailModalProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showFinalizeForm, setShowFinalizeForm] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'cards', card.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      
      const statusId = `${user.uid}_${card.id}`;
      setDoc(doc(db, 'userReadStatus', statusId), {
        userId: user.uid,
        cardId: card.id,
        lastReadAt: serverTimestamp()
      }, { merge: true });
    });
    return () => unsubscribe();
  }, [card.id, user.uid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, 'cards', card.id, 'messages'), {
        cardId: card.id,
        senderId: user.uid,
        senderName: user.displayName || 'Anónimo',
        text: newMessage.trim(),
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'cards', card.id), {
        lastMessageAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `cards/${card.id}/messages`);
    } finally {
      setIsSending(false);
    }
  };

  const isAssignedTech = card.assignedTechnicianId === user.uid;
  const isAdmin = userProfile?.role === 'admin';
  const canAction = isAssignedTech || isAdmin;

  // Filter history to show only relevant decision points (with comments or step changes)
  const decisionLog = card.history?.filter(h => h.comment || ['espera', 'reparacion', 'finalizada'].includes(h.step)) || [];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-5xl h-[85vh] rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
              <Layout className="w-6 h-6 text-[#00aeef]" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-black text-xl text-slate-950 tracking-tight">Orden #{card.title}</h3>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                  card.currentStep === 'finalizada' ? "bg-green-50 border-green-200 text-green-600" :
                  card.currentStep === 'espera' ? "bg-amber-50 border-amber-200 text-amber-600" :
                  "bg-blue-50 border-blue-200 text-blue-600"
                )}>
                  {card.currentStep === 'espera' ? 'En Espera' : 
                   card.currentStep === 'finalizada' ? 'Finalizada' : 
                   'En Reparación'}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                  Creada: {formatTimestamp(card.createdAt, 'dd/MM/yyyy HH:mm')}
                </span>
                <div className="flex gap-1">
                  {card.tags?.map(t => (
                    <span key={t} className="text-[8px] font-bold text-[#00aeef] uppercase tracking-widest">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Side: Chat */}
          <div className="flex-1 flex flex-col border-r border-slate-200 bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Comunicación en Tiempo Real</h4>
              <MessageSquare className="w-3 h-3 text-slate-400" />
            </div>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-none">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col max-w-[85%]", msg.senderId === user.uid ? "ml-auto items-end" : "items-start")}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{msg.senderName}</span>
                    <span className="text-[9px] text-slate-500 font-mono">{formatTimestamp(msg.createdAt, 'HH:mm')}</span>
                  </div>
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                    msg.senderId === user.uid 
                      ? "bg-[#00aeef] text-white rounded-tr-none shadow-lg shadow-[#00aeef]/10" 
                      : "bg-slate-100 text-slate-950 rounded-tl-none border border-slate-300"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-slate-50/50 border-t border-slate-200">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-white border border-slate-300 rounded-2xl px-4 py-3 text-sm text-slate-950 focus:outline-none focus:border-[#00aeef]/50 transition-all"
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isSending}
                  className="w-12 h-12 bg-[#00aeef] hover:bg-[#0088cc] text-white rounded-2xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Side: Control Panel & Decision Log */}
          <div className="w-[380px] flex flex-col bg-slate-50/30">
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-none">
              {/* Technical Assignment */}
              <section className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Información de Asignación</h4>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                    <UserCog className="w-5 h-5 text-[#00aeef]" />
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Técnico Responsable</p>
                    <p className="text-sm font-black text-slate-900">{card.assignedTechnicianName || 'Pendiente de Asignación'}</p>
                  </div>
                </div>
              </section>

              {/* Decision Log (Replaces generic history) */}
              <section className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registro de Decisiones</h4>
                <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                  {decisionLog.map((h, i) => (
                    <div key={i} className="flex gap-4 relative">
                      <div className={cn(
                        "w-[23px] h-[23px] bg-white border-2 rounded-full flex items-center justify-center z-10",
                        h.step === 'finalizada' ? "border-green-500" :
                        h.step === 'espera' ? "border-amber-500" : "border-[#00aeef]"
                      )}>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          h.step === 'finalizada' ? "bg-green-500" :
                          h.step === 'espera' ? "bg-amber-500" : "bg-[#00aeef]"
                        )} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">
                            {h.step === 'espera' ? 'Puesto en Espera' : 
                             h.step === 'finalizada' ? 'Orden Finalizada' : 
                             h.step === 'reparacion' ? 'Trabajo Reanudado' : h.step}
                          </p>
                          <span className="text-[8px] text-slate-400 font-mono">{formatTimestamp(h.timestamp, 'dd/MM HH:mm')}</span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold mb-1">{h.userName}</p>
                        {h.comment && (
                          <div className="bg-white p-2 rounded-lg border border-slate-200 text-[11px] text-slate-700 italic leading-relaxed">
                            "{h.comment}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {decisionLog.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic pl-8">No hay registros de decisiones aún.</p>
                  )}
                </div>
              </section>

              {/* Action Commentary Box */}
              {canAction && card.currentStep !== 'finalizada' && (
                <section className="space-y-3 pt-4 border-t border-slate-200">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Justificación de Acción</h4>
                  <textarea 
                    value={actionComment}
                    onChange={e => setActionComment(e.target.value)}
                    placeholder="Escribe el motivo del cambio de estado..."
                    className="w-full h-24 bg-white border border-slate-300 rounded-2xl p-3 text-xs text-slate-900 focus:outline-none focus:border-[#00aeef]/50 transition-all resize-none"
                  />
                  
                  <div className="grid grid-cols-2 gap-2">
                    {card.currentStep === 'reparacion' ? (
                      <button 
                        onClick={() => onPausar(actionComment)}
                        disabled={!actionComment.trim()}
                        className="py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all disabled:opacity-20 disabled:grayscale"
                      >
                        A Espera
                      </button>
                    ) : (
                      <button 
                        onClick={() => onReanudar(actionComment)}
                        className="py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all"
                      >
                        Retomar
                      </button>
                    )}
                    
                    <button 
                      onClick={() => setShowFinalizeForm(true)}
                      disabled={card.currentStep === 'espera' || !actionComment.trim()}
                      className="py-3 bg-[#00aeef] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#0088cc] transition-all disabled:opacity-20 disabled:grayscale"
                    >
                      Finalizar
                    </button>
                  </div>
                  {card.currentStep === 'espera' && (
                    <p className="text-[9px] text-amber-600 font-bold text-center">
                      * Retoma el trabajo para poder finalizar la orden
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>

        {/* Finalize Confirmation Overlay */}
        <AnimatePresence>
          {showFinalizeForm && (
            <motion.div 
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 z-50 bg-white/90 backdrop-blur-md p-8 flex flex-col items-center justify-center text-center"
            >
              <div className="max-w-md w-full space-y-8">
                <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mx-auto border border-green-200">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-slate-950 tracking-tight">Confirmar Cierre</h3>
                  <p className="text-slate-600 text-sm">¿Cuál fue el resultado final de la reparación?</p>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Comentario de Cierre</p>
                  <p className="text-sm text-slate-800 italic">"{actionComment}"</p>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => onFinalizar(true, actionComment)}
                    className="flex-1 py-4 bg-green-500 text-white font-black rounded-2xl hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
                  >
                    Reparado
                  </button>
                  <button 
                    onClick={() => onFinalizar(false, actionComment)}
                    className="flex-1 py-4 bg-slate-200 text-slate-700 font-black rounded-2xl hover:bg-slate-300 transition-all"
                  >
                    No Reparado
                  </button>
                </div>
                
                <button 
                  onClick={() => setShowFinalizeForm(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest"
                >
                  Volver al detalle
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

interface AttendanceManagementModalProps {
  onClose: () => void;
  users: UserProfile[];
}

const AttendanceManagementModal = ({ onClose, users }: AttendanceManagementModalProps) => {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');
  const [justified, setJustified] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'attendance'), orderBy('date', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAttendances(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedUser = users.find(u => u.uid === selectedUserId);
    if (!selectedUser) return;

    try {
      await addDoc(collection(db, 'attendance'), {
        userId: selectedUserId,
        userName: selectedUser.displayName || 'Anónimo',
        date,
        reason,
        justified,
        note: note || null,
        createdAt: serverTimestamp()
      });
      setShowForm(false);
      setSelectedUserId('');
      setReason('');
      setJustified(false);
      setNote('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-4xl h-[80vh] rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
              <CalendarCheck className="w-6 h-6 text-[#00aeef]" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Registro de Asistencia</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Control de ingresos y novedades</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancelar' : 'Registrar Novedad'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {showForm ? (
            <div className="p-8 max-w-2xl mx-auto w-full">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Usuario</label>
                    <select 
                      required
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#00aeef]/50 transition-all"
                    >
                      <option value="">Seleccionar Usuario</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</label>
                    <input 
                      type="date" 
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#00aeef]/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Motivo / Novedad</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej: Llegada tarde, Ausencia, Retiro anticipado"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#00aeef]/50 transition-all"
                  />
                </div>

                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={justified}
                      onChange={e => setJustified(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-[#00aeef] focus:ring-0"
                    />
                    <span className="text-sm font-bold text-slate-700">¿Justificado?</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nota Adicional (Opcional)</label>
                  <textarea 
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#00aeef]/50 transition-all resize-none"
                    placeholder="Detalles adicionales..."
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-[#00aeef] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-[#0088cc] transition-all shadow-lg shadow-[#00aeef]/20"
                >
                  Guardar Registro
                </button>
              </form>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {attendances.map(att => (
                    <div key={att.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between hover:border-[#00aeef]/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          att.justified ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                        )}>
                          {att.justified ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-slate-900">{att.userName}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{att.date}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium">{att.reason}</p>
                          {att.note && <p className="text-[10px] text-slate-400 italic mt-1">"{att.note}"</p>}
                        </div>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                        att.justified ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {att.justified ? 'Justificado' : 'No Justificado'}
                      </div>
                    </div>
                  ))}
                  {attendances.length === 0 && (
                    <div className="text-center py-20">
                      <CalendarCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 font-bold">No hay registros de asistencia aún.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface UserActivityModalProps {
  onClose: () => void;
  user: User;
}

const UserActivityModal = ({ onClose, user }: UserActivityModalProps) => {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [orders, setOrders] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      const attQ = query(collection(db, 'attendance'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(20));
      const taskQ = query(collection(db, 'dailyTasks'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(20));
      const orderQ = query(collection(db, 'cards'), where('assignedTechnicianId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));

      const [attSnap, taskSnap, orderSnap] = await Promise.all([
        getDocs(attQ),
        getDocs(taskQ),
        getDocs(orderQ)
      ]);

      setAttendances(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setDailyTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as DailyTask)));
      setOrders(orderSnap.docs.map(d => ({ id: d.id, ...d.data() } as CardType)));
      setLoading(false);
    };

    fetchActivity();
  }, [user.uid]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-4xl h-[80vh] rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
              <Activity className="w-6 h-6 text-[#00aeef]" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Mi Actividad Diaria</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Progreso y registros personales</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-none space-y-10">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
            </div>
          ) : (
            <>
              {/* Daily Tasks Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-[#00aeef]" />
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Tareas de Limpieza y Orden</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dailyTasks.map(task => (
                    <div key={task.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{task.taskType}</p>
                          <p className="text-[9px] text-slate-500 font-bold">{task.date}</p>
                        </div>
                      </div>
                      <span className="text-[8px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded border border-green-100">Completado</span>
                    </div>
                  ))}
                  {dailyTasks.length === 0 && <p className="text-[10px] text-slate-400 italic">No hay tareas registradas recientemente.</p>}
                </div>
              </section>

              {/* Attendance Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-[#00aeef]" />
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Novedades de Asistencia</h4>
                </div>
                <div className="space-y-2">
                  {attendances.map(att => (
                    <div key={att.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          att.justified ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                        )}>
                          {att.justified ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-slate-900">{att.reason}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{att.date}</span>
                          </div>
                          {att.note && <p className="text-[10px] text-slate-400 italic mt-1">"{att.note}"</p>}
                        </div>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                        att.justified ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {att.justified ? 'Justificado' : 'No Justificado'}
                      </div>
                    </div>
                  ))}
                  {attendances.length === 0 && <p className="text-[10px] text-slate-400 italic">No hay novedades de asistencia registradas.</p>}
                </div>
              </section>

              {/* Orders Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Layout className="w-4 h-4 text-[#00aeef]" />
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Órdenes Asignadas Recientes</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {orders.map(order => (
                    <div key={order.id} className="bg-white border border-slate-200 p-4 rounded-2xl hover:border-[#00aeef]/30 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-black text-slate-900">#{order.title}</p>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          order.currentStep === 'finalizada' ? "bg-green-50 text-green-600" :
                          order.currentStep === 'espera' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                        )}>
                          {order.currentStep}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Creada: {formatTimestamp(order.createdAt, 'dd/MM/yyyy')}</p>
                    </div>
                  ))}
                  {orders.length === 0 && <p className="text-[10px] text-slate-400 italic">No tienes órdenes asignadas recientemente.</p>}
                </div>
              </section>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface KPIModalProps {
  onClose: () => void;
  users: UserProfile[];
}

const KPIModal = ({ onClose, users }: KPIModalProps) => {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [orders, setOrders] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      const [attSnap, taskSnap, orderSnap] = await Promise.all([
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'dailyTasks')),
        getDocs(collection(db, 'cards'))
      ]);

      setAttendances(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setDailyTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as DailyTask)));
      setOrders(orderSnap.docs.map(d => ({ id: d.id, ...d.data() } as CardType)));
      setLoading(false);
    };

    fetchAllData();
  }, []);

  const generatePDF = () => {
    const doc = new jsPDF();
    const now = format(new Date(), 'dd/MM/yyyy HH:mm');

    doc.setFontSize(20);
    doc.text('Informe de Actividad - PuntoDamia', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generado el: ${now}`, 14, 30);

    // Attendance Table
    doc.setFontSize(14);
    doc.text('Registro de Asistencias', 14, 45);
    (doc as any).autoTable({
      startY: 50,
      head: [['Usuario', 'Fecha', 'Motivo', 'Justificado', 'Nota']],
      body: attendances.map(a => [
        a.userName,
        a.date,
        a.reason,
        a.justified ? 'SÍ' : 'NO',
        a.note || '-'
      ]),
    });

    // Daily Tasks Table
    const finalY1 = (doc as any).lastAutoTable.finalY || 50;
    doc.text('Tareas Diarias de Limpieza', 14, finalY1 + 15);
    (doc as any).autoTable({
      startY: finalY1 + 20,
      head: [['Usuario', 'Fecha', 'Tarea']],
      body: dailyTasks.map(t => [
        t.userName,
        t.date,
        t.taskType
      ]),
    });

    // Orders Table
    const finalY2 = (doc as any).lastAutoTable.finalY || finalY1 + 20;
    doc.text('Resumen de Órdenes', 14, finalY2 + 15);
    (doc as any).autoTable({
      startY: finalY2 + 20,
      head: [['Nro', 'Técnico', 'Estado', 'Creada', 'Finalizada']],
      body: orders.map(o => [
        o.title,
        o.assignedTechnicianName || '-',
        o.currentStep,
        formatTimestamp(o.createdAt, 'dd/MM/yy'),
        o.finalizedAt ? formatTimestamp(o.finalizedAt, 'dd/MM/yy') : '-'
      ]),
    });

    doc.save(`Informe_PuntoDamia_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
              <BarChart3 className="w-6 h-6 text-[#00aeef]" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">KPIs e Informes de Gestión</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Métricas de rendimiento y actividad global</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={generatePDF}
              className="px-6 py-2.5 bg-[#00aeef] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#0088cc] transition-all flex items-center gap-2 shadow-lg shadow-[#00aeef]/20"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-none">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Stats Overview */}
              <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Órdenes</p>
                  <p className="text-3xl font-black text-slate-950">{orders.length}</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Finalizadas</p>
                  <p className="text-3xl font-black text-green-600">{orders.filter(o => o.currentStep === 'finalizada').length}</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Asistencias</p>
                  <p className="text-3xl font-black text-[#00aeef]">{attendances.length}</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tareas Limpieza</p>
                  <p className="text-3xl font-black text-amber-600">{dailyTasks.length}</p>
                </div>
              </div>

              {/* Detailed Lists */}
              <div className="lg:col-span-2 space-y-8">
                <section className="space-y-4">
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-[#00aeef]" />
                    Últimas Asistencias
                  </h4>
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-widest">Usuario</th>
                          <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                          <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-widest">Motivo</th>
                          <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-widest">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {attendances.slice(0, 10).map(att => (
                          <tr key={att.id}>
                            <td className="px-4 py-3 font-bold text-slate-900">{att.userName}</td>
                            <td className="px-4 py-3 text-slate-500 font-mono">{att.date}</td>
                            <td className="px-4 py-3 text-slate-600">{att.reason}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                att.justified ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                              )}>
                                {att.justified ? 'Justificado' : 'No Justificado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-4">
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#00aeef]" />
                    Tareas Diarias Realizadas
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dailyTasks.slice(0, 10).map(task => (
                      <div key={task.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{task.taskType}</p>
                          <p className="text-[9px] text-slate-500 font-bold">{task.userName} • {task.date}</p>
                        </div>
                        <Check className="w-3 h-3 text-green-500" />
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* User Performance Ranking */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00aeef]" />
                  Actividad por Usuario
                </h4>
                <div className="space-y-3">
                  {users.map(u => {
                    const userOrders = orders.filter(o => o.assignedTechnicianId === u.uid).length;
                    const userTasks = dailyTasks.filter(t => t.userId === u.uid).length;
                    const userAtt = attendances.filter(a => a.userId === u.uid).length;
                    
                    return (
                      <div key={u.uid} className="bg-white border border-slate-200 p-4 rounded-2xl">
                        <div className="flex items-center gap-3 mb-3">
                          <img src={u.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-200" alt="" />
                          <div>
                            <p className="text-xs font-black text-slate-900 leading-none">{u.displayName}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">{u.role}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2 bg-slate-50 rounded-xl">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Órdenes</p>
                            <p className="text-sm font-black text-slate-900">{userOrders}</p>
                          </div>
                          <div className="text-center p-2 bg-slate-50 rounded-xl">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tareas</p>
                            <p className="text-sm font-black text-slate-900">{userTasks}</p>
                          </div>
                          <div className="text-center p-2 bg-slate-50 rounded-xl">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Asist.</p>
                            <p className="text-sm font-black text-slate-900">{userAtt}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface IncidentsManagementModalProps {
  onClose: () => void;
  users: UserProfile[];
  user: User;
}

const IncidentsManagementModal = ({ onClose, users, user }: IncidentsManagementModalProps) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [type, setType] = useState<'garantia' | 'recepcion' | 'taller'>('taller');
  const [orderNumber, setOrderNumber] = useState('');
  const [referenceOrderNumber, setReferenceOrderNumber] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [repairTechnicianId, setRepairTechnicianId] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'abierta' | 'en_revision' | 'resuelta'>('abierta');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Incident)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tech = users.find(u => u.uid === technicianId);
    const repairTech = users.find(u => u.uid === repairTechnicianId);
    
    const incidentData = {
      type,
      orderNumber,
      referenceOrderNumber: referenceOrderNumber || null,
      reportedBy: user.uid,
      reportedByName: user.displayName || 'Admin',
      technicianId: technicianId || null,
      technicianName: tech?.displayName || null,
      repairTechnicianId: repairTechnicianId || null,
      repairTechnicianName: repairTech?.displayName || null,
      description,
      status,
      createdAt: serverTimestamp()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'incidents', editingId), {
          ...incidentData,
          createdAt: incidents.find(i => i.id === editingId)?.createdAt // Keep original timestamp
        });
      } else {
        await addDoc(collection(db, 'incidents'), incidentData);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'incidents');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setOrderNumber('');
    setReferenceOrderNumber('');
    setTechnicianId('');
    setRepairTechnicianId('');
    setDescription('');
    setStatus('abierta');
    setType('taller');
  };

  const handleEdit = (incident: Incident) => {
    setEditingId(incident.id);
    setType(incident.type);
    setOrderNumber(incident.orderNumber);
    setReferenceOrderNumber(incident.referenceOrderNumber || '');
    setTechnicianId(incident.technicianId || '');
    setRepairTechnicianId(incident.repairTechnicianId || '');
    setDescription(incident.description);
    setStatus(incident.status);
    setShowForm(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-5xl h-[85vh] rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Gestión de Incidencias</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Panel de Control Administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              {showForm ? 'Ver Listado' : 'Nueva Incidencia'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {showForm ? (
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Incidencia</label>
                  <select 
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="recepcion">Incidencia en Recepción</option>
                    <option value="taller">Incidencia en Taller</option>
                    <option value="garantia">Incidencia por Garantía</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado</label>
                  <select 
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="abierta">Abierta</option>
                    <option value="en_revision">En Revisión</option>
                    <option value="resuelta">Resuelta</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nro de Orden (Actual)</label>
                  <input 
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="Ej: 12345"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Referencia (Garantías)</label>
                  <input 
                    type="text"
                    value={referenceOrderNumber}
                    onChange={e => setReferenceOrderNumber(e.target.value)}
                    placeholder="Nro de orden original"
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Técnico Original (Referido)</label>
                  <select 
                    value={technicianId}
                    onChange={e => setTechnicianId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="">Seleccionar técnico...</option>
                    {users.filter(u => u.role === 'tecnico' || u.role === 'admin').map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Técnico que Reparó (Solución)</label>
                  <select 
                    value={repairTechnicianId}
                    onChange={e => setRepairTechnicianId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="">Seleccionar técnico...</option>
                    {users.filter(u => u.role === 'tecnico' || u.role === 'admin').map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Comentario / Detalles</label>
                <textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detalles sobre el suceso y cómo se resolvió..."
                  required
                  className="w-full h-32 bg-slate-50 border border-slate-300 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#00aeef]/50"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-[#00aeef] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-[#0088cc] transition-all shadow-lg shadow-[#00aeef]/20"
                >
                  {editingId ? 'Actualizar Registro' : 'Guardar Incidencia'}
                </button>
                <button 
                  type="button"
                  onClick={resetForm}
                  className="px-8 py-4 bg-slate-100 text-slate-600 font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
                </div>
              ) : incidents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <AlertCircle className="w-12 h-12 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">No hay incidencias registradas</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {incidents.map((incident) => (
                    <div 
                      key={incident.id} 
                      className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-[#00aeef]/30 transition-all group relative"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            incident.type === 'garantia' ? "bg-red-50 border-red-100 text-red-600" :
                            incident.type === 'recepcion' ? "bg-orange-50 border-orange-100 text-orange-600" :
                            "bg-blue-50 border-blue-100 text-blue-600"
                          )}>
                            {incident.type}
                          </span>
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            incident.status === 'resuelta' ? "bg-green-50 border-green-100 text-green-600" :
                            incident.status === 'en_revision' ? "bg-yellow-50 border-yellow-100 text-yellow-600" :
                            "bg-slate-50 border-slate-100 text-slate-600"
                          )}>
                            {incident.status}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{formatTimestamp(incident.createdAt, 'dd/MM/yy HH:mm')}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                        <div>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Orden / Ref</p>
                          <p className="text-sm font-black text-slate-900">#{incident.orderNumber} {incident.referenceOrderNumber && <span className="text-slate-400 text-xs ml-1">/ Ref: #{incident.referenceOrderNumber}</span>}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Técnico Original</p>
                          <p className="text-sm font-black text-slate-900">{incident.technicianName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Reparado por</p>
                          <p className="text-sm font-black text-slate-900">{incident.repairTechnicianName || '-'}</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                        <p className="text-xs text-slate-700 leading-relaxed italic">"{incident.description}"</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Registrado por: {incident.reportedByName}</p>
                        <button 
                          onClick={() => handleEdit(incident)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          Editar / Completar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface ResetSystemModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const ResetSystemModal = ({ onClose, onConfirm }: ResetSystemModalProps) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const REQUIRED_TEXT = "BORRAR TODO";

  const handleConfirm = async () => {
    if (confirmText !== REQUIRED_TEXT || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Error resetting system:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-md rounded-3xl border border-red-100 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-950 tracking-tight">¿Estás absolutamente seguro?</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              Esta acción eliminará <span className="text-red-500 font-bold">TODAS</span> las órdenes de trabajo, chats y notificaciones. Los usuarios y columnas se mantendrán.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Escribe "{REQUIRED_TEXT}" para confirmar</p>
              <input 
                type="text" 
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Confirmación requerida"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-center text-slate-950 font-bold tracking-widest focus:outline-none focus:border-red-500/50 transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirm}
                disabled={confirmText !== REQUIRED_TEXT || isDeleting}
                className="flex-1 px-6 py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-all disabled:opacity-20 disabled:grayscale flex items-center justify-center gap-2"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Borrar Todo
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

interface UserManagementModalProps {
  onClose: () => void;
  users: UserProfile[];
}

const UserManagementModal = ({ onClose, users }: UserManagementModalProps) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleUpdateRole = async (userId: string, newRole: UserProfile['role']) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleResetSystem = async () => {
    try {
      // 1. Delete all userReadStatus
      const readStatusSnap = await getDocs(collection(db, 'userReadStatus'));
      for (const d of readStatusSnap.docs) {
        await deleteDoc(doc(db, 'userReadStatus', d.id));
      }

      // 2. Delete all cards and their messages
      const cardsSnap = await getDocs(collection(db, 'cards'));
      for (const cardDoc of cardsSnap.docs) {
        // Delete messages subcollection
        const messagesSnap = await getDocs(collection(db, 'cards', cardDoc.id, 'messages'));
        for (const msgDoc of messagesSnap.docs) {
          await deleteDoc(doc(db, 'cards', cardDoc.id, 'messages', msgDoc.id));
        }
        // Delete the card itself
        await deleteDoc(doc(db, 'cards', cardDoc.id));
      }
      
      console.log("System Reset Successful");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'system-reset');
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white w-full max-w-2xl h-[700px] rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
                <Users className="w-5 h-5 text-[#00aeef]" />
              </div>
              <div>
                <h3 className="font-bold text-slate-950 tracking-tight">Gestión de Usuarios</h3>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Panel de Administración</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-none">
            <div className="space-y-3">
              <h4 className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-black px-2">Usuarios Registrados</h4>
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.uid} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-all">
                    <div className="flex items-center gap-4">
                      <img src={u.photoURL || ''} className="w-10 h-10 rounded-xl border border-slate-300 bg-white" alt="" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-950">{u.displayName || 'Sin nombre'}</h4>
                        <p className="text-[10px] text-slate-600 font-mono">{u.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <select 
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.uid, e.target.value as UserProfile['role'])}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#00aeef]/50 transition-all cursor-pointer"
                      >
                        <option value="admin">Administrador</option>
                        <option value="recepcion">Recepción</option>
                        <option value="tecnico">Técnico</option>
                      </select>
                      
                      <div className={cn(
                        "p-2 rounded-xl border",
                        u.role === 'admin' ? "bg-red-50 border-red-100 text-red-500" :
                        u.role === 'recepcion' ? "bg-green-50 border-green-100 text-green-500" :
                        "bg-blue-50 border-blue-100 text-blue-500"
                      )}>
                        {u.role === 'admin' ? <Shield className="w-4 h-4" /> : 
                         u.role === 'recepcion' ? <UserCheck className="w-4 h-4" /> : 
                         <UserCog className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-8 border-t border-slate-200 space-y-4">
              <div className="px-2">
                <h4 className="text-[10px] text-red-500 uppercase tracking-[0.2em] font-black">Zona de Peligro</h4>
                <p className="text-[10px] text-slate-600 mt-1">Acciones irreversibles que afectan a todo el sistema.</p>
              </div>
              
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center justify-between p-5 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center border border-red-200 group-hover:scale-110 transition-transform">
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="text-left">
                    <h5 className="text-sm font-bold text-red-600">Resetear Todo el Sistema</h5>
                    <p className="text-[10px] text-red-400 font-medium">Borra órdenes, chats y notificaciones</p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-red-100 rounded-lg text-[9px] font-black text-red-600 uppercase tracking-widest border border-red-200">
                  Ejecutar
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showResetConfirm && (
          <ResetSystemModal 
            onClose={() => setShowResetConfirm(false)}
            onConfirm={handleResetSystem}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<ColumnType[]>([]);
  const [cards, setCards] = useState<CardType[]>([]);
  const [activeChat, setActiveChat] = useState<CardType | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardTags, setNewCardTags] = useState<string[]>([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showIncidentsManagement, setShowIncidentsManagement] = useState(false);
  const [showAttendanceManagement, setShowAttendanceManagement] = useState(false);
  const [showKPIs, setShowKPIs] = useState(false);
  const [showUserActivity, setShowUserActivity] = useState(false);
  const [dailyTaskDone, setDailyTaskDone] = useState(false);
  const [showDailyTaskMessage, setShowDailyTaskMessage] = useState(false);
  const [dailyTaskType, setDailyTaskType] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const q = query(
      collection(db, 'dailyTasks'),
      where('userId', '==', user.uid),
      where('date', '==', today)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setDailyTaskDone(true);
        setDailyTaskType(snapshot.docs[0].data().taskType);
      } else {
        setDailyTaskDone(false);
        setDailyTaskType(null);
      }
    });
    return () => unsubscribe();
  }, [user]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTechId, setFilterTechId] = useState<string>('all');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const saveUser = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        let userDoc;
        try {
          userDoc = await getDoc(userRef);
        } catch (error) {
          console.error('Error fetching user doc:', error);
          const errInfo = {
            error: error instanceof Error ? error.message : String(error),
            operation: 'get',
            path: `users/${user.uid}`,
            auth: { uid: user.uid, email: user.email }
          };
          throw new Error(JSON.stringify(errInfo));
        }
        
        if (!userDoc.exists()) {
          // First user or specific email becomes admin
          const isAdminEmail = user.email === 'ramonpuntodamia@gmail.com';
          const newProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
            role: isAdminEmail ? 'admin' : 'recepcion'
          };
          try {
            await setDoc(userRef, newProfile);
          } catch (error) {
            console.error('Error creating user doc:', error);
            const errInfo = {
              error: error instanceof Error ? error.message : String(error),
              operation: 'create',
              path: `users/${user.uid}`,
              data: newProfile,
              auth: { uid: user.uid, email: user.email }
            };
            throw new Error(JSON.stringify(errInfo));
          }
          setUserProfile(newProfile);
        } else {
          // Update profile but keep role
          const existingData = userDoc.data() as UserProfile;
          const isAdminEmail = user.email === 'ramonpuntodamia@gmail.com';
          
          const updatedProfile: UserProfile = {
            ...existingData,
            uid: user.uid,
            email: user.email || existingData.email || '',
            displayName: user.displayName || existingData.displayName || '',
            photoURL: user.photoURL || existingData.photoURL || '',
            // Ensure role exists, default to admin for owner or recepcion for others
            role: existingData.role || (isAdminEmail ? 'admin' : 'recepcion')
          };
          
          try {
            await setDoc(userRef, updatedProfile, { merge: true });
          } catch (error) {
            console.error('Error updating user doc:', error);
            const errInfo = {
              error: error instanceof Error ? error.message : String(error),
              operation: 'update',
              path: `users/${user.uid}`,
              data: updatedProfile,
              auth: { uid: user.uid, email: user.email }
            };
            throw new Error(JSON.stringify(errInfo));
          }
          setUserProfile(updatedProfile);
        }
      } catch (error) {
        console.error('Error saving user:', error);
      }
    };
    saveUser();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Test connection
    const testConnection = async () => {
      try {
        await getDocs(query(collection(db, 'boards'), limit(1)));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    // Fetch Columns
    const qCols = query(collection(db, 'columns'), orderBy('order', 'asc'));
    const unsubCols = onSnapshot(qCols, (snapshot) => {
      const cols = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ColumnType));
      setColumns(cols);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'columns');
    });

    // Initial check to create columns if empty
    createDefaultColumns();

    // Fetch Cards
    const qCards = query(collection(db, 'cards'), orderBy('order', 'asc'));
    const unsubCards = onSnapshot(qCards, (snapshot) => {
      const crds = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CardType));
      setCards(crds);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cards');
    });

    // Fetch Users (for filters and assignment)
    const qUsers = query(collection(db, 'users'), orderBy('displayName', 'asc'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const uList = snapshot.docs.map(d => d.data() as UserProfile);
      setUsers(uList);
    });

    return () => {
      unsubCols();
      unsubCards();
      unsubUsers();
    };
  }, [user]);

  const createDefaultColumns = async () => {
    // Check if columns already exist to prevent duplicates
    const q = query(collection(db, 'columns'));
    const snapshot = await getDocs(q);
    if (snapshot.docs.length > 0) return;

    const defaults = [
      'Orden en Recepción',
      'Orden En Taller',
      'Orden En Reparación',
      'Orden En Espera',
      'Orden Finalizada'
    ];
    for (let i = 0; i < defaults.length; i++) {
      await addDoc(collection(db, 'columns'), {
        name: defaults[i],
        order: i,
        boardId: 'default'
      });
    }
  };

  const handleCreateCard = async () => {
    if (!newCardTitle.trim()) return;
    
    // Duplicate check
    const isDuplicate = cards.some(c => c.title.toLowerCase() === newCardTitle.trim().toLowerCase());
    if (isDuplicate && !duplicateWarning) {
      setDuplicateWarning(true);
      return;
    }

    const receptionCol = columns.find(c => c.name === 'Orden en Recepción') || columns[0];
    if (!receptionCol) return;

    try {
      const cardRef = await addDoc(collection(db, 'cards'), {
        columnId: receptionCol.id,
        boardId: 'default',
        title: newCardTitle.trim(),
        description: '',
        order: cards.filter(c => c.columnId === receptionCol.id).length,
        lastMessageAt: null,
        tags: newCardTags,
        assignedTechnicianId: null,
        assignedTechnicianName: null,
        createdAt: serverTimestamp(),
        currentStep: 'recepcion',
        history: [{
          step: 'recepcion',
          timestamp: new Date(),
          userId: user.uid,
          userName: user.displayName || 'Anónimo'
        }]
      });

      // Auto-create incident if GARANTIA tag is present
      if (newCardTags.includes('GARANTIA')) {
        await addDoc(collection(db, 'incidents'), {
          type: 'garantia',
          orderNumber: newCardTitle.trim(),
          reportedBy: user.uid,
          reportedByName: user.displayName || 'Anónimo',
          status: 'abierta',
          createdAt: serverTimestamp(),
          description: 'Orden ingresada como GARANTÍA. Pendiente de revisión por administrador.'
        });
      }

      setNewCardTitle('');
      setNewCardTags([]);
      setDuplicateWarning(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cards');
    }
  };

  const handleRecibir = async (card: CardType) => {
    const tallerCol = columns.find(c => c.name === 'Orden En Taller');
    if (!tallerCol) return;

    try {
      await updateDoc(doc(db, 'cards', card.id), {
        columnId: tallerCol.id,
        currentStep: 'taller',
        history: [...(card.history || []), {
          step: 'taller',
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo'
        }]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.id}`);
    }
  };

  const handleAsignarTecnico = async (card: CardType, techId: string, techName: string) => {
    const reparacionCol = columns.find(c => c.name === 'Orden En Reparación');
    if (!reparacionCol) return;

    try {
      await updateDoc(doc(db, 'cards', card.id), {
        columnId: reparacionCol.id,
        assignedTechnicianId: techId,
        assignedTechnicianName: techName,
        currentStep: 'reparacion',
        history: [...(card.history || []), {
          step: 'reparacion',
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo'
        }]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.id}`);
    }
  };

  const handlePausar = async (card: CardType, comment: string) => {
    const esperaCol = columns.find(c => c.name === 'Orden En Espera');
    if (!esperaCol) return;

    try {
      await updateDoc(doc(db, 'cards', card.id), {
        columnId: esperaCol.id,
        currentStep: 'espera',
        returnToStep: 'reparacion',
        history: [...(card.history || []), {
          step: 'espera',
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo',
          comment
        }]
      });
      if (activeChat?.id === card.id) setActiveChat(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.id}`);
    }
  };

  const handleReanudar = async (card: CardType, comment: string) => {
    const reparacionCol = columns.find(c => c.name === 'Orden En Reparación');
    if (!reparacionCol) return;

    try {
      await updateDoc(doc(db, 'cards', card.id), {
        columnId: reparacionCol.id,
        currentStep: 'reparacion',
        history: [...(card.history || []), {
          step: 'reparacion',
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo',
          comment: comment || 'Trabajo reanudado'
        }]
      });
      if (activeChat?.id === card.id) setActiveChat(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.id}`);
    }
  };

  const handleFinalizar = async (card: CardType, isRepaired: boolean, comment: string) => {
    const finalizadaCol = columns.find(c => c.name === 'Orden Finalizada');
    if (!finalizadaCol) return;

    try {
      await updateDoc(doc(db, 'cards', card.id), {
        columnId: finalizadaCol.id,
        currentStep: 'finalizada',
        isRepaired,
        closingComment: comment,
        finalizedAt: serverTimestamp(),
        history: [...(card.history || []), {
          step: 'finalizada',
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo',
          comment
        }]
      });
      setActiveChat(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.id}`);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0b0d] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 font-mono text-xs uppercase tracking-widest">Initializing System</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-10"
        >
          {/* Logo Punto Damia */}
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-[#00aeef] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(0,174,239,0.3)]">
              <div className="w-14 h-14 border-[6px] border-white rounded-full flex items-center justify-center">
                <div className="w-5 h-5 bg-white rounded-full ml-2"></div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-5xl font-black text-slate-950 tracking-tighter">PuntoDamia</h1>
            <p className="text-[#00aeef] text-xs font-bold uppercase tracking-[0.4em] opacity-80">Gestión de Órdenes de Trabajo</p>
            <p className="text-slate-700 text-sm max-w-[280px] mx-auto leading-relaxed">
              Plataforma colaborativa para el seguimiento técnico y comunicación en tiempo real.
            </p>
          </div>

          <div className="pt-4">
            <button 
              onClick={handleLogin}
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-xl"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
              Iniciar sesión con Google
            </button>
          </div>

          <div className="pt-8 flex flex-col items-center gap-2">
            <div className="h-px w-12 bg-slate-100"></div>
            <p className="text-[9px] text-slate-500 uppercase tracking-[0.3em] font-bold">Autenticación segura vía Firebase</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-slate-300 px-6 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#00aeef] rounded-full flex items-center justify-center shadow-lg shadow-[#00aeef]/20">
            <div className="w-6 h-6 border-4 border-white rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full ml-1"></div>
            </div>
          </div>
          <div className="flex flex-col">
            <h1 className="font-bold text-xl tracking-tight text-slate-950 leading-none">PuntoDamia</h1>
            <span className="text-[10px] text-[#00aeef] font-bold uppercase tracking-widest mt-1">ST PuntoDamia</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-200">
            <img src={user.photoURL || ''} className="w-6 h-6 rounded-full border border-slate-300" alt="" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-950 leading-none">{user.displayName}</span>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest mt-0.5",
                userProfile?.role === 'admin' ? "text-red-500" :
                userProfile?.role === 'recepcion' ? "text-green-500" :
                "text-blue-500"
              )}>
                {userProfile?.role === 'admin' ? 'Administrador' :
                 userProfile?.role === 'recepcion' ? 'Recepción' :
                 'Técnico'}
              </span>
            </div>
          </div>
          
          {/* Daily Task Indicator */}
          <div className="relative">
            <button 
              onClick={() => !dailyTaskDone && setShowDailyTaskMessage(true)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border",
                dailyTaskDone 
                  ? "bg-green-50 border-green-200 text-green-600 cursor-default" 
                  : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
              )}
            >
              <ClipboardList className="w-3 h-3" />
              {dailyTaskDone ? `Tarea: ${dailyTaskType}` : 'Tarea Diaria'}
            </button>
            
            <AnimatePresence>
              {showDailyTaskMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-50"
                >
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Seleccionar Tarea</h5>
                  <div className="grid grid-cols-1 gap-1">
                    {['BASURA', 'TRAPO TALLER', 'TRAPO COMEDOR', 'ESCOBA TALLER', 'ESCOBA COMEDOR', 'MICROONDAS', 'ESCALERA'].map(task => (
                      <button
                        key={task}
                        onClick={async () => {
                          try {
                            await addDoc(collection(db, 'dailyTasks'), {
                              userId: user.uid,
                              userName: user.displayName || 'Anónimo',
                              date: format(new Date(), 'yyyy-MM-dd'),
                              taskType: task,
                              createdAt: serverTimestamp()
                            });
                            setShowDailyTaskMessage(false);
                            // Show thank you message for 3 seconds
                            const toast = document.createElement('div');
                            toast.className = "fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-bold z-[100] shadow-2xl border border-white/10 text-center";
                            toast.innerHTML = "¡Gracias por colaborar!<br/><span class='text-[10px] opacity-70'>Recuerda mantener el orden y la limpieza de tu área de trabajo.</span>";
                            document.body.appendChild(toast);
                            setTimeout(() => toast.remove(), 3000);
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="text-left px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors uppercase tracking-tight"
                      >
                        {task}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Activity Button */}
          <button 
            onClick={() => setShowUserActivity(true)}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors relative group"
            title="Mi Actividad"
          >
            <Activity className="w-5 h-5" />
          </button>

          {userProfile?.role === 'admin' && (
            <>
              <button 
                onClick={() => setShowAttendanceManagement(true)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors relative group"
                title="Asistencias"
              >
                <CalendarCheck className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowKPIs(true)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors relative group"
                title="KPIs"
              >
                <BarChart3 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowIncidentsManagement(true)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors relative group"
                title="Incidencias"
              >
                <AlertTriangle className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowUserManagement(true)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors relative group"
                title="Usuarios"
              >
                <Users className="w-5 h-5" />
              </button>
            </>
          )}

          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Top Control Panel */}
      <div className="bg-white border-b border-slate-300 p-4 sticky top-16 z-30 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto">
          {/* Single Row: Filter, Search and Create */}
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            {/* Filter Row */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2 text-[10px] text-slate-600 font-black uppercase tracking-widest whitespace-nowrap">
                <Filter className="w-3 h-3" />
                <span>Técnico:</span>
              </div>
              <select 
                value={filterTechId}
                onChange={e => setFilterTechId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-[11px] text-slate-800 focus:outline-none focus:border-[#00aeef]/50 transition-all cursor-pointer min-w-[160px]"
              >
                <option value="all">Todos</option>
                {users.filter(u => u.role === 'tecnico' || u.role === 'admin').map(u => (
                  <option key={u.uid} value={u.uid}>{u.displayName}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar orden..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-950 focus:outline-none focus:border-[#00aeef]/50 transition-all placeholder:text-slate-500"
              />
            </div>

            {/* Create Order Section */}
            <div className="flex flex-[1.5] w-full gap-3 items-center bg-slate-50 p-1 rounded-2xl border border-slate-300">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={newCardTitle}
                  onChange={e => {
                    setNewCardTitle(e.target.value);
                    setDuplicateWarning(false);
                  }}
                  placeholder="N° de Orden"
                  className={cn(
                    "w-full bg-transparent border-none px-4 py-2 text-sm text-slate-950 focus:outline-none placeholder:text-slate-500",
                    duplicateWarning && "text-yellow-600"
                  )}
                  onKeyDown={e => e.key === 'Enter' && handleCreateCard()}
                />
                {duplicateWarning && (
                  <span className="absolute -bottom-4 left-4 text-[8px] text-yellow-600 font-bold uppercase tracking-tighter">Ya existe. Pulsa de nuevo.</span>
                )}
              </div>

              {/* Tag Checkboxes */}
              <div className="flex items-center gap-4 px-4 border-l border-slate-300">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={newCardTags.includes('GARANTIA')}
                    onChange={() => setNewCardTags(prev => prev.includes('GARANTIA') ? prev.filter(t => t !== 'GARANTIA') : [...prev, 'GARANTIA'])}
                    className="w-3.5 h-3.5 rounded border-slate-300 bg-white text-[#00aeef] focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[9px] font-black text-slate-600 group-hover:text-slate-800 transition-colors uppercase tracking-widest">Garantía</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={newCardTags.includes('URGENTE')}
                    onChange={() => setNewCardTags(prev => prev.includes('URGENTE') ? prev.filter(t => t !== 'URGENTE') : [...prev, 'URGENTE'])}
                    className="w-3.5 h-3.5 rounded border-slate-300 bg-white text-red-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[9px] font-black text-slate-600 group-hover:text-slate-800 transition-colors uppercase tracking-widest">Urgente</span>
                </label>
              </div>

              <button 
                onClick={handleCreateCard}
                disabled={!newCardTitle.trim()}
                className="bg-[#00aeef] hover:bg-[#0088cc] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-20 shadow-lg shadow-[#00aeef]/10"
              >
                Crear Orden
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-x-auto p-6 flex gap-4 items-start scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {columns.map(col => {
          const filteredCards = cards.filter(c => {
            const matchesColumn = c.columnId === col.id;
            const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesTech = filterTechId === 'all' || c.assignedTechnicianId === filterTechId;
            return matchesColumn && matchesSearch && matchesTech;
          });

          return (
            <Column 
              key={col.id} 
              column={col} 
              cards={filteredCards}
              user={user}
              userProfile={userProfile}
              onOpenDetail={(card) => setActiveChat(card)}
              onRecibir={handleRecibir}
              onAsignar={handleAsignarTecnico}
              technicians={users.filter(u => u.role === 'tecnico')}
            />
          );
        })}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {activeChat && (
          <CardDetailModal 
            card={activeChat} 
            user={user} 
            userProfile={userProfile}
            onClose={() => setActiveChat(null)}
            onPausar={(comment) => handlePausar(activeChat, comment)}
            onReanudar={(comment) => handleReanudar(activeChat, comment)}
            onFinalizar={(isRepaired, comment) => handleFinalizar(activeChat, isRepaired, comment)}
          />
        )}
        {showUserManagement && (
          <UserManagementModal 
            onClose={() => setShowUserManagement(false)} 
            users={users}
          />
        )}
        {showIncidentsManagement && (
          <IncidentsManagementModal 
            onClose={() => setShowIncidentsManagement(false)}
            users={users}
            user={user}
          />
        )}
        {showAttendanceManagement && (
          <AttendanceManagementModal 
            onClose={() => setShowAttendanceManagement(false)}
            users={users}
          />
        )}
        {showUserActivity && (
          <UserActivityModal 
            onClose={() => setShowUserActivity(false)}
            user={user}
          />
        )}
        {showKPIs && (
          <KPIModal 
            onClose={() => setShowKPIs(false)}
            users={users}
          />
        )}
      </AnimatePresence>

      {/* Error Boundary Placeholder */}
      <div id="error-boundary-portal" />
    </div>
  );
}
