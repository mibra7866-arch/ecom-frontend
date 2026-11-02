import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../../environments/environment';
import { SellerOrderListItemDto } from '../../../core/models/order.model';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { sellerOrderStatusClass, sellerOrderStatusLabel } from '../../../shared/utils/seller-order-status';

/**
 * Horizontal row card — thumbnail, name/date/qty, amount/profit, and a status pill + chevron on
 * their own row underneath. The whole row is the click target, opening SellerOrderDetailComponent,
 * same destination the old table row's click used to go to; the chevron is a visual "there's more"
 * affordance, not a separate inline-expand control.
 */
@Component({
  selector: 'app-seller-order-card',
  standalone: true,
  imports: [DatePipe, MatIconModule],
  templateUrl: './seller-order-card.component.html',
  styleUrl: './seller-order-card.component.scss'
})
export class SellerOrderCardComponent {
  private readonly imagePreview = inject(ImagePreviewService);

  @Input({ required: true }) order!: SellerOrderListItemDto;
  @Output() open = new EventEmitter<SellerOrderListItemDto>();

  onOpen(): void {
    this.open.emit(this.order);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event): void {
    event.stopPropagation();
    if (this.order.productImageUrl) {
      this.imagePreview.open(this.fileUrl(this.order.productImageUrl), this.order.productName);
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  statusLabel(): string {
    return sellerOrderStatusLabel(this.order.status);
  }

  statusClass(): string {
    return sellerOrderStatusClass(this.order.status);
  }
}
