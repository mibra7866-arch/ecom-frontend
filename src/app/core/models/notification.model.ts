/**
 * Named AppNotification (not Notification) to avoid colliding with the built-in DOM Notification type.
 * Type is a plain string key, not a closed union — new backend notification types need no frontend
 * model change, only a new entry in NOTIFICATION_ICONS (see notification-bell.component.ts).
 */
export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAtUtc: string;
}

export interface AppNotificationPage {
  items: AppNotification[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
