import { Component, Input, computed, signal } from '@angular/core';

const GREEN = new Set(['Active', 'Approved', 'Delivered', 'Paid', 'Closed', 'Completed']);
const AMBER = new Set(['PendingKyc', 'Pending', 'AwaitingVerification', 'Open', 'InTransit']);
// "In progress/assigned" equivalents — a seller has been picked (or has accepted and is mid-countdown)
// but the thing hasn't resolved yet, distinct from the still-amber "not started" Pending.
const BLUE = new Set(['Assigned', 'Accepted']);

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="status-badge" [class.status-badge--green]="tone() === 'green'" [class.status-badge--amber]="tone() === 'amber'" [class.status-badge--blue]="tone() === 'blue'" [class.status-badge--red]="tone() === 'red'">{{ label() }}</span>`,
  styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
  private readonly statusSignal = signal('');

  @Input({ required: true }) set status(value: string) {
    this.statusSignal.set(value);
  }

  readonly label = computed(() => this.statusSignal().replace(/([a-z])([A-Z])/g, '$1 $2'));

  readonly tone = computed<'green' | 'amber' | 'blue' | 'red'>(() => {
    const value = this.statusSignal();
    if (GREEN.has(value)) return 'green';
    if (AMBER.has(value)) return 'amber';
    if (BLUE.has(value)) return 'blue';
    return 'red';
  });
}
