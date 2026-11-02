import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss'
})
export class StatCardComponent {
  @Input() icon = 'insights';
  @Input() label = '';
  @Input() value = '';
  @Input() featured = false;
  @Input() live = false;
  @Input() accent: 'indigo' | 'amber' | 'green' = 'indigo';
}
