import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { ChatService } from '../../../core/services/chat.service';
import { SellerOrdersService } from '../../../core/services/seller-orders.service';
import { OrderStatus, SellerOrderListItemDto } from '../../../core/models/order.model';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { sellerOrderStatusClass, sellerOrderStatusLabel } from '../../../shared/utils/seller-order-status';

/** The real order-fulfillment lifecycle, from payment through delivery — 1:1 with the 5 real
 * OrderStatus values from Accepted onward. Cancelled isn't part of this chain (it only ever branches
 * from Assigned, before any of these steps are reached), so it's handled as its own terminal state. */
const STEPPER_STEPS = ['Paid', 'Pickup', 'On the way', 'Out for delivery', 'Delivered'] as const;
const STEPPER_REACHED: Partial<Record<OrderStatus, number>> = {
  Accepted: 1,
  Completed: 2,
  OnTheWay: 3,
  OutForDelivery: 4,
  Delivered: 5
};

@Component({
  selector: 'app-seller-order-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './seller-order-detail.component.html',
  styleUrl: './seller-order-detail.component.scss'
})
export class SellerOrderDetailComponent implements OnInit {
  private readonly ordersService = inject(SellerOrdersService);
  private readonly chatService = inject(ChatService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imagePreview = inject(ImagePreviewService);

  private orderId = 0;
  private readonly onOrderUpdated = (updated: SellerOrderListItemDto) => {
    if (updated.id === this.orderId) {
      this.order.set(updated);
    }
  };

  readonly order = signal<SellerOrderListItemDto | null>(null);
  readonly loading = signal(true);
  readonly accepting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly insufficientBalance = signal(false);
  readonly stepperSteps = STEPPER_STEPS;

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    this.load();

    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onOrderUpdated);
    });

    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('OrderUpdated', this.onOrderUpdated);
    });
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.ordersService.get(this.orderId).subscribe({
      next: (res) => {
        this.order.set(res.order);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load this order.');
        this.loading.set(false);
      }
    });
  }

  accept(): void {
    if (this.accepting()) {
      return;
    }

    this.accepting.set(true);
    this.errorMessage.set(null);
    this.insufficientBalance.set(false);
    this.ordersService.accept(this.orderId).subscribe({
      next: (res) => {
        this.order.set(res.order);
        this.accepting.set(false);
      },
      error: (err) => {
        // A 409 (already accepted, e.g. a second open tab) still carries the real current state in
        // its body — reflect it rather than just showing a generic error.
        if (err.status === 409 && err.error?.order) {
          this.order.set(err.error.order);
        } else {
          this.errorMessage.set(err.error?.error ?? 'Failed to accept this order.');
          this.insufficientBalance.set(err.error?.errorCode === 'INSUFFICIENT_BALANCE');
        }
        this.accepting.set(false);
      }
    });
  }

  back(): void {
    this.router.navigateByUrl('/seller/orders');
  }

  goToTopUp(): void {
    this.router.navigateByUrl('/seller/topup');
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(): void {
    const order = this.order();
    if (order?.productImageUrl) {
      this.imagePreview.open(this.fileUrl(order.productImageUrl), order.productName);
    }
  }

  statusLabel(order: SellerOrderListItemDto): string {
    return sellerOrderStatusLabel(order.status);
  }

  statusClass(order: SellerOrderListItemDto): string {
    return sellerOrderStatusClass(order.status);
  }

  shippingAddress(order: SellerOrderListItemDto): string {
    const parts = [order.maskedAddressLine1, order.maskedAddressLine2, order.maskedCity, order.maskedZipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  }

  /** 0 = nothing reached yet (still Unpaid) — also what a Cancelled order returns, though the template
   * never renders the stepper for that status at all. */
  stepperReached(order: SellerOrderListItemDto): number {
    return STEPPER_REACHED[order.status] ?? 0;
  }
}
