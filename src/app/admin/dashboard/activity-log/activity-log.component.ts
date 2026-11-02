import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { LogsHubService } from '../../../core/services/logs-hub.service';

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [DatePipe, MatIconModule],
  templateUrl: './activity-log.component.html',
  styleUrl: './activity-log.component.scss'
})
export class ActivityLogComponent implements OnInit, OnDestroy {
  readonly logsHub = inject(LogsHubService);

  ngOnInit(): void {
    this.logsHub.connect();
  }

  ngOnDestroy(): void {
    this.logsHub.disconnect();
  }
}
