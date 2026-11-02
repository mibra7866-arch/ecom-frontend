import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { environment } from '../../../environments/environment';
import { ImagePreviewService } from '../image-preview/image-preview.service';
import { isImageUrl } from '../utils/file-type.util';

export type ChatBubbleTickState = 'sending' | 'sent' | 'delivered' | 'read';

/**
 * Pure presentational message bubble, extracted from ChatThreadComponent so the pre-login
 * GuestChatPanelComponent can render messages identically without duplicating the markup/styling —
 * this component has no service dependency on ChatService (it only ever emits what the user asked for,
 * never calls ChatService itself — the host owns confirming/persisting edit/delete), though it does use
 * the shared ImagePreviewService for its own attachment thumbnails, the same lightbox every other image
 * in the app now opens through.
 */
@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [MatIconModule, MatMenuModule],
  templateUrl: './chat-bubble.component.html',
  styleUrl: './chat-bubble.component.scss'
})
export class ChatBubbleComponent {
  private readonly imagePreview = inject(ImagePreviewService);

  @Input({ required: true }) content = '';
  @Input() attachmentUrl: string | null = null;
  @Input({ required: true }) sentAtUtc = '';
  @Input() editedAtUtc: string | null = null;
  @Input() mine = false;
  /** Omitted (undefined) for messages that never show delivery ticks — e.g. a guest visitor's own messages, which have no read-receipt concept. */
  @Input() tickState?: ChatBubbleTickState;
  /** Whether the edit/delete menu may render at all for this bubble — the host is expected to pass
   * `mine && <real, own, not-deleted message>` (see ChatThreadComponent.canManage). Defaults true since
   * every current host (seller, admin, and the pre-login guest panel — its "PreLoginChat" hub role maps
   * 1:1 to a normal Seller for EditMessage/DeleteMessage, per ChatHub.GetCallerIdentity) can manage its
   * own messages the same way. */
  @Input() actionable = true;

  @Output() editMessage = new EventEmitter<string>();
  @Output() deleteMessage = new EventEmitter<void>();

  readonly isEditing = signal(false);
  readonly draft = signal('');

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  startEdit(): void {
    this.draft.set(this.content);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }

  confirmEdit(): void {
    const trimmed = this.draft().trim();
    this.isEditing.set(false);
    if (!trimmed || trimmed === this.content) {
      return;
    }
    this.editMessage.emit(trimmed);
  }

  requestDelete(): void {
    this.deleteMessage.emit();
  }

  fileUrl(attachmentUrl: string): string {
    return `${environment.filesBaseUrl}${attachmentUrl}`;
  }

  isImageAttachment(attachmentUrl: string): boolean {
    return isImageUrl(attachmentUrl);
  }

  /** Opens the attachment in the shared lightbox instead of a new browser tab — a non-image attachment
   * still isn't reachable from here (see the template's file-card branch, which keeps its own plain
   * download link since there's nothing to preview). */
  openAttachment(attachmentUrl: string): void {
    this.imagePreview.open(this.fileUrl(attachmentUrl), 'Attached image');
  }

  /** FileStorageService stores files as {guid}_{originalFileName} — strip the guid prefix back off for display. */
  attachmentFileName(attachmentUrl: string): string {
    const lastSegment = attachmentUrl.slice(attachmentUrl.lastIndexOf('/') + 1);
    const underscoreIndex = lastSegment.indexOf('_');
    return underscoreIndex === -1 ? lastSegment : lastSegment.slice(underscoreIndex + 1);
  }
}
