import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { RevenuePointDto } from '../../../core/models/dashboard.model';

@Component({
  selector: 'app-revenue-chart',
  standalone: true,
  imports: [BaseChartDirective],
  templateUrl: './revenue-chart.component.html',
  styleUrl: './revenue-chart.component.scss'
})
export class RevenueChartComponent implements OnChanges {
  @Input() points: RevenuePointDto[] = [];

  chartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  readonly chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: { color: '#64748b' },
        grid: { color: 'rgba(15,23,42,0.06)' }
      },
      y: {
        ticks: { color: '#64748b' },
        grid: { color: 'rgba(15,23,42,0.08)' },
        beginAtZero: true
      }
    }
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['points']) {
      this.chartData = {
        labels: this.points.map((p) => p.date),
        datasets: [
          {
            data: this.points.map((p) => p.revenue),
            label: 'Revenue',
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            pointBackgroundColor: '#6366f1',
            pointRadius: 3,
            fill: true,
            tension: 0.35
          }
        ]
      };
    }
  }
}
