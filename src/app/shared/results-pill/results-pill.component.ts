import { Component, Input } from '@angular/core';

/**
 * "RESULTS {count}" pill for admin list-screen headers. Written as the one canonical version rather
 * than something the KYC screen invents locally — no other screen had this yet to literally reuse,
 * so this is the version future screens (Sellers, Withdrawals, ...) should reuse instead of copying.
 */
@Component({
  selector: 'app-results-pill',
  standalone: true,
  template: `<span class="results-pill">RESULTS <strong>{{ count }}</strong></span>`,
  styleUrl: './results-pill.component.scss'
})
export class ResultsPillComponent {
  @Input({ required: true }) count = 0;
}
