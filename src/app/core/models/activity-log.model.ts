export type ActorType = 'Admin' | 'Seller' | 'System';

export interface ActivityLogEvent {
  id: number;
  actorType: ActorType;
  actorId: number | null;
  action: string;
  metadata: unknown;
  createdAt: string;
}
