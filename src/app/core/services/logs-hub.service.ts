import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { ActivityLogEvent } from '../models/activity-log.model';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class LogsHubService {
  private readonly tokenService = inject(TokenService);
  private connection: signalR.HubConnection | null = null;

  readonly events = signal<ActivityLogEvent[]>([]);
  readonly connected = signal(false);

  connect(): void {
    if (this.connection) {
      return;
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: () => this.tokenService.accessToken() ?? ''
      })
      .withAutomaticReconnect()
      .build();

    this.connection.on('logEvent', (event: ActivityLogEvent) => {
      this.events.update((current) => [event, ...current].slice(0, 100));
    });

    this.connection.onreconnected(() => this.connected.set(true));
    this.connection.onclose(() => this.connected.set(false));

    this.connection
      .start()
      .then(() => this.connected.set(true))
      .catch((err) => console.error('SignalR connection failed', err));
  }

  disconnect(): void {
    this.connection?.stop();
    this.connection = null;
    this.connected.set(false);
  }
}
