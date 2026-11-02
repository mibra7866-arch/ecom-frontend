import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';
import { SellerDashboardService } from '../../core/services/seller-dashboard.service';
import { SellerDashboardSummaryDto } from '../../core/models/seller-dashboard.model';
import { StageUpdatedEvent } from '../../core/models/realtime.model';

@Component({
  selector: 'app-seller-progress',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './seller-progress.component.html',
  styleUrl: './seller-progress.component.scss'
})
export class SellerProgressComponent implements OnInit, OnDestroy {
  private readonly sellerDashboardService = inject(SellerDashboardService);
  private readonly chatService = inject(ChatService);
  private readonly router = inject(Router);

  readonly summary = signal<SellerDashboardSummaryDto | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
    this.chatService.getConnection().on('StageUpdated', this.onStageUpdated);
  }

  ngOnDestroy(): void {
    this.chatService.getConnection().off('StageUpdated', this.onStageUpdated);
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.sellerDashboardService.getSummary().subscribe({
      next: (res) => {
        this.summary.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to load progress data.');
        this.loading.set(false);
      }
    });
  }

  goToProducts(): void {
    this.router.navigateByUrl('/seller/dashboard');
  }

  goToOrders(): void {
    this.router.navigateByUrl('/seller/orders');
  }

  productSetupPercent(s: SellerDashboardSummaryDto): number {
    return s.requiredProductCount > 0 ? Math.min(100, Math.round((s.totalProducts / s.requiredProductCount) * 100)) : 100;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  stagePercent(s: SellerDashboardSummaryDto): number {
    const required = s.stageProgress.requiredCompletions;
    if (!required) {
      return 0;
    }
    return Math.min(100, Math.round((s.stageProgress.completedInCurrentStage / required) * 100));
  }

  private readonly onStageUpdated = (event: StageUpdatedEvent): void => {
    const current = this.summary();
    if (!current) {
      return;
    }
    this.summary.set({
      ...current,
      stageProgress: {
        ...current.stageProgress,
        currentStageNumber: event.currentStageNumber,
        completedInCurrentStage: event.completedInCurrentStage
      }
    });
    // Amounts for the new stage aren't in the push payload — refresh to pick up the new range.
    this.load();
  };
}
