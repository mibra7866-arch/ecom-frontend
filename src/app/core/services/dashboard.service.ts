import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardSummaryDto, RevenuePointDto } from '../models/dashboard.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  getSummary(): Observable<DashboardSummaryDto> {
    return this.api.get<DashboardSummaryDto>('admin/dashboard/summary');
  }

  getRevenue(range: string): Observable<RevenuePointDto[]> {
    return this.api.get<RevenuePointDto[]>('admin/dashboard/revenue', { range });
  }
}
