import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ChatService } from '../../core/services/chat.service';
import { TokenService } from '../../core/services/token.service';
import { ChatMessage } from '../../core/models/chat.model';
import { ChatBubbleComponent, ChatBubbleTickState } from '../chat-bubble/chat-bubble.component';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../confirmation-modal/confirmation-modal.component';

const MARK_READ_DEBOUNCE_MS = 600;
const NEAR_BOTTOM_THRESHOLD_PX = 80;
const NEAR_TOP_THRESHOLD_PX = 60;
/** Caps the composer's auto-grow — beyond this it scrolls internally instead of pushing the header/history out of view. */
const MAX_COMPOSER_HEIGHT_PX = 120;

/**
 * Reused as-is for three hosts: the authenticated seller Chat page, the admin Chat panel, AND the
 * pre-login "Chat with support" panel on the login page (via PreLoginChatDialogComponent) — the last
 * one passes accessTokenOverride (from PreLoginChatController's scoped token) instead of relying on a
 * real TokenService session, since a not-yet-authenticated visitor has none. Same sellerId either way —
 * there's no separate guest thread, so history/inbox naturally stay unified.
 */
@Component({
  selector: 'app-chat-thread',
  standalone: true,
  imports: [MatIconModule, MatDialogModule, ChatBubbleComponent],
  templateUrl: './chat-thread.component.html',
  styleUrl: './chat-thread.component.scss'
})
export class ChatThreadComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly tokenService = inject(TokenService);
  private readonly dialog = inject(MatDialog);
  private readonly ngZone = inject(NgZone);

  @Input({ required: true }) sellerId!: number;
  /** Shown next to the presence dot — "Support team" on the seller side, the seller's name on the admin side. */
  @Input() counterpartLabel = 'Support team';
  /** Set only by the pre-login chat panel — see class doc. Omit for the normal authenticated path. */
  @Input() accessTokenOverride?: string;

  @ViewChild('scrollContainer') private scrollContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('draftInput') private draftInputRef?: ElementRef<HTMLTextAreaElement>;

  readonly messages = this.chatService.messages;
  readonly presence = this.chatService.presence;
  readonly loadingHistory = this.chatService.loadingHistory;
  readonly hasMoreHistory = this.chatService.hasMoreHistory;

  readonly draft = signal('');
  readonly sending = signal(false);
  readonly pendingFile = signal<File | null>(null);
  readonly pendingFilePreviewUrl = signal<string | null>(null);
  readonly attachmentError = signal<string | null>(null);

  readonly pendingFileIsImage = computed(() => (this.pendingFile()?.type ?? '').startsWith('image/'));

  // Matches the backend's FileValidationRules.ChatAttachment — any image (regardless of extension),
  // plus these common document types. Non-image files are matched by extension since File.type isn't
  // always populated reliably by the browser for less common document mime types.
  private static readonly MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
  private static readonly ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
  /** TokenService has no session in the pre-login case — falls back to 'Seller' whenever accessTokenOverride is set, since that's exactly what it always stands in for. */
  readonly myRole = computed(() => this.tokenService.claims().role ?? (this.accessTokenOverride ? 'Seller' : null));
  readonly isReconnecting = computed(() => {
    const state = this.chatService.connectionState();
    return state === HubConnectionState.Reconnecting || state === HubConnectionState.Connecting;
  });

  private nearBottom = true;
  private lastMessageCount = 0;
  private markReadTimer: ReturnType<typeof setTimeout> | null = null;
  /** See onComposerBeforeInput's doc comment — tracked independently of the Enter keydown check since
   * some mobile keyboards never fire a real keydown for Enter itself. */
  private shiftHeld = false;
  private removeScrollListener: (() => void) | null = null;

  /** Touch devices have no Shift key, so Enter is the ONLY key on the composer — it must insert a
   * newline there (tapping the keyboard's return key otherwise sent the message every time, with no way
   * to type a second line). Desktop keeps Enter-to-send/Shift+Enter-for-newline unchanged; only this
   * check differs between the two. `pointer: coarse` matches the touchscreen phones/tablets this needs
   * to fix, not a viewport-width breakpoint, so it stays correct regardless of window size. */
  private readonly isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  private readonly messagesEffect = effect(() => {
    const list = this.messages();
    if (list.length > this.lastMessageCount && this.nearBottom) {
      queueMicrotask(() => this.scrollToBottom());
    }
    this.lastMessageCount = list.length;
    this.scheduleMarkAsRead();
  });

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['sellerId'] || changes['accessTokenOverride']) && this.sellerId) {
      this.lastMessageCount = 0;
      this.nearBottom = true;
      void this.chatService.connect(this.sellerId, this.accessTokenOverride).then(() => queueMicrotask(() => this.scrollToBottom(true)));
    }
  }

  /** Attached as a plain native listener OUTSIDE Angular's zone (not the usual `(scroll)` template
   * binding) — a scroll event fires on every animation frame during a touch-scroll gesture, and Angular
   * zone-patches addEventListener so each one would otherwise trigger a full change-detection pass. On
   * a phone that's enough main-thread work to visibly stall the scroll itself, which is what "have to
   * swipe 3-4 times before it moves" actually was: not real network/render lag, just CD running so often
   * during the gesture that the browser had no room left to keep compositing frames smoothly. Nothing
   * about scroll behavior/design changes — this only stops it from also running Angular's CD every frame. */
  ngAfterViewInit(): void {
    const el = this.scrollContainerRef?.nativeElement;
    if (!el) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const handler = () => this.handleScroll(el);
      el.addEventListener('scroll', handler, { passive: true });
      this.removeScrollListener = () => el.removeEventListener('scroll', handler);
    });
  }

  ngOnDestroy(): void {
    this.removeScrollListener?.();
    if (this.markReadTimer) {
      clearTimeout(this.markReadTimer);
    }
    this.setPendingFile(null);
    // The pre-login guest widget's connection is a scoped, short-lived identity that must not outlive
    // the dialog (and must not be reused if the visitor then logs in for real) — that one case still
    // needs the full teardown. Every other host (seller Chat page, admin Chat panel) only leaves the
    // THREAD; the shared connection underneath stays up for the rest of the app's other live listeners
    // (notifications, order/balance updates, ...) — see ChatService.leaveThread's doc comment.
    if (this.accessTokenOverride) {
      void this.chatService.disconnect();
    } else {
      void this.chatService.leaveThread();
    }
  }

  /** Runs outside Angular's zone (see ngAfterViewInit) — nearBottom is a plain field, not a signal, so
   * updating it here needs no change detection; it's only ever read later from inside messagesEffect,
   * which already runs its own CD when the messages signal changes. Loading older history is the one
   * branch that actually needs to update the UI, so it explicitly re-enters the zone just for that. */
  private handleScroll(el: HTMLDivElement): void {
    this.nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;

    if (el.scrollTop < NEAR_TOP_THRESHOLD_PX && this.hasMoreHistory() && !this.loadingHistory()) {
      const previousHeight = el.scrollHeight;
      this.ngZone.run(() => {
        void this.chatService.loadOlderMessages().then(() => {
          queueMicrotask(() => {
            el.scrollTop = el.scrollHeight - previousHeight;
          });
        });
      });
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allows re-selecting the same file after removing it
    if (!file) {
      return;
    }

    this.attachmentError.set(null);

    const isImage = file.type.startsWith('image/');
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isAllowedDocument = ChatThreadComponent.ALLOWED_DOCUMENT_EXTENSIONS.includes(extension);
    if (!isImage && !isAllowedDocument) {
      this.attachmentError.set('Please choose an image, PDF, Word, Excel, or text file.');
      return;
    }

    this.attachAfterSizeCheck(file);
  }

  /** Pasting an image (Ctrl/Cmd+V) while the composer is focused attaches it exactly like picking it via
   * the file button — same pendingFile preview, same size limit, same send pipeline. Only images are
   * handled here (a clipboard paste never carries a document file the way a file picker can), so a
   * plain text paste (or one with no image on the clipboard) falls through to the textarea's normal
   * paste-as-text behavior untouched. */
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }

    const imageItem = Array.from(items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    this.attachmentError.set(null);
    this.attachAfterSizeCheck(file);
  }

  private attachAfterSizeCheck(file: File): void {
    if (file.size > ChatThreadComponent.MAX_ATTACHMENT_BYTES) {
      this.attachmentError.set('File must be 15 MB or smaller.');
      return;
    }

    this.setPendingFile(file);
  }

  removeAttachment(): void {
    this.setPendingFile(null);
  }

  onDraftInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    this.autoGrowComposer(el);
  }

  /** Enter sends (existing behavior, preserved on desktop); Shift+Enter inserts a newline instead — the
   * default textarea behavior for Shift+Enter, so it's left alone (no preventDefault) while plain Enter
   * is intercepted so it never reaches the textarea as a literal line break. isComposing is skipped so
   * confirming an IME candidate (Chinese/Japanese/Korean input) with Enter doesn't also send the
   * message. On a touch device (see isCoarsePointer) this bails out entirely — there's no Shift key
   * there, so Enter must always insert a newline; the Send button is the only way to send. */
  onComposerKeydown(event: KeyboardEvent): void {
    if (this.isCoarsePointer) {
      return;
    }
    if (event.key === 'Shift') {
      this.shiftHeld = true;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  onComposerKeyup(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.shiftHeld = false;
    }
  }

  /** Desktop-only mobile fallback for onComposerKeydown above: some virtual keyboards (notably
   * Android/Gboard while composing) never deliver a real keydown for Enter — it comes through as key
   * "Unidentified" — so the check above silently misses it and the browser falls through to actually
   * inserting a line break. beforeinput's `insertLineBreak` fires for every Enter regardless of how the
   * keyboard reported it, so catching it here (gated on the Shift key's own separately-tracked state,
   * since Shift itself isn't part of IME composition and still fires normal key events) keeps
   * Enter-to-send working there too. Never double-sends on a normal desktop keydown: preventDefault() in
   * onComposerKeydown already stops the browser from producing this event at all for that same
   * keystroke. Skipped entirely on a touch device, same reason as onComposerKeydown above. */
  onComposerBeforeInput(event: InputEvent): void {
    if (this.isCoarsePointer) {
      return;
    }
    if (event.inputType === 'insertLineBreak' && !this.shiftHeld) {
      event.preventDefault();
      this.send();
    }
  }

  private autoGrowComposer(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`;
  }

  send(): void {
    const text = this.draft().trim();
    const file = this.pendingFile();
    if ((!text && !file) || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.attachmentError.set(null);
    this.draft.set('');
    this.setPendingFile(null);

    // Reset the DOM textarea directly (rather than waiting on the next [value] binding refresh) so the
    // composer visibly shrinks back to one row the instant the message is sent.
    const el = this.draftInputRef?.nativeElement;
    if (el) {
      el.value = '';
      this.autoGrowComposer(el);
    }

    void this.sendWithOptionalAttachment(text, file).finally(() => this.sending.set(false));
  }

  private async sendWithOptionalAttachment(text: string, file: File | null): Promise<void> {
    let attachmentUrl: string | undefined;
    if (file) {
      try {
        attachmentUrl = await this.chatService.uploadAttachment(this.sellerId, file, this.accessTokenOverride);
      } catch {
        this.attachmentError.set('Failed to upload file. Please try again.');
        this.draft.set(text); // give the caption back so nothing is lost
        const el = this.draftInputRef?.nativeElement;
        if (el) {
          el.value = text;
          this.autoGrowComposer(el);
        }
        return;
      }
    }

    await this.chatService.sendMessage(text, attachmentUrl);
  }

  private setPendingFile(file: File | null): void {
    const previousUrl = this.pendingFilePreviewUrl();
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    this.pendingFile.set(file);
    this.pendingFilePreviewUrl.set(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  }

  isMine(senderType: string): boolean {
    return senderType === this.myRole();
  }

  /** Gates the chat-bubble edit/delete menu — a real, own, not-yet-deleted message only (an optimistic
   * `id: -1` entry hasn't reached the server yet, so there's nothing to edit/delete there). Deliberately
   * NOT `accessTokenOverride`-gated separately: the pre-login guest role never matches isOwnMessage's
   * "Seller" check against a real seller's own messages anyway (see ChatBubbleComponent's `actionable`
   * doc comment for the one host where this always ends up false). */
  canManage(message: ChatMessage): boolean {
    return message.id > 0 && this.chatService.isOwnMessage(message);
  }

  editMessage(message: ChatMessage, content: string): void {
    void this.chatService.editMessage(message.id, content);
  }

  /** Same confirmation-modal convention as deleteChat() above, scaled down for a single message. */
  deleteMessage(message: ChatMessage): void {
    this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data: {
          title: 'Delete message',
          message: 'This deletes the message for everyone in this conversation. This cannot be undone.',
          variant: 'red',
          confirmLabel: 'Delete message',
          icon: 'delete_outline'
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          void this.chatService.deleteMessage(message.id);
        }
      });
  }

  /** Shared by every host (seller portal, admin panel, pre-login widget) — reuses the same confirmation modal as every other destructive action in the app rather than a bespoke dialog. */
  deleteChat(): void {
    this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data: {
          title: 'Delete conversation',
          message: 'This clears the entire conversation for both sides. This cannot be undone.',
          variant: 'red',
          confirmLabel: 'Delete chat',
          icon: 'delete_forever'
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        void this.chatService.deleteChat(this.sellerId, this.accessTokenOverride);
      });
  }

  tickState(message: { status?: string; deliveredAtUtc: string | null; readAtUtc: string | null }): ChatBubbleTickState {
    if (message.status === 'sending') {
      return 'sending';
    }
    if (message.readAtUtc) {
      return 'read';
    }
    if (message.deliveredAtUtc) {
      return 'delivered';
    }
    return 'sent';
  }

  private scheduleMarkAsRead(): void {
    if (this.markReadTimer) {
      clearTimeout(this.markReadTimer);
    }
    this.markReadTimer = setTimeout(() => {
      const last = this.messages().at(-1);
      if (last && last.id > 0) {
        void this.chatService.markAsRead(last.id);
      }
    }, MARK_READ_DEBOUNCE_MS);
  }

  private scrollToBottom(force = false): void {
    const el = this.scrollContainerRef?.nativeElement;
    if (!el || (!this.nearBottom && !force)) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }
}
