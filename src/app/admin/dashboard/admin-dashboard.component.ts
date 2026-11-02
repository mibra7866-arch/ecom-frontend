import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChatService } from '../../core/services/chat.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { DashboardSummaryDto, RevenuePointDto } from '../../core/models/dashboard.model';
import { StatCardComponent } from '../../shared/stat-card/stat-card.component';
import { RevenueChartComponent } from './revenue-chart/revenue-chart.component';
import { ActivityLogComponent } from './activity-log/activity-log.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, StatCardComponent, RevenueChartComponent, ActivityLogComponent],
  // chart.js/ng2-charts is only ever used by RevenueChartComponent below, but provideCharts() used to
  // be registered in the app-wide root providers (app.config.ts) — since that file's providers are
  // all eagerly bundled into the initial chunk, EVERY seller on mobile was downloading and parsing the
  // charting library on login even though the seller portal has no charts at all. Registering it here
  // instead scopes it to this component's own lazy route chunk, so it's only fetched when an admin
  // actually opens the admin dashboard.
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);

  readonly summary = signal<DashboardSummaryDto | null>(null);
  readonly revenue = signal<RevenuePointDto[]>([]);
  readonly loading = signal(true);
  readonly bannerDismissed = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // Order/balance-affecting actions anywhere in the marketplace change these platform-wide totals,
  // none of which have their own dedicated live event — a quiet re-fetch (no loading spinner) on
  // either push keeps the summary current, same pattern SellerDashboardComponent uses for its own totals.
  private readonly onLiveUpdate = () => this.refreshSummary();

  ngOnInit(): void {
    this.dashboardService.getSummary().subscribe({
      next: (res) => {
        this.summary.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load dashboard summary.');
        this.loading.set(false);
      }
    });

    this.dashboardService.getRevenue('7d').subscribe({
      next: (res) => this.revenue.set(res),
      error: () => this.errorMessage.set('Failed to load revenue data.')
    });

    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onLiveUpdate);
      this.chatService.getConnection().on('BalanceUpdated', this.onLiveUpdate);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('OrderUpdated', this.onLiveUpdate);
      this.chatService.getConnection().off('BalanceUpdated', this.onLiveUpdate);
    });
  }

  private refreshSummary(): void {
    this.dashboardService.getSummary().subscribe({
      next: (res) => this.summary.set(res),
      error: () => {
        // Live refresh failures degrade to the last known snapshot.
      }
    });
  }

  formatCurrency(value: number | undefined): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
  }
}
