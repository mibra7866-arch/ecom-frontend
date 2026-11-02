import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './pager.component.html',
  styleUrl: './pager.component.scss'
})
export class PagerComponent {
  @Input() page = 1;
  @Input() totalPages = 0;
  @Input() totalCount = 0;

  @Output() pageChange = new EventEmitter<number>();

  previous(): void {
    if (this.page > 1) {
      this.pageChange.emit(this.page - 1);
    }
  }

  next(): void {
    if (this.page < this.totalPages) {
      this.pageChange.emit(this.page + 1);
    }
  }
}
