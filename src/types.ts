import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'recepcion' | 'tecnico';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role: UserRole;
}

export interface Board {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Timestamp;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  order: number;
}

export interface Card {
  id: string;
  columnId: string;
  boardId: string;
  title: string;
  description: string;
  order: number;
  lastMessageAt?: Timestamp;
  assignedTechnicianId?: string | null;
  assignedTechnicianName?: string | null;
  tags?: string[];
  createdAt: Timestamp;
  currentStep: 'recepcion' | 'taller' | 'reparacion' | 'espera' | 'finalizada';
  finalizedAt?: Timestamp;
  isRepaired?: boolean;
  closingComment?: string;
  returnToStep?: string;
  history?: Array<{
    step: string;
    timestamp: Timestamp;
    userId: string;
    userName: string;
    comment?: string;
  }>;
}

export interface Incident {
  id: string;
  type: 'garantia' | 'recepcion' | 'taller';
  orderNumber: string;
  referenceOrderNumber?: string;
  reportedBy: string;
  reportedByName: string;
  technicianId?: string;
  technicianName?: string;
  repairTechnicianId?: string;
  repairTechnicianName?: string;
  description: string;
  status: 'abierta' | 'en_revision' | 'resuelta';
  createdAt: Timestamp;
}

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  reason: string;
  justified: boolean;
  note?: string;
  createdAt: Timestamp;
}

export interface DailyTask {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  taskType: 'BASURA' | 'TRAPO TALLER' | 'TRAPO COMEDOR' | 'ESCOBA TALLER' | 'ESCOBA COMEDOR' | 'MICROONDAS' | 'ESCALERA';
  createdAt: Timestamp;
}

export interface Message {
  id: string;
  cardId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp;
}

export interface UserReadStatus {
  id: string;
  userId: string;
  cardId: string;
  lastReadAt: Timestamp;
}
