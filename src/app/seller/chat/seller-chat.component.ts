import { Component, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ChatService } from '../../core/services/chat.service';
import { TokenService } from '../../core/services/token.service';
import { ChatThreadComponent } from '../../shared/chat-thread/chat-thread.component';

@Component({
  selector: 'app-seller-chat',
  standalone: true,
  imports: [ChatThreadComponent, MatIconModule],
  templateUrl: './seller-chat.component.html',
  styleUrl: './seller-chat.component.scss'
})
export class SellerChatComponent implements OnInit {
  private readonly chatService = inject(ChatService);
  readonly tokenService = inject(TokenService);

  ngOnInit(): void {
    // Opening the thread marks everything read (ChatThreadComponent debounces MarkAsRead on connect),
    // so the sidebar badge can clear immediately rather than waiting on a refetch.
    this.chatService.unreadCount.set(0);
  }
}
