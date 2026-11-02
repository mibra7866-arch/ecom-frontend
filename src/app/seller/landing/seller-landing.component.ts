import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-seller-landing',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './seller-landing.component.html',
  styleUrl: './seller-landing.component.scss'
})
export class SellerLandingComponent {
  readonly features = [
    { icon: 'local_shipping', title: 'Zero inventory dropshipping', text: 'List products and we handle fulfillment end to end.' },
    { icon: 'payments', title: 'Fast payouts', text: 'Withdraw your balance to your account whenever you like.' },
    { icon: 'insights', title: 'Real-time analytics', text: 'Track orders, revenue and delivery status live.' },
    { icon: 'support_agent', title: 'Dedicated support', text: 'A direct line to the MySellerStore team whenever you need help.' }
  ];
}
