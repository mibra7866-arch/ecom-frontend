import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-auth-card',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './auth-card.component.html',
  styleUrl: './auth-card.component.scss'
})
export class AuthCardComponent {
  @Input() icon = 'lock';
  @Input() title = '';
  @Input() subtitle = '';
}
