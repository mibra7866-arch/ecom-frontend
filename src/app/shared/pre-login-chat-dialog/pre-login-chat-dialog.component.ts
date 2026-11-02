import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ChatService } from '../../core/services/chat.service';
import { ChatThreadComponent } from '../chat-thread/chat-thread.component';

/**
 * "Chat with support" on the seller login page. Resolves the visitor's email to their EXISTING
 * seller thread via PreLoginChatController (no separate guest thread/entity — same SellerId, same
 * ChatMessage table, same admin inbox row as their normal authenticated chat) and renders the exact
 * same ChatThreadComponent used everywhere else in the app, parameterized with the scoped token instead
 * of a real session.
 *
 * Deliberately holds NO persisted state (no sessionStorage/localStorage) — email and the resolved
 * sellerId/token live only in this component instance's signals. A previous version remembered the
 * email in sessionStorage and auto-resolved on ngOnInit, which meant a returning visitor (or anyone
 * sharing the browser) skipped the email prompt entirely and landed straight in an existing seller's
 * thread. Every fresh open of this dialog — including after a page refresh, since Angular tears down
 * and rebuilds the whole app on reload — now starts from the empty prompt, every time.
 */
@Component({
  selector: 'app-pre-login-chat-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatIconModule, ChatThreadComponent],
  templateUrl: './pre-login-chat-dialog.component.html',
  styleUrl: './pre-login-chat-dialog.component.scss'
})
export class PreLoginChatDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PreLoginChatDialogComponent>);
  private readonly chatService = inject(ChatService);

  readonly email = signal('');
  readonly resolving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly notFoundMessage = signal<string | null>(null);
  readonly resolvedSellerId = signal<number | null>(null);
  readonly accessToken = signal<string | null>(null);

  isEmailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim());
  }

  resolve(): void {
    const email = this.email().trim();
    if (!email || !this.isEmailValid() || this.resolving()) {
      return;
    }

    this.resolving.set(true);
    this.errorMessage.set(null);
    this.notFoundMessage.set(null);

    this.chatService.resolvePreLogin(email).subscribe({
      next: (res) => {
        this.resolving.set(false);
        if (res.found && res.sellerId !== null && res.accessToken) {
          this.resolvedSellerId.set(res.sellerId);
          this.accessToken.set(res.accessToken);
        } else {
          this.notFoundMessage.set(res.message);
        }
      },
      error: () => {
        this.resolving.set(false);
        this.errorMessage.set('Something went wrong. Please try again.');
      }
    });
  }

  /** Lets the visitor retype the email after a not-found response, without closing the dialog. */
  tryAnotherEmail(): void {
    this.notFoundMessage.set(null);
    this.email.set('');
  }

  close(): void {
    this.dialogRef.close();
  }
}
