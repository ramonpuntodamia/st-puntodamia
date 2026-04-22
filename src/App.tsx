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
  getDocsFromServer,
  getDoc,
  deleteDoc,
  deleteField,
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
  InvolvedUser,
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
  ShieldCheck,
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
  Download,
  Repeat,
  FileText,
  Target,
  LineChart as LineChartIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// --- Error Handling ---
enum OperationType {
  GET = 'get',
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
  const [status, setStatus] = useState<'normal' | 'urgent' | 'critical'>('normal');

  useEffect(() => {
    if (!createdAt) return;
    if (finalizedAt) {
      setTimeLeft('DETENIDO');
      setStatus('normal');
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const start = createdAt.toDate().getTime();
      const deadline = start + (24 * 60 * 60 * 1000);
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setStatus('critical');
        clearInterval(timer);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
      
      if (hours < 2) {
        setStatus('critical');
      } else if (hours < 4) {
        setStatus('urgent');
      } else {
        setStatus('normal');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [createdAt, finalizedAt]);

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-mono text-[9px] font-black tracking-tighter transition-colors",
      finalizedAt ? "bg-slate-100 border-slate-200 text-slate-400" :
      status === 'critical' ? "bg-red-600 border-red-700 text-white" :
      status === 'urgent' ? "bg-amber-50 border-amber-200 text-amber-600" : 
      "bg-blue-50 border-blue-200 text-[#00aeef]"
    )}>
      {status === 'critical' ? <AlertTriangle className="w-2.5 h-2.5 animate-pulse" /> : <RefreshCw className="w-2.5 h-2.5" />}
      <span>{timeLeft}</span>
      {status === 'critical' && <span className="ml-0.5 animate-pulse">!</span>}
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
  const [showAssign, setShowAssign] = useState(false);

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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `userReadStatus/${statusId}`);
    });

    return () => unsubscribe();
  }, [card.id, card.lastMessageAt, user.uid]);

  const isRecepcion = card.currentStep === 'recepcion';
  const isTaller = card.currentStep === 'taller';
  const isFinalizada = card.currentStep === 'finalizada';

  const [isCritical, setIsCritical] = useState(false);

  useEffect(() => {
    if (isFinalizada) {
      setIsCritical(false);
      return;
    }

    const checkCritical = () => {
      if (!card.createdAt) return;
      const now = Date.now();
      const start = card.createdAt.toDate().getTime();
      const deadline = start + (24 * 60 * 60 * 1000);
      const diff = deadline - now;
      const critical = diff > 0 && diff <= 2 * 60 * 60 * 1000;
      if (critical !== isCritical) setIsCritical(critical);
    };

    checkCritical();
    const timer = setInterval(checkCritical, 30000); // Check every 30s
    return () => clearInterval(timer);
  }, [card.createdAt, isFinalizada, isCritical]);

  return (
    <div 
      className={cn(
        "bg-white p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden",
        isCritical ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)] ring-1 ring-red-500" : "border-slate-300 shadow-sm hover:border-[#00aeef]/50",
        isFinalizada && "opacity-75 grayscale-[0.5]"
      )}
      onClick={onOpenDetail}
    >
      {/* Row 1: Title & Chat */}
      <div className="flex justify-between items-start mb-1">
        <h4 className="text-sm font-black text-slate-950 tracking-tight leading-tight truncate pr-2">
          {card.title}
        </h4>
        {(hasUnread || isTaller || card.currentStep === 'reparacion' || card.currentStep === 'espera' || isFinalizada) && (
          <div className="relative flex-shrink-0">
            <MessageSquare className={cn("w-3.5 h-3.5", hasUnread ? "text-[#00aeef]" : "text-slate-300")} />
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5 rounded-full bg-[#00aeef]" />
            )}
          </div>
        )}
      </div>

      {/* Row 2: Date & Tags */}
      <div className="flex justify-between items-center mb-3">
        <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
          {isFinalizada ? formatTimestamp(card.finalizedAt, 'dd/MM/yy') : formatTimestamp(card.createdAt, 'dd/MM/yy')}
        </p>
        <div className="flex flex-wrap gap-1 justify-end">
          {card.tags?.map(tag => (
            <span 
              key={tag} 
              className={cn(
                "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border",
                tag === 'URGENTE' ? "bg-red-50 border-red-100 text-red-600" : 
                tag === 'GARANTIA' ? "bg-orange-50 border-orange-100 text-orange-600" :
                "bg-slate-50 border-slate-100 text-slate-600"
              )}
            >
              {tag}
            </span>
          ))}
          {isFinalizada && (
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border",
              card.isRepaired ? "bg-green-50 border-green-100 text-green-600" : "bg-red-50 border-red-100 text-red-600"
            )}>
              {card.isRepaired ? 'OK' : 'NO'}
            </span>
          )}
        </div>
      </div>
      
      {/* State Specific Info */}
      <div className="space-y-2">
        {!isFinalizada && (
          <Countdown createdAt={card.createdAt} finalizedAt={card.finalizedAt} />
        )}

        {isFinalizada && card.closingComment && (
          <p className="text-[9px] text-slate-500 italic truncate bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
            "{card.closingComment}"
          </p>
        )}

        {/* Technician Info (Not in Recepcion) */}
        {!isRecepcion && card.assignedTechnicianName && (
          <div className="group relative">
            {!showAssign ? (
              <div className="flex items-center justify-between gap-1.5 px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-1.5 truncate">
                  <UserCog className="w-2.5 h-2.5 text-[#00aeef]/50" />
                  <span className="text-[9px] text-slate-600 font-bold truncate">{card.assignedTechnicianName}</span>
                </div>
                {(userProfile?.role === 'admin' || userProfile?.role === 'tecnico') && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowAssign(true); }}
                    className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                    title="Cambiar Técnico"
                  >
                    <Repeat className="w-2.5 h-2.5 text-slate-400" />
                  </button>
                )}
              </div>
            ) : (
              <select 
                autoFocus
                className="w-full py-1 bg-white border border-[#00aeef]/30 rounded-lg text-[9px] font-bold text-slate-700 focus:outline-none"
                onChange={(e) => {
                  const tech = technicians.find(t => t.uid === e.target.value);
                  if (tech) onAsignar(tech.uid, tech.displayName || 'Técnico');
                  setShowAssign(false);
                }}
                onBlur={() => setShowAssign(false)}
                defaultValue={card.assignedTechnicianId || ""}
                onClick={e => e.stopPropagation()}
              >
                <option value="" disabled>Cambiar Técnico</option>
                {technicians.map(t => (
                  <option key={t.uid} value={t.uid}>{t.displayName}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Actions */}
        {isRecepcion && (userProfile?.role === 'recepcion' || userProfile?.role === 'admin') && (
          <button 
            onClick={onRecibir}
            className="w-full py-1.5 bg-[#00aeef] hover:bg-[#0088cc] text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors"
          >
            Recibir
          </button>
        )}

        {isTaller && (userProfile?.role === 'admin' || userProfile?.role === 'tecnico') && (
          <select 
            className="w-full py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-700 focus:outline-none focus:border-[#00aeef]/50 cursor-pointer"
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
    </div>
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
    <div className="flex flex-col flex-1 min-w-[200px] max-w-[260px] h-full bg-slate-200/50 rounded-xl border border-slate-300 overflow-hidden">
      <div className="p-3.5 flex items-center justify-between bg-white/80 border-b border-slate-300">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-3.5 bg-[#00aeef] rounded-full"></div>
          <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-[0.2em]">{column.name}</h3>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[9px] text-slate-700 font-bold">
            {cards.length}
          </span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-none">
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
        {cards.length === 0 && (
          <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl text-slate-500">
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
  onReabrir: (comment: string) => void;
}

const CardDetailModal = ({ 
  card, 
  user, 
  userProfile, 
  onClose,
  onPausar,
  onReanudar,
  onFinalizar,
  onReabrir
}: CardDetailModalProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showFinalizeForm, setShowFinalizeForm] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isReopening, setIsReopening] = useState(false);
  
  // Original Part form state
  const [partType, setPartType] = useState(card.originalPart?.type || '');
  const [partCode, setPartCode] = useState(card.originalPart?.code || '');
  const [partImei, setPartImei] = useState(card.originalPart?.imei || '');
  const [isSellAndBuy, setIsSellAndBuy] = useState(card.originalPart?.isSellAndBuy || false);
  const [isConsign, setIsConsign] = useState(card.originalPart?.isConsign || false);
  const [isSavingPart, setIsSavingPart] = useState(false);
  const [editPart, setEditPart] = useState(!card.originalPart);

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `cards/${card.id}/messages`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-5xl h-[85vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
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

              {/* Tag Management (Admin Only) */}
              {isAdmin && (
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Etiquetas de Estado</h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={async () => {
                        const hasGarantia = card.tags?.includes('GARANTIA');
                        const newTags = hasGarantia 
                          ? card.tags.filter(t => t !== 'GARANTIA')
                          : [...(card.tags || []), 'GARANTIA'];
                        
                        try {
                          await updateDoc(doc(db, 'cards', card.id), { tags: newTags });
                          
                          // Auto-create incident if GARANTIA was just added
                          if (!hasGarantia) {
                            await addDoc(collection(db, 'incidents'), {
                              type: 'garantia',
                              orderNumber: card.title,
                              primaryOrderNumber: '', 
                              incidentUserId: card.assignedTechnicianId || null,
                              incidentUserName: card.assignedTechnicianName || null,
                              solvingUserId: null,
                              solvingUserName: null,
                              solutionComment: 'Incidencia generada automáticamente al marcar la orden como GARANTÍA desde el panel de control.',
                              status: 'abierta',
                              reportedBy: user.uid,
                              reportedByName: user.displayName || 'Anónimo',
                              createdAt: serverTimestamp()
                            });
                          }
                        } catch (error) {
                          handleFirestoreError(error, OperationType.WRITE, `cards/${card.id}`);
                        }
                      }}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                        card.tags?.includes('GARANTIA')
                          ? "bg-orange-500 text-white border-orange-600 shadow-lg shadow-orange-500/20"
                          : "bg-white text-slate-400 border-slate-200 hover:border-orange-300 hover:text-orange-500"
                      )}
                    >
                      Garantía
                    </button>
                    <button 
                      onClick={async () => {
                        const hasUrgente = card.tags?.includes('URGENTE');
                        const newTags = hasUrgente 
                          ? card.tags.filter(t => t !== 'URGENTE')
                          : [...(card.tags || []), 'URGENTE'];
                        
                        try {
                          await updateDoc(doc(db, 'cards', card.id), { tags: newTags });
                        } catch (error) {
                          handleFirestoreError(error, OperationType.WRITE, `cards/${card.id}`);
                        }
                      }}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                        card.tags?.includes('URGENTE')
                          ? "bg-red-500 text-white border-red-600 shadow-lg shadow-red-500/20"
                          : "bg-white text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500"
                      )}
                    >
                      Urgente
                    </button>
                  </div>
                </section>
              )}

              {/* Original Parts Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Repuestos Originales</h4>
                  {card.originalPart && !editPart && !card.originalPart.isAudited && canAction && (
                    <button 
                      onClick={() => setEditPart(true)}
                      className="text-[9px] font-bold text-[#00aeef] uppercase tracking-widest hover:underline"
                    >
                      Editar
                    </button>
                  )}
                </div>

                {!editPart && card.originalPart ? (
                  <div className={cn(
                    "bg-white p-4 rounded-2xl border transition-all relative overflow-hidden",
                    card.originalPart.isAudited ? "border-green-200" : "border-slate-200"
                  )}>
                    {card.originalPart.isAudited && (
                      <div className="absolute top-0 right-0 p-2">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                      </div>
                    )}
                    <div className="space-y-3">
                      <div>
                        <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Tipo de Repuesto</p>
                        <p className="text-[11px] font-bold text-slate-900">{card.originalPart.type}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Código</p>
                          <p className="text-[11px] font-bold text-slate-900">{card.originalPart.code}</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">IMEI</p>
                          <p className="text-[11px] font-bold text-slate-900">{card.originalPart.imei}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {card.originalPart.isSellAndBuy && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black rounded-md border border-blue-100 uppercase tracking-widest">Sell & Buy</span>
                        )}
                        {card.originalPart.isConsign && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[8px] font-black rounded-md border border-purple-100 uppercase tracking-widest">Consign</span>
                        )}
                      </div>
                      <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-widest",
                          card.originalPart.isAudited ? "text-green-600" : "text-amber-500"
                        )}>
                          {card.originalPart.isAudited ? "Procesamiento Finalizado" : "Pendiente de Auditoría"}
                        </span>
                        {card.originalPart.auditedByName && (
                          <span className="text-[8px] text-slate-400 font-medium italic">Por: {card.originalPart.auditedByName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : canAction ? (
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
                    <div className="space-y-3">
                      <input 
                        type="text"
                        placeholder="Tipo de Repuesto"
                        value={partType}
                        onChange={e => setPartType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-[#00aeef]/30"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="text"
                          placeholder="Código"
                          value={partCode}
                          onChange={e => setPartCode(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-[#00aeef]/30"
                        />
                        <input 
                          type="text"
                          placeholder="IMEI"
                          value={partImei}
                          onChange={e => setPartImei(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-[#00aeef]/30"
                        />
                      </div>
                      <div className="flex gap-4 p-2 bg-slate-50 rounded-xl border border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={isSellAndBuy}
                            onChange={() => setIsSellAndBuy(!isSellAndBuy)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#00aeef] focus:ring-0"
                          />
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sell & Buy</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={isConsign}
                            onChange={() => setIsConsign(!isConsign)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#00aeef] focus:ring-0"
                          />
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Consign</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            if (!partType || !partCode || !partImei) return;
                            setIsSavingPart(true);
                            try {
                              await updateDoc(doc(db, 'cards', card.id), {
                                originalPart: {
                                  type: partType,
                                  code: partCode,
                                  imei: partImei,
                                  isSellAndBuy,
                                  isConsign,
                                  isAudited: false,
                                  registeredAt: serverTimestamp(),
                                  registeredBy: user.uid,
                                  registeredByName: user.displayName || 'Anónimo'
                                }
                              });
                              setEditPart(false);
                            } catch (e) {
                              console.error(e);
                            } finally {
                              setIsSavingPart(false);
                            }
                          }}
                          disabled={!partType || !partCode || !partImei || isSavingPart}
                          className="flex-1 py-2.5 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 disabled:opacity-30"
                        >
                          {isSavingPart ? 'Guardando...' : 'Registrar Repuesto'}
                        </button>
                        {card.originalPart && (
                          <button 
                            onClick={() => setEditPart(false)}
                            className="px-4 py-2.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-dashed border-slate-300 flex items-center justify-center">
                    <p className="text-[10px] text-slate-400 italic">No hay repuestos registrados.</p>
                  </div>
                )}
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

              {/* Reopen Action (Admin Only for Finalized Cards) */}
              {isAdmin && card.currentStep === 'finalizada' && (
                <section className="space-y-3 pt-4 border-t border-slate-200">
                  <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest italic">Panel de Reapertura (Admin)</h4>
                  <p className="text-[10px] text-slate-500 leading-tight">Si la orden fue cerrada por error, puedes reingresarla a taller. Esto limpiará el estado de cierre.</p>
                  <textarea 
                    value={actionComment}
                    onChange={e => setActionComment(e.target.value)}
                    placeholder="Escribe el motivo de la reapertura..."
                    className="w-full h-24 bg-white border border-red-200 rounded-2xl p-3 text-xs text-slate-900 focus:outline-none focus:border-red-400 transition-all resize-none"
                  />
                  <button 
                    onClick={async () => {
                      if (window.confirm("¿Estás seguro de que deseas reabrir esta orden? Se borrarán los datos del cierre actual.")) {
                        setIsReopening(true);
                        try {
                          await onReabrir(actionComment);
                        } catch (error: any) {
                          console.error("Error reopening:", error);
                          alert("Error al reabrir la orden: " + (error.message || "Error desconocido"));
                        } finally {
                          setIsReopening(false);
                        }
                      }
                    }}
                    disabled={!actionComment.trim() || isReopening}
                    className="w-full py-3 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {isReopening ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      'Reingresar a Taller'
                    )}
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>

        {/* Finalize Confirmation Overlay */}
        {showFinalizeForm && (
          <div className="absolute inset-0 z-50 bg-white/90 p-8 flex flex-col items-center justify-center text-center">
            <div className="max-w-md w-full space-y-8">
              <div className="w-20 h-20 bg-green-100 rounded-xl flex items-center justify-center mx-auto border border-green-200">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-slate-950 tracking-tight">Confirmar Cierre</h3>
                <p className="text-slate-600 text-sm">¿Cuál fue el resultado final de la reparación?</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Comentario de Cierre</p>
                <p className="text-sm text-slate-800 italic">"{actionComment}"</p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => onFinalizar(true, actionComment)}
                  className="flex-1 py-4 bg-green-500 text-white font-black rounded-xl hover:bg-green-600"
                >
                  Reparado
                </button>
                <button 
                  onClick={() => onFinalizar(false, actionComment)}
                  className="flex-1 py-4 bg-slate-200 text-slate-700 font-black rounded-xl hover:bg-slate-300"
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
          </div>
        )}
      </div>
    </div>
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-4xl h-[80vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-xl flex items-center justify-center border border-[#00aeef]/20">
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
              className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 flex items-center gap-2"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancelar' : 'Registrar Novedad'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
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
      </div>
    </div>
  );
};

interface UserActivityModalProps {
  onClose: () => void;
  user: User;
  allOrders: CardType[];
  allIncidents: Incident[];
}

const UserActivityModal = ({ onClose, user, allOrders, allIncidents }: UserActivityModalProps) => {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      const attQ = query(collection(db, 'attendance'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(31));
      const taskQ = query(collection(db, 'dailyTasks'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(31));

      const [attSnap, taskSnap] = await Promise.all([
        getDocs(attQ),
        getDocs(taskQ)
      ]);

      setAttendances(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setDailyTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as DailyTask)));
      setLoading(false);
    };

    fetchActivity();
  }, [user.uid]);

  const now = new Date();
  const currentMonth = format(now, 'yyyy-MM');

  // Filter user specific data
  const userOrders = allOrders.filter(o => o.assignedTechnicianId === user.uid);
  const userIncidents = allIncidents.filter(i => 
    i.involvedUsers?.some(iu => iu.userId === user.uid) || i.incidentUserId === user.uid
  );

  // Stats for the month
  const monthOrders = userOrders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM') === currentMonth);
  const monthRepaired = monthOrders.filter(o => o.isRepaired).length;
  const monthNoRepaired = monthOrders.filter(o => !o.isRepaired).length;
  const monthIncidents = userIncidents.filter(i => {
    if (!i.createdAt) return false;
    const date = typeof i.createdAt.toDate === 'function' ? i.createdAt.toDate() : new Date(i.createdAt.seconds * 1000);
    return format(date, 'yyyy-MM') === currentMonth;
  }).length;

  // Quality Score: Reparadas / (Totales + Garantias)
  const qualityScore = monthOrders.length > 0 ? Math.round((monthRepaired / (monthOrders.length + monthIncidents)) * 100) : 0;

  // Daily Progress (Last 7 Days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  const dailyProgressData = last7Days.map(date => {
    const [y, m, d] = date.split('-').map(Number);
    return {
      date: `${d}/${m}`,
      reparadas: userOrders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM-dd') === date && o.isRepaired).length,
      noReparadas: userOrders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM-dd') === date && !o.isRepaired).length
    };
  });

  // Monthly Accumulation
  const monthlyAccumulationData = [
    { name: 'Reparadas', value: monthRepaired, fill: '#10b981' },
    { name: 'No Reparadas', value: monthNoRepaired, fill: '#94a3b8' },
    { name: 'Incidencias', value: monthIncidents, fill: '#ef4444' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-4xl h-[80vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-xl flex items-center justify-center border border-[#00aeef]/20">
              <Activity className="w-6 h-6 text-[#00aeef]" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Mi Actividad Diaria</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Progreso y registros personales</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-none space-y-12">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
            </div>
          ) : (
            <>
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reparadas (Mes)</p>
                  <p className="text-2xl font-black text-slate-900">{monthRepaired}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">No Reparadas</p>
                  <p className="text-2xl font-black text-slate-600">{monthNoRepaired}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Incidencias</p>
                  <p className="text-2xl font-black text-red-600">{monthIncidents}</p>
                </div>
                <div className="bg-[#00aeef]/5 p-4 rounded-2xl border border-[#00aeef]/10">
                  <p className="text-[10px] font-black text-[#00aeef] uppercase tracking-widest mb-1">Score de Calidad</p>
                  <p className="text-2xl font-black text-[#00aeef]">{qualityScore}%</p>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#00aeef]" />
                    <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Progreso Diario (7 días)</h4>
                  </div>
                  <div className="h-[200px] w-full bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyProgressData}>
                        <defs>
                          <linearGradient id="colorRep" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="reparadas" stroke="#10b981" fillOpacity={1} fill="url(#colorRep)" strokeWidth={2} name="Reparadas" />
                        <Area type="monotone" dataKey="noReparadas" stroke="#94a3b8" fillOpacity={0} strokeWidth={2} name="No Reparadas" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#00aeef]" />
                    <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Acumulado Mensual</h4>
                  </div>
                  <div className="h-[200px] w-full bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyAccumulationData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40} name="Cantidad" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Incidents Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Mis Incidencias del Mes</h4>
                </div>
                <div className="space-y-2">
                  {userIncidents.filter(i => {
                    if (!i.createdAt) return false;
                    const date = typeof i.createdAt.toDate === 'function' ? i.createdAt.toDate() : new Date(i.createdAt.seconds * 1000);
                    return format(date, 'yyyy-MM') === currentMonth;
                  }).map(incident => (
                    <div key={incident.id} className="bg-red-50/30 border border-red-100 p-4 rounded-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[8px] font-black uppercase rounded tracking-widest">
                            {incident.type}
                          </span>
                          <p className="text-xs font-black text-slate-900">Orden #{incident.orderNumber || incident.primaryOrderNumber}</p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {incident.createdAt && format(incident.createdAt.toDate(), 'dd/MM/yyyy')}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-600 font-medium">
                        <span className="font-black text-slate-900 uppercase">Responsabilidad:</span> {
                          incident.involvedUsers?.find(iu => iu.userId === user.uid)?.responsibility || 'Involucrado'
                        }
                      </p>
                      {incident.solutionComment && (
                        <div className="mt-2 p-2 bg-white/50 rounded-lg border border-red-100/50">
                          <p className="text-[9px] text-slate-500 italic">Solución: {incident.solutionComment}</p>
                        </div>
                      )}
                    </div>
                  ))}
                  {userIncidents.length === 0 && <p className="text-[10px] text-slate-400 italic">No tienes incidencias registradas este mes.</p>}
                </div>
              </section>

              {/* Attendance Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-[#00aeef]" />
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest">Asistencia y Puntualidad</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface KPIModalProps {
  onClose: () => void;
  users: UserProfile[];
  incidents: Incident[];
  orders: CardType[];
}

const KPIModal = ({ onClose, users, incidents: parentIncidents, orders: parentOrders }: KPIModalProps) => {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [orders, setOrders] = useState<CardType[]>(parentOrders);
  const [incidents, setIncidents] = useState<Incident[]>(parentIncidents);
  const [loading, setLoading] = useState(false);
  const [showAuditForm, setShowAuditForm] = useState(false);
  
  // Audit state
  const [auditUserId, setAuditUserId] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      const [attSnap, taskSnap] = await Promise.all([
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'dailyTasks'))
      ]);

      setAttendances(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setDailyTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as DailyTask)));
      setLoading(false);
    };

    fetchAllData();
  }, []);

  // Update local state when props change (for real-time updates)
  useEffect(() => {
    setIncidents(parentIncidents);
  }, [parentIncidents]);

  useEffect(() => {
    setOrders(parentOrders);
  }, [parentOrders]);

  // --- Chart Data Calculations ---
  
  const now = new Date();
  const currentMonth = format(now, 'yyyy-MM');
  const currentYear = format(now, 'yyyy');

  // 1. Productivity by Technician (Repaired Orders) - Current Month
  const productivityData = users
    .filter(u => u.role === 'tecnico' || u.role === 'admin')
    .map(u => ({
      name: u.displayName || 'Técnico',
      reparadas: orders.filter(o => 
        o.assignedTechnicianId === u.uid && 
        o.currentStep === 'finalizada' && 
        o.isRepaired &&
        o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM') === currentMonth
      ).length,
      noReparadas: orders.filter(o => 
        o.assignedTechnicianId === u.uid && 
        o.currentStep === 'finalizada' && 
        !o.isRepaired &&
        o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM') === currentMonth
      ).length
    }))
    .sort((a, b) => b.reparadas - a.reparadas);

  // 2. Weekly Trend (Ingresadas vs Reparadas)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  const weeklyTrendData = last7Days.map(date => {
    const [year, month, day] = date.split('-').map(Number);
    return {
      date: `${day}/${month}`,
      ingresadas: orders.filter(o => o.createdAt && format(o.createdAt.toDate(), 'yyyy-MM-dd') === date).length,
      reparadas: orders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM-dd') === date && o.isRepaired).length
    };
  });

  // 3. Yearly History (Reparadas + No Reparadas + Garantias)
  const yearlyHistoryData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), i, 1);
    const m = format(d, 'yyyy-MM');
    return {
      month: format(d, 'MMM', { locale: es }),
      reparadas: orders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM') === m && o.isRepaired).length,
      noReparadas: orders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM') === m && !o.isRepaired).length,
      garantias: orders.filter(o => o.createdAt && format(o.createdAt.toDate(), 'yyyy-MM') === m && o.tags?.includes('GARANTIA')).length
    };
  });

  // 4. Incidents by Employee (Current Month)
  const incidentByEmployeeData = users.map(u => ({
    name: u.displayName || 'Usuario',
    count: incidents.filter(i => {
      const isInvolved = (i.involvedUsers && Array.isArray(i.involvedUsers) && i.involvedUsers.some(iu => iu.userId === u.uid)) || 
                         i.incidentUserId === u.uid || 
                         i.solvingUserId === u.uid;
      let isThisMonth = false;
      if (i.createdAt) {
        try {
          const date = typeof i.createdAt.toDate === 'function' ? i.createdAt.toDate() : 
                       (i.createdAt.seconds ? new Date(i.createdAt.seconds * 1000) : new Date(i.createdAt));
          isThisMonth = format(date, 'yyyy-MM') === currentMonth;
        } catch (e) {
          isThisMonth = false;
        }
      }
      return isInvolved && isThisMonth;
    }).length
  })).filter(d => d.count > 0).sort((a, b) => b.count - a.count);

  // 5. Top Stats (Current Month)
  const monthEntered = orders.filter(o => o.createdAt && format(o.createdAt.toDate(), 'yyyy-MM') === currentMonth).length;
  const monthOrders = orders.filter(o => o.finalizedAt && format(o.finalizedAt.toDate(), 'yyyy-MM') === currentMonth);
  const monthRepaired = monthOrders.filter(o => o.isRepaired).length;
  const monthTotalFinalized = monthOrders.length;
  const monthIncidents = incidents.filter(i => {
    if (!i.createdAt) return false;
    try {
      const date = typeof i.createdAt.toDate === 'function' ? i.createdAt.toDate() : new Date(i.createdAt.seconds * 1000);
      return format(date, 'yyyy-MM') === currentMonth;
    } catch (e) {
      return false;
    }
  }).length;
  const successRate = monthTotalFinalized > 0 ? Math.round((monthRepaired / monthTotalFinalized) * 100) : 0;

  const generateAuditPDF = () => {
    const selectedUser = users.find(u => u.uid === auditUserId);
    if (!selectedUser) return;

    const doc = new jsPDF();
    const now = format(new Date(), 'dd/MM/yyyy HH:mm');
    const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
    const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
    const start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0);
    const end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);

    // Filter data for the audit
    const userOrders = orders.filter(o => 
      o.assignedTechnicianId === auditUserId && 
      o.createdAt?.toDate() >= start && 
      o.createdAt?.toDate() <= end
    );
    
    const userIncidents = incidents.filter(i => 
      i.involvedUsers?.some(iu => iu.userId === auditUserId) && 
      i.createdAt?.toDate() >= start && 
      i.createdAt?.toDate() <= end
    );

    const userAttendance = attendances.filter(a => {
      if (a.userId !== auditUserId) return false;
      const [y, m, d] = a.date.split('-').map(Number);
      const attDate = new Date(y, m - 1, d);
      return attDate >= start && attDate <= end;
    });

    const userTasks = dailyTasks.filter(t => {
      if (t.userId !== auditUserId) return false;
      const [y, m, d] = t.date.split('-').map(Number);
      const taskDate = new Date(y, m - 1, d);
      return taskDate >= start && taskDate <= end;
    });

    // Calculate days without task
    const activeDays = new Set(userOrders.filter(o => o.createdAt).map(o => format(o.createdAt.toDate(), 'yyyy-MM-dd')));
    const taskDays = new Set(userTasks.map(t => t.date));
    const missingTaskDays = Array.from(activeDays).filter(d => !taskDays.has(d)).sort();

    doc.setFontSize(22);
    doc.setTextColor(0, 174, 239);
    doc.text('AUDITORÍA DE DESEMPEÑO', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`PuntoDamia - Sistema de Gestión Técnica`, 14, 30);
    doc.text(`Generado: ${now}`, 14, 35);
    doc.text(`Periodo: ${format(start, 'dd/MM/yyyy')} al ${format(end, 'dd/MM/yyyy')}`, 14, 40);

    doc.setDrawColor(0, 174, 239);
    doc.line(14, 45, 196, 45);

    // User Info
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Empleado: ${selectedUser.displayName}`, 14, 55);
    doc.setFontSize(10);
    doc.text(`Rol: ${selectedUser.role.toUpperCase()}`, 14, 62);
    doc.text(`Email: ${selectedUser.email}`, 14, 67);

    // Summary Stats
    const repaired = userOrders.filter(o => o.currentStep === 'finalizada' && o.isRepaired).length;
    const notRepaired = userOrders.filter(o => o.currentStep === 'finalizada' && !o.isRepaired).length;
    const warranties = userOrders.filter(o => o.tags?.includes('GARANTIA')).length;

    doc.setFontSize(12);
    doc.text('RESUMEN DE MÉTRICAS', 14, 80);
    (doc as any).autoTable({
      startY: 85,
      head: [['Métrica', 'Cantidad']],
      body: [
        ['Órdenes Reparadas', repaired],
        ['Órdenes No Reparadas', notRepaired],
        ['Órdenes de Garantía Recibidas', warranties],
        ['Incidencias Registradas (Responsable)', userIncidents.length],
        ['Días sin Registro de Tarea Diaria', missingTaskDays.length]
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 174, 239] }
    });

    // Incidents Detail
    const finalY1 = (doc as any).lastAutoTable.finalY + 15;
    doc.text('DETALLE DE INCIDENCIAS', 14, finalY1);
    (doc as any).autoTable({
      startY: finalY1 + 5,
      head: [['Fecha', 'Tipo', 'Orden', 'Responsabilidad / Solución', 'Estado']],
      body: userIncidents.map(i => {
        const myResponsibility = i.involvedUsers?.find(iu => iu.userId === auditUserId)?.responsibility || '';
        return [
          formatTimestamp(i.createdAt, 'dd/MM/yy'),
          i.type === 'garantia' ? 'GARANTÍA' : 'PERSONAL',
          i.type === 'garantia' ? `#${i.orderNumber} (Ref: #${i.primaryOrderNumber})` : 'N/A',
          `${myResponsibility}\nSolución: ${i.solutionComment}`,
          i.status.toUpperCase()
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: [239, 68, 68] }
    });

    // Attendance Detail
    const finalY2 = (doc as any).lastAutoTable.finalY + 15;
    if (finalY2 > 250) doc.addPage();
    doc.text('REGISTRO DE ASISTENCIAS / NOVEDADES', 14, finalY2 > 250 ? 20 : finalY2);
    (doc as any).autoTable({
      startY: finalY2 > 250 ? 25 : finalY2 + 5,
      head: [['Fecha', 'Motivo', 'Justificado', 'Nota']],
      body: userAttendance.map(a => [
        a.date,
        a.reason,
        a.justified ? 'SÍ' : 'NO',
        a.note || '-'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [100, 116, 139] }
    });

    // Missing Tasks
    const finalY3 = (doc as any).lastAutoTable.finalY + 15;
    if (finalY3 > 250) doc.addPage();
    doc.text('DÍAS SIN TAREA DIARIA REGISTRADA', 14, finalY3 > 250 ? 20 : finalY3);
    doc.setFontSize(9);
    doc.text(missingTaskDays.length > 0 ? missingTaskDays.join(', ') : 'Ninguno. ¡Excelente cumplimiento!', 14, finalY3 > 250 ? 30 : finalY3 + 10, { maxWidth: 180 });

    doc.save(`Auditoria_${selectedUser.displayName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-6xl h-[90vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
              <BarChart3 className="w-6 h-6 text-[#00aeef]" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Panel de Control y KPIs</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Métricas de rendimiento y auditoría global</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAuditForm(!showAuditForm)}
              className={cn(
                "px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-lg",
                showAuditForm ? "bg-slate-900 text-white" : "bg-white border border-slate-300 text-slate-700"
              )}
            >
              <Users className="w-4 h-4" />
              {showAuditForm ? 'Ver Dashboard' : 'Auditoría de Empleado'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-slate-800 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-none bg-slate-50/30">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
            </div>
          ) : showAuditForm ? (
            <div className="max-w-2xl mx-auto space-y-8 py-10">
              <div className="text-center space-y-2">
                <h4 className="text-2xl font-black text-slate-950 tracking-tight">Generar Informe de Auditoría</h4>
                <p className="text-sm text-slate-500">Selecciona el técnico y el rango de fechas para el reporte PDF.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Técnico a Auditar</label>
                  <select 
                    value={auditUserId}
                    onChange={e => setAuditUserId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="">Seleccionar Empleado...</option>
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Desde</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#00aeef]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Hasta</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#00aeef]/50"
                    />
                  </div>
                </div>

                <button 
                  onClick={generateAuditPDF}
                  disabled={!auditUserId}
                  className="w-full py-4 bg-[#00aeef] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-[#0088cc] transition-all shadow-lg shadow-[#00aeef]/20 disabled:opacity-30 flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" />
                  Generar y Descargar Auditoría
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {/* Top Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-16 h-16 bg-[#00aeef]/10 rounded-2xl flex items-center justify-center border border-[#00aeef]/20">
                    <ClipboardList className="w-8 h-8 text-[#00aeef]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Órdenes Ingresadas</p>
                    <p className="text-4xl font-black text-slate-950">{monthEntered}</p>
                    <p className="text-[10px] text-[#00aeef] font-bold mt-1">Total este mes</p>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center border border-green-100">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Productividad Total</p>
                    <p className="text-4xl font-black text-slate-950">{monthRepaired}</p>
                    <p className="text-[10px] text-green-600 font-bold mt-1">Reparadas este mes</p>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-50">
                    <Target className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tasa de Éxito</p>
                    <p className="text-4xl font-black text-blue-600">{successRate}%</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">Efectividad Técnica</p>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Incidencias</p>
                    <p className="text-4xl font-black text-red-600">{monthIncidents}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">Registradas este mes</p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Weekly Trend Chart */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Tendencia Semanal (Ingresos vs Reparadas)</h4>
                    <LineChartIcon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line type="monotone" dataKey="ingresadas" stroke="#00aeef" strokeWidth={3} dot={{ r: 4, fill: '#00aeef' }} name="Ingresadas" />
                        <Line type="monotone" dataKey="reparadas" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} name="Reparadas" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Yearly History Chart */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Histórico Anual de Calidad</h4>
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearlyHistoryData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="reparadas" stackId="a" fill="#10b981" barSize={20} name="Reparadas" />
                        <Bar dataKey="noReparadas" stackId="a" fill="#94a3b8" barSize={20} name="No Reparadas" />
                        <Bar dataKey="garantias" stackId="a" fill="#ef4444" barSize={20} name="Garantías" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Incident by Employee Chart */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Incidencias por Empleado (Mes en curso)</h4>
                    <Users className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="h-[300px] w-full">
                    {incidentByEmployeeData.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                        <AlertTriangle className="w-8 h-8 opacity-20" />
                        <p className="text-xs font-medium italic">No hay incidencias registradas este mes</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={incidentByEmployeeData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} name="Incidencias" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Productivity Individual Chart */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Productividad Individual (Mes en curso)</h4>
                    <Activity className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={productivityData} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="reparadas" fill="#10b981" radius={[0, 4, 4, 0]} barSize={15} name="Reparadas" />
                        <Bar dataKey="noReparadas" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={15} name="No Reparadas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Performance Ranking */}
                <div className="lg:col-span-2 space-y-4">
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#00aeef]" />
                    Ranking de Desempeño Técnico
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {productivityData.slice(0, 3).map((u, i) => (
                      <div key={u.name} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <span className="text-4xl font-black text-slate-200">#{i + 1}</span>
                        </div>
                        <p className="text-sm font-black text-slate-900 mb-1">{u.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{u.reparadas} Reparaciones Exitosas</p>
                        <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#00aeef] rounded-full" 
                            style={{ width: `${(u.reparadas / (u.reparadas + u.noReparadas || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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
  const [type, setType] = useState<'garantia' | 'personal'>('personal');
  const [orderNumber, setOrderNumber] = useState('');
  const [primaryOrderNumber, setPrimaryOrderNumber] = useState('');
  const [involvedUsers, setInvolvedUsers] = useState<InvolvedUser[]>([]);
  const [currentInvolvedUserId, setCurrentInvolvedUserId] = useState('');
  const [currentResponsibility, setCurrentResponsibility] = useState('');
  const [solvingUserId, setSolvingUserId] = useState('');
  const [solutionComment, setSolutionComment] = useState('');
  const [status, setStatus] = useState<'abierta' | 'resuelta'>('abierta');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Incident)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'incidents');
    });
    return () => unsubscribe();
  }, []);

  // Auto-lookup technician for primary order
  useEffect(() => {
    if (type === 'garantia' && primaryOrderNumber.length >= 3) {
      const lookupPrimaryOrder = async () => {
        try {
          const q = query(collection(db, 'cards'), where('title', '==', primaryOrderNumber), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const cardData = snapshot.docs[0].data() as CardType;
            if (cardData.assignedTechnicianId && !involvedUsers.some(u => u.userId === cardData.assignedTechnicianId)) {
              const tech = users.find(u => u.uid === cardData.assignedTechnicianId);
              if (tech) {
                setInvolvedUsers(prev => [...prev, {
                  userId: tech.uid,
                  userName: tech.displayName || 'Técnico',
                  role: tech.role,
                  responsibility: 'Técnico responsable de la reparación original'
                }]);
              }
            }
          }
        } catch (error) {
          console.error("Error looking up primary order:", error);
        }
      };
      const timeoutId = setTimeout(lookupPrimaryOrder, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [primaryOrderNumber, type]);

  const addInvolvedUser = () => {
    if (!currentInvolvedUserId || !currentResponsibility) return;
    const userToInvolve = users.find(u => u.uid === currentInvolvedUserId);
    if (userToInvolve && !involvedUsers.some(u => u.userId === currentInvolvedUserId)) {
      setInvolvedUsers([...involvedUsers, {
        userId: userToInvolve.uid,
        userName: userToInvolve.displayName || 'Usuario',
        role: userToInvolve.role,
        responsibility: currentResponsibility
      }]);
      setCurrentInvolvedUserId('');
      setCurrentResponsibility('');
    }
  };

  const removeInvolvedUser = (uid: string) => {
    setInvolvedUsers(involvedUsers.filter(u => u.userId !== uid));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (involvedUsers.length === 0) {
      alert("Debes agregar al menos un usuario involucrado");
      return;
    }
    const solvingUser = users.find(u => u.uid === solvingUserId);
    
    const incidentData = {
      type,
      orderNumber: type === 'garantia' ? orderNumber : null,
      primaryOrderNumber: type === 'garantia' ? primaryOrderNumber : null,
      involvedUsers,
      solvingUserId: solvingUserId || null,
      solvingUserName: solvingUser?.displayName || null,
      solutionComment,
      status,
      reportedBy: user.uid,
      reportedByName: user.displayName || 'Admin',
      createdAt: serverTimestamp()
    };

    try {
      if (editingId) {
        const original = incidents.find(i => i.id === editingId);
        await updateDoc(doc(db, 'incidents', editingId), {
          ...incidentData,
          createdAt: original?.createdAt // Keep original timestamp
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
    setPrimaryOrderNumber('');
    setInvolvedUsers([]);
    setCurrentInvolvedUserId('');
    setCurrentResponsibility('');
    setSolvingUserId('');
    setSolutionComment('');
    setStatus('abierta');
    setType('personal');
  };

  const handleEdit = (incident: Incident) => {
    setEditingId(incident.id);
    setType(incident.type);
    setOrderNumber(incident.orderNumber || '');
    setPrimaryOrderNumber(incident.primaryOrderNumber || '');
    setInvolvedUsers(incident.involvedUsers || []);
    setSolvingUserId(incident.solvingUserId || '');
    setSolutionComment(incident.solutionComment || '');
    setStatus(incident.status);
    setShowForm(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-5xl h-[85vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center border border-red-100">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Registro de Incidencias</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Garantías y Desempeño del Personal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              {showForm ? 'Ver Listado' : 'Registrar Incidencia'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="personal">Incidencia del Personal</option>
                    <option value="garantia">Garantía de una Orden</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado</label>
                  <select 
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="abierta">Abierta (Pendiente)</option>
                    <option value="resuelta">Resuelta (Finalizada)</option>
                  </select>
                </div>

                {type === 'garantia' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nro de Orden (Garantía Actual)</label>
                      <input 
                        type="text"
                        value={orderNumber}
                        onChange={e => setOrderNumber(e.target.value)}
                        placeholder="Ej: 5520"
                        required={type === 'garantia'}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Garantía de Orden (Orden Primaria)</label>
                      <input 
                        type="text"
                        value={primaryOrderNumber}
                        onChange={e => setPrimaryOrderNumber(e.target.value)}
                        placeholder="Nro de orden original"
                        required={type === 'garantia'}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                      />
                    </div>
                  </>
                )}

                <div className="md:col-span-2 bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#00aeef]" />
                      Personal Involucrado y Responsabilidades
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Usuario</label>
                      <select 
                        value={currentInvolvedUserId}
                        onChange={e => setCurrentInvolvedUserId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-[#00aeef]/50"
                      >
                        <option value="">Seleccionar...</option>
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsabilidad / Error</label>
                      <input 
                        type="text"
                        value={currentResponsibility}
                        onChange={e => setCurrentResponsibility(e.target.value)}
                        placeholder="Ej: Error en ingreso de modelo"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-[#00aeef]/50"
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={addInvolvedUser}
                      className="h-[42px] bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-800 transition-all"
                    >
                      Agregar a la lista
                    </button>
                  </div>

                  {involvedUsers.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {involvedUsers.map(u => (
                        <div key={u.userId} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400">
                              {u.userName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900">{u.userName}</p>
                              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{u.responsibility}</p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeInvolvedUser(u.userId)}
                            className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Usuario que Solucionó</label>
                  <select 
                    value={solvingUserId}
                    onChange={e => setSolvingUserId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50"
                  >
                    <option value="">Seleccionar usuario...</option>
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Caja de Comentario (Registro de Solución)</label>
                <textarea 
                  value={solutionComment}
                  onChange={e => setSolutionComment(e.target.value)}
                  placeholder="Describe cómo se dio solución a la incidencia..."
                  required
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#00aeef]/50 resize-none"
                />
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full py-4 bg-[#00aeef] text-white font-black rounded-xl hover:bg-[#0088cc] transition-all uppercase tracking-widest shadow-lg shadow-[#00aeef]/20"
                >
                  {editingId ? 'Actualizar Registro' : 'Registrar Incidencia'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <RefreshCw className="w-8 h-8 text-[#00aeef] animate-spin" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargando registros...</p>
                </div>
              ) : incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                    <AlertTriangle className="w-8 h-8 text-slate-200" />
                  </div>
                  <p className="text-sm font-bold text-slate-400">No hay incidencias registradas</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {incidents.map(incident => (
                    <div key={incident.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#00aeef]/30 transition-all group relative">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            incident.type === 'garantia' ? "bg-red-50 border-red-100 text-red-600" : "bg-amber-50 border-amber-100 text-amber-600"
                          )}>
                            {incident.type === 'garantia' ? 'Garantía de Orden' : 'Incidencia Personal'}
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            incident.status === 'resuelta' ? "bg-green-50 border-green-100 text-green-600" : "bg-slate-50 border-slate-100 text-slate-500"
                          )}>
                            {incident.status}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleEdit(incident)}
                            className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-[#00aeef] transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Trazabilidad</p>
                          <p className="text-xs font-bold text-slate-900">
                            {incident.type === 'garantia' ? (
                              <>Orden: {incident.orderNumber} <span className="text-slate-300 mx-1">→</span> Ref: {incident.primaryOrderNumber}</>
                            ) : 'N/A'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Personal Involucrado</p>
                          <div className="flex flex-wrap gap-2">
                            {incident.involvedUsers?.map(u => (
                              <div key={u.userId} className="flex flex-col bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                <span className="text-[9px] font-black text-slate-900">{u.userName}</span>
                                <span className="text-[7px] text-slate-500 font-bold uppercase tracking-tighter">{u.responsibility}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Solucionó / Fecha</p>
                          <p className="text-xs font-bold text-slate-900">
                            {incident.solvingUserName} <span className="text-slate-300 mx-1">|</span> {formatTimestamp(incident.createdAt, 'dd/MM/yy HH:mm')}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-50">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Registro de Solución</p>
                        <p className="text-xs text-slate-700 leading-relaxed italic">"{incident.solutionComment}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface AuditoriaOriginalesModalProps {
  onClose: () => void;
  cards: CardType[];
  user: User;
}

const AuditoriaOriginalesModal = ({ onClose, cards, user }: AuditoriaOriginalesModalProps) => {
  const [activeTab, setActiveTab] = useState<'pendientes' | 'finalizadas'>('pendientes');

  const originalPartsCards = cards.filter(c => c.originalPart);
  const pendingCards = originalPartsCards.filter(c => !c.originalPart?.isAudited);
  const finalizedCards = originalPartsCards.filter(c => c.originalPart?.isAudited);

  const displayCards = activeTab === 'pendientes' ? pendingCards : finalizedCards;

  const handleFinalizar = async (card: CardType) => {
    try {
      await updateDoc(doc(db, 'cards', card.id), {
        'originalPart.isAudited': true,
        'originalPart.auditedBy': user.uid,
        'originalPart.auditedByName': user.displayName || 'Admin',
        'originalPart.auditedAt': serverTimestamp(),
        history: [...(card.history || []), {
          step: card.currentStep,
          timestamp: Timestamp.now(),
          userId: user.uid,
          userName: user.displayName || 'Admin',
          comment: `REPUESTO AUDITADO POR ${user.displayName || 'Admin'}`
        }]
      });
    } catch (e) {
      console.error(e);
      alert("Error al finalizar auditoría");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-4xl h-[80vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-950 tracking-tight">Auditoría Originales</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Gestión de Stock de Repuestos Originales</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('pendientes')}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
              activeTab === 'pendientes' ? "border-blue-500 text-blue-600 bg-blue-50/30" : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            Pendientes ({pendingCards.length})
          </button>
          <button 
            onClick={() => setActiveTab('finalizadas')}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
              activeTab === 'finalizadas' ? "border-green-500 text-green-600 bg-green-50/30" : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            Finalizado ({finalizedCards.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
          {displayCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                <Check className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-sm font-bold text-slate-400">No hay órdenes en esta categoría</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayCards.map(card => (
                <div key={card.id} className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-200 transition-all flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-6">
                    <div className="text-center min-w-[80px]">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Orden</p>
                      <p className="text-lg font-black text-slate-900 leading-none">#{card.title}</p>
                    </div>
                    <div className="h-10 w-px bg-slate-100" />
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Repuesto Original</p>
                      <p className="text-sm font-black text-slate-900">{card.originalPart?.type}</p>
                      <p className="text-[10px] text-slate-500 font-medium">Código: {card.originalPart?.code} | IMEI: {card.originalPart?.imei}</p>
                    </div>
                    <div className="flex gap-2">
                      {card.originalPart?.isSellAndBuy && (
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[8px] font-black rounded-lg border border-blue-100 uppercase tracking-widest">Sell & Buy</span>
                      )}
                      {card.originalPart?.isConsign && (
                        <span className="px-3 py-1 bg-purple-50 text-purple-600 text-[8px] font-black rounded-lg border border-purple-100 uppercase tracking-widest">Consign</span>
                      )}
                    </div>
                  </div>
                  
                  {activeTab === 'pendientes' ? (
                    <button 
                      onClick={() => handleFinalizar(card)}
                      className="px-6 py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                    >
                      Finalizar
                    </button>
                  ) : (
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-green-600 mb-1">
                        <ShieldCheck className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Auditado</span>
                      </div>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">Por: {card.originalPart?.auditedByName}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-md rounded-xl border border-red-100 shadow-xl flex flex-col overflow-hidden"
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
      </div>
    </div>
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

      // 3. Delete all incidents
      const incidentsSnap = await getDocs(collection(db, 'incidents'));
      for (const d of incidentsSnap.docs) {
        await deleteDoc(doc(db, 'incidents', d.id));
      }

      // 4. Delete all columns
      const colsSnap = await getDocs(collection(db, 'columns'));
      for (const d of colsSnap.docs) {
        await deleteDoc(doc(db, 'columns', d.id));
      }
      
      console.log("System Reset Successful");
      // Trigger re-creation of default columns
      createDefaultColumns();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'system-reset');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <div 
          className="bg-white w-full max-w-2xl h-[85vh] rounded-xl border border-slate-300 shadow-xl flex flex-col overflow-hidden"
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
        </div>
      </div>

      {showResetConfirm && (
        <ResetSystemModal 
          onClose={() => setShowResetConfirm(false)}
          onConfirm={handleResetSystem}
        />
      )}
    </>
  );
};

const createDefaultColumns = async () => {
  const defaults = [
    { id: 'recepcion', name: 'Orden en Recepción' },
    { id: 'taller', name: 'Orden En Taller' },
    { id: 'reparacion', name: 'Orden En Reparación' },
    { id: 'espera', name: 'Orden En Espera' },
    { id: 'finalizada', name: 'Orden Finalizada' }
  ];

  for (let i = 0; i < defaults.length; i++) {
    const col = defaults[i];
    await setDoc(doc(db, 'columns', col.id), {
      name: col.name,
      order: i,
      boardId: 'default'
    }, { merge: true });
  }
};

const MANUAL_CONTENT = `
1. Introducción
Esta plataforma centraliza la comunicación, mide los tiempos de respuesta (SLA) y asegura que cada orden de servicio sea atendida con calidad.

2. Roles y Permisos
* Administrador: Control total, gestión de usuarios, auditorías y supervisión global.
* Recepción: Creación de órdenes y recepción física de equipos.
* Técnico: Reparaciones, comunicación por chat, pausas y finalización.

3. El Tablero de Control (Workflow)
1. Recepción: Órdenes recién creadas. Clic en "RECIBIR" para avanzar.
2. Taller (Cola): Órdenes esperando técnico. El Admin o Técnico debe "Asignar".
3. Reparación: Órdenes con técnico asignado en proceso activo.
4. Espera (Pausado): Órdenes detenidas por repuestos o aprobación. Requiere comentario.
5. Finalizada: Órdenes concluidas. Se indica si fue "Reparada" o "No Reparada".

4. Funciones Detalladas
⏱️ Contador (SLA): Meta de 24 horas. Azul (>4h), Ámbar (<4h), Rojo (<2h).
🏷️ Etiquetas: URGENTE (Prioridad), GARANTÍA (Seguimiento especial).
💬 Chat: Icono azul con punto = mensajes nuevos. Registro de toda comunicación.
🔄 Re-asignación: Clic en icono de flechas junto al técnico para cambiar responsable.

5. Procesos Clave
A. Ingreso: Botón "+" -> Título -> Etiquetas -> Recepción.
B. Pausar: Detalle -> "Pausar" -> Motivo.
C. Finalizar: Detalle -> "Finalizar" -> Estado -> Comentario.

6. Herramientas Administrativas
📊 Auditorías: Rendimiento individual y reportes PDF en panel de KPIs.
📅 Asistencia y Tareas: Registro de ingreso y objetivos diarios del personal.

7. Buenas Prácticas
1. Chat Actualizado: Registrar toda novedad técnica o del cliente.
2. Respetar el Contador: Evitar que las tarjetas lleguen a color rojo.
3. Cierre Preciso: Comentarios claros para base de garantía.
`;

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
  const [showAuditoriaOriginales, setShowAuditoriaOriginales] = useState(false);
  const [showAttendanceManagement, setShowAttendanceManagement] = useState(false);
  const [showKPIs, setShowKPIs] = useState(false);
  const [showUserActivity, setShowUserActivity] = useState(false);
  const [dailyTaskDone, setDailyTaskDone] = useState(false);
  const [showDailyTaskMessage, setShowDailyTaskMessage] = useState(false);
  const [dailyTaskType, setDailyTaskType] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Incident)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'incidents');
    });
    return () => unsubscribe();
  }, [user]);

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'dailyTasks');
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
            // Force admin for owner, otherwise keep or default
            role: isAdminEmail ? 'admin' : (existingData.role || 'recepcion')
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
        // Use getDocsFromServer to bypass cache and test real connection
        await getDocsFromServer(query(collection(db, 'boards'), limit(1)));
      } catch (error) {
        if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
          console.error("Firestore connection failed. Please check your Firebase configuration and internet connection.");
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

    // Cleanup duplicates (one-time check for old auto-generated IDs)
    const cleanupDuplicates = async () => {
      const q = query(collection(db, 'columns'));
      const snapshot = await getDocs(q);
      const deterministicIds = ['recepcion', 'taller', 'reparacion', 'espera', 'finalizada'];
      
      const nameToId: Record<string, string> = {
        'orden en recepción': 'recepcion',
        'orden en taller': 'taller',
        'orden en reparación': 'reparacion',
        'orden en espera': 'espera',
        'orden finalizada': 'finalizada'
      };

      for (const d of snapshot.docs) {
        if (!deterministicIds.includes(d.id)) {
          const colData = d.data();
          const normalizedName = (colData.name || '').toLowerCase();
          const newId = nameToId[normalizedName];
          
          if (newId) {
            // Migrate cards from this old column to the new one
            const cardsQ = query(collection(db, 'cards'), where('columnId', '==', d.id));
            const cardsSnap = await getDocs(cardsQ);
            for (const cardDoc of cardsSnap.docs) {
              await updateDoc(doc(db, 'cards', cardDoc.id), {
                columnId: newId
              });
            }
          }
          // If it's an old auto-generated ID, delete it
          await deleteDoc(doc(db, 'columns', d.id));
        }
      }
    };
    cleanupDuplicates();

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubCols();
      unsubCards();
      unsubUsers();
    };
  }, [user]);

  const handleCreateCard = async () => {
    if (!newCardTitle.trim()) return;
    
    // Duplicate check
    const isDuplicate = cards.some(c => c.title.toLowerCase() === newCardTitle.trim().toLowerCase());
    if (isDuplicate && !duplicateWarning) {
      setDuplicateWarning(true);
      return;
    }

    const receptionCol = columns.find(c => c.id === 'recepcion') || columns[0];
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
          primaryOrderNumber: '', // To be filled by admin later
          incidentUserId: null,
          incidentUserName: null,
          solvingUserId: null,
          solvingUserName: null,
          solutionComment: 'Incidencia generada automáticamente por sistema al marcar Garantía en el ingreso.',
          status: 'abierta',
          reportedBy: user.uid,
          reportedByName: user.displayName || 'Anónimo',
          createdAt: serverTimestamp()
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
    const tallerCol = columns.find(c => c.id === 'taller');
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
    try {
      const isInitialAssignment = card.currentStep === 'taller';
      const reparacionCol = columns.find(c => c.id === 'reparacion');
      
      const updateData: any = {
        assignedTechnicianId: techId,
        assignedTechnicianName: techName,
        history: [...(card.history || []), {
          step: card.currentStep,
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo',
          comment: `Técnico asignado/cambiado: ${techName}`
        }]
      };

      if (isInitialAssignment && reparacionCol) {
        updateData.columnId = reparacionCol.id;
        updateData.currentStep = 'reparacion';
      }

      await updateDoc(doc(db, 'cards', card.id), updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cards/${card.id}`);
    }
  };

  const handlePausar = async (card: CardType, comment: string) => {
    const esperaCol = columns.find(c => c.id === 'espera');
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
    const reparacionCol = columns.find(c => c.id === 'reparacion');
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
    const finalizadaCol = columns.find(c => c.id === 'finalizada');
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

  const handleReabrir = async (card: CardType, comment: string) => {
    // Try to find the column by ID, then by name, then fallback to deterministic ID
    const reparacionCol = columns.find(c => c.id === 'reparacion') || 
                         columns.find(c => c.name.toLowerCase().includes('reparación'));
    const reparacionColId = reparacionCol?.id || 'reparacion';

    try {
      await updateDoc(doc(db, 'cards', card.id), {
        columnId: reparacionColId,
        currentStep: 'reparacion',
        order: cards.filter(c => c.columnId === reparacionColId).length,
        isRepaired: deleteField(),
        finalizedAt: deleteField(),
        closingComment: deleteField(),
        history: [...(card.history || []), {
          step: 'reparacion',
          timestamp: new Date(),
          userId: user?.uid,
          userName: user?.displayName || 'Anónimo',
          comment: `REAPERTURA: ${comment}`
        }]
      });
      
      const toast = document.createElement('div');
      toast.className = "fixed bottom-12 left-1/2 -translate-x-1/2 bg-green-600 text-white px-8 py-4 rounded-xl text-sm font-black z-[100] shadow-xl border border-white/20";
      toast.innerText = "ORDEN REABIERTA EXITOSAMENTE";
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }, 3000);

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

  const handleDownloadManual = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(0, 174, 239); // #00aeef
    doc.text('Manual Operativo: Gestión de Taller', 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    
    const lines = doc.splitTextToSize(MANUAL_CONTENT, 170);
    doc.text(lines, 20, 35);
    
    doc.save('Manual_Operativo_Taller.pdf');
  };

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
        <div className="max-w-md w-full text-center space-y-10">
          {/* Logo Punto Damia */}
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-[#00aeef] rounded-full flex items-center justify-center shadow-lg">
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
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-3 shadow-xl"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
              Iniciar sesión con Google
            </button>
          </div>

          <div className="pt-8 flex flex-col items-center gap-2">
            <div className="h-px w-12 bg-slate-100"></div>
            <p className="text-[9px] text-slate-500 uppercase tracking-[0.3em] font-bold">Autenticación segura vía Firebase</p>
          </div>
        </div>
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
          
          {/* Daily Task Button (Updated Design) */}
          <div className="relative">
            <button 
              onClick={() => !dailyTaskDone && setShowDailyTaskMessage(true)}
              className={cn(
                "p-2 rounded-xl transition-all border group relative",
                dailyTaskDone 
                  ? "bg-green-50 border-green-200 text-green-600 cursor-default" 
                  : "bg-white border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
              )}
              title={dailyTaskDone ? `Tarea: ${dailyTaskType}` : 'Registrar Tarea Diaria'}
            >
              {dailyTaskDone ? <CheckCircle2 className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
              {!dailyTaskDone && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
            
            {showDailyTaskMessage && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50">
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Seleccionar Tarea</h5>
                <div className="grid grid-cols-1 gap-1">
                  {(() => {
                    const techTasks = ['BASURA', 'TRAPO COMEDOR', 'TRAPO TALLER', 'ESCOBA COMEDOR', 'ESCOBA TALLER', 'DEPOSITO', 'ESCALERA', 'MICROONDAS', 'BAÑO'];
                    const recepTasks = ['BASURA', 'TRAPO SALON', 'ESCOBA SALON', 'DESAYUNADOR', 'MUEBLES', 'BAÑO'];
                    
                    let tasks = [];
                    if (userProfile?.role === 'admin') {
                      tasks = Array.from(new Set([...techTasks, ...recepTasks]));
                    } else if (userProfile?.role === 'recepcion') {
                      tasks = recepTasks;
                    } else {
                      tasks = techTasks;
                    }

                    return tasks.map(task => (
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
                            const toast = document.createElement('div');
                            toast.className = "fixed bottom-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-xl text-sm font-black z-[100] shadow-xl border border-white/20 text-center min-w-[300px]";
                            toast.innerHTML = "¡Gracias por colaborar!<br/><span class='text-xs opacity-80 font-medium mt-1 block'>Recuerda mantener el orden y la limpieza de tu área de trabajo.</span>";
                            document.body.appendChild(toast);
                            setTimeout(() => {
                              toast.style.opacity = '0';
                              toast.style.transition = 'opacity 0.5s ease';
                              setTimeout(() => toast.remove(), 500);
                            }, 5000);
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="text-left px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 rounded-lg uppercase tracking-tight"
                      >
                        {task}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
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
                onClick={() => setShowAuditoriaOriginales(true)}
                className={cn(
                  "p-2 hover:bg-slate-100 rounded-xl transition-colors relative group",
                  cards.some(c => c.originalPart && !c.originalPart.isAudited) ? "text-blue-500" : "text-slate-600"
                )}
                title="Auditoría Originales"
              >
                <ShieldCheck className="w-5 h-5" />
                {cards.some(c => c.originalPart && !c.originalPart.isAudited) && (
                  <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                )}
              </button>
              <button 
                onClick={() => setShowIncidentsManagement(true)}
                className={cn(
                  "p-2 hover:bg-slate-100 rounded-xl transition-colors relative group",
                  incidents.some(i => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    return i.createdAt?.toDate() > yesterday && i.status === 'abierta';
                  }) ? "text-red-500" : "text-slate-600"
                )}
                title="Incidencias"
              >
                <AlertTriangle className="w-5 h-5" />
                {incidents.some(i => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  return i.createdAt?.toDate() > yesterday && i.status === 'abierta';
                }) && (
                  <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                )}
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
            onClick={handleDownloadManual}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors relative group"
            title="Manual Operativo"
          >
            <FileText className="w-5 h-5" />
          </button>

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
              technicians={users.filter(u => u.role === 'tecnico' || u.role === 'admin')}
            />
          );
        })}
      </main>

      {/* Modals */}
      {activeChat && (
        <CardDetailModal 
          card={activeChat} 
          user={user} 
          userProfile={userProfile}
          onClose={() => setActiveChat(null)}
          onPausar={(comment) => handlePausar(activeChat, comment)}
          onReanudar={(comment) => handleReanudar(activeChat, comment)}
          onFinalizar={(isRepaired, comment) => handleFinalizar(activeChat, isRepaired, comment)}
          onReabrir={(comment) => handleReabrir(activeChat, comment)}
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
      {showAuditoriaOriginales && (
        <AuditoriaOriginalesModal 
          onClose={() => setShowAuditoriaOriginales(false)}
          cards={cards}
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
          allOrders={cards}
          allIncidents={incidents}
        />
      )}
      {showKPIs && (
        <KPIModal 
          onClose={() => setShowKPIs(false)}
          users={users}
          incidents={incidents}
          orders={cards}
        />
      )}

      {/* Error Boundary Placeholder */}
      <div id="error-boundary-portal" />
    </div>
  );
}
