import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ChatService } from '../../../core/services/chat.service';
import { OrdersService } from '../../../core/services/orders.service';
import { SellerSearchResult } from '../../../core/models/chat.model';
import { Product } from '../../../core/models/product.model';

export interface ProductAssignDialogData {
  product: Product;
}

/**
 * "Assign Order" from a product card — combines what the Orders module does as two explicit steps
 * (Create Order, then Assign to Seller) into one action: creates a Pending order for this product,
 * then immediately assigns it to the chosen seller, using the exact same two endpoints
 * OrdersService.create/assign already expose (no new backend surface). Reuses the same seller-search
 * endpoint (now carrying Email/Balance/Status) as the Orders module's OrderAssignDialogComponent.
 */
@Component({
  selector: 'app-product-assign-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './product-assign-dialog.component.html',
  styleUrl: './product-assign-dialog.component.scss'
})
export class ProductAssignDialogComponent implements OnInit {
  private readonly chatService = inject(ChatService);
  private readonly ordersService = inject(OrdersService);
  private readonly dialogRef = inject(MatDialogRef<ProductAssignDialogComponent>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();
  readonly data = inject<ProductAssignDialogData>(MAT_DIALOG_DATA);

  readonly query = signal('');
  readonly results = signal<SellerSearchResult[]>([]);
  readonly searching = signal(false);
  readonly assigningId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.searchInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          if (!term.trim()) {
            this.searching.set(false);
            return [];
          }
          this.searching.set(true);
          return this.chatService.searchSellers(term);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (res) => {
          this.searching.set(false);
          this.results.set(res);
        },
        error: () => this.searching.set(false)
      });
  }

  onSearchInput(value: string): void {
    this.query.set(value);
    this.searchInput$.next(value);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  assign(seller: SellerSearchResult): void {
    if (this.assigningId() !== null || seller.status !== 'Active') {
      return;
    }

    this.assigningId.set(seller.sellerId);
    this.errorMessage.set(null);

    this.ordersService.create({ productId: this.data.product.id }).subscribe({
      next: (order) => {
        this.ordersService.assign(order.id, { sellerId: seller.sellerId }).subscribe({
          next: () => {
            this.successMessage.set(`Order #${order.id} assigned to ${seller.name}.`);
            this.assigningId.set(null);
            setTimeout(() => this.dialogRef.close(true), 1200);
          },
          error: (err) => {
            this.errorMessage.set(err.error?.error ?? 'Failed to assign this order.');
            this.assigningId.set(null);
          }
        });
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to create the order.');
        this.assigningId.set(null);
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
