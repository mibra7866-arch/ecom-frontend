export type ChatSenderType = 'Seller' | 'Admin';

export interface ChatMessage {
  id: number;
  sellerId: number;
  senderType: ChatSenderType;
  senderId: number;
  content: string;
  attachmentUrl: string | null;
  sentAtUtc: string;
  deliveredAtUtc: string | null;
  readAtUtc: string | null;
  editedAtUtc: string | null;
}

/** Response for POST api/chat/{sellerId}/attachment. */
export interface ChatAttachmentUploadResponse {
  url: string;
}

export type ChatMessageStatus = 'sending' | 'sent' | 'failed';

/** Client-only fields layered on top of a server message while an optimistic send is in flight. */
export interface ChatDisplayMessage extends ChatMessage {
  clientId?: string;
  status?: ChatMessageStatus;
}

export interface ChatInboxRow {
  sellerId: number;
  sellerName: string;
  storeName: string;
  lastMessagePreview: string | null;
  lastMessageAtUtc: string | null;
  unreadCount: number;
  isOnline: boolean;
  lastMessageAttachmentUrl: string | null;
}

export interface ChatPresenceEvent {
  role: ChatSenderType;
  userId: number;
  isOnline: boolean;
}

export interface ChatMessagesReadEvent {
  sellerId: number;
  lastReadMessageId: number;
  readAtUtc: string;
}

/** Body for POST api/chat/pre-login/resolve. */
export interface PreLoginChatResolveRequest {
  email: string;
}

/** found=false always carries the same generic message, whether or not the email actually belongs to a seller — this is the account-enumeration guard. */
export interface PreLoginChatResolveResponse {
  found: boolean;
  sellerId: number | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  message: string;
}

/** Result row for the shared seller search endpoint — used both by the admin Chat module's "Search sellers..." box and the Assign Order seller picker (which additionally needs email/balance/status). */
export interface SellerSearchResult {
  sellerId: number;
  name: string;
  storeName: string;
  email: string;
  balance: number;
  status: 'PendingKyc' | 'Active' | 'Suspended';
}

/** Broadcast via ChatHub after either party soft-deletes the thread — tells the OTHER party's open view to clear live. */
export interface ChatClearedEvent {
  sellerId: number;
}

/** Broadcast via ChatHub.DeleteMessage after a single message is deleted-for-everyone — distinct from ChatClearedEvent above, which wipes the whole thread. */
export interface MessageDeletedEvent {
  sellerId: number;
  messageId: number;
}
