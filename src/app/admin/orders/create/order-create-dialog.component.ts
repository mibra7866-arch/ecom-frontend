import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { OrdersService } from '../../../core/services/orders.service';
import { AdminProductsService } from '../../../core/services/admin-products.service';
import { Product } from '../../../core/models/product.model';
import { OrderListItemDto } from '../../../core/models/order.model';
import { PagerComponent } from '../../../shared/pager/pager.component';

const PAGE_SIZE = 12;

/**
 * The order-creation product picker, reachable from the Orders list's "Create Order" button — reuses
 * the exact same admin Products listing (AdminProductsService) the Products module itself is built on,
 * not a second product-browsing query. Price sits bottom-left, profit bottom-right, matching the
 * product card's own layout.
 */
@Component({
  selector: 'app-order-create-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule, PagerComponent],
  templateUrl: './order-create-dialog.component.html',
  styleUrl: './order-create-dialog.component.scss'
})
export class OrderCreateDialogComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly productsService = inject(AdminProductsService);
  private readonly dialogRef = inject(MatDialogRef<OrderCreateDialogComponent, OrderListItemDto>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();

  readonly items = signal<Product[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly creatingId = signal<number | null>(null);

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      this.search.set(term);
      this.page.set(1);
      this.load();
    });

    this.load();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.productsService.list(this.search(), this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to load the catalog.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  createOrder(product: Product): void {
    if (this.creatingId() !== null) {
      return;
    }

    this.creatingId.set(product.id);
    this.ordersService.create({ productId: product.id }).subscribe({
      next: (order) => this.dialogRef.close(order),
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to create the order.');
        this.creatingId.set(null);
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
