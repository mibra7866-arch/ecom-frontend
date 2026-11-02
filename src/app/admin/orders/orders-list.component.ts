import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ChatService } from '../../core/services/chat.service';
import { OrdersService } from '../../core/services/orders.service';
import { SellersService } from '../../core/services/sellers.service';
import { SellerOrderStatusCounts } from '../../core/models/order.model';
import { SellerListItemDto } from '../../core/models/seller.model';
import { PagerComponent } from '../../shared/pager/pager.component';
import { VerifiedBadgeComponent } from '../../shared/verified-badge/verified-badge.component';
import { OrderCreateForSellerDialogComponent } from './create-for-seller/order-create-for-seller-dialog.component';
import { SellerOrdersDialogComponent } from './seller-orders-dialog/seller-orders-dialog.component';

const SELLERS_PAGE_SIZE = 10;
const ZERO_COUNTS: SellerOrderStatusCounts = { total: 0, unpaid: 0, paid: 0, pickup: 0, onTheWay: 0, outForDelivery: 0, delivered: 0, cancelled: 0 };

/**
 * Header (title, seller search, Create Order). The old All/Assigned/Accepted/Completed status toggle +
 * "RESULTS n" pill were dead — the toggle didn't drive any fetch and nothing on this page showed a
 * filtered order count — so that space now holds a real search box instead, same debounced
 * name/store/email search AdminSellersListComponent already has (SellersService.list's `search` param
 * already matches all three case-insensitively server-side across the whole seller list, not just the
 * loaded page).
 *
 * The Registered Sellers grid carries four extra columns — All/Unpaid/Paid/Completed — showing each
 * seller's OWN order counts by status (Unpaid=Assigned, Paid=Accepted, Completed=Completed only — an
 * order that's since moved on to On the way/Out for delivery/Delivered no longer counts here, since
 * SellerOrderStatusCounts maps each field 1:1 to its own exact status rather than aggregating). This is
 * what actually identifies which orders belong to which seller: read across one seller's row and you
 * see exactly how many of their orders are in each state, without a separate summary section. One
 * batched request (OrdersService.sellerStatusCounts) covers a whole page of sellers.
 */
@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, MatTableModule, PagerComponent, VerifiedBadgeComponent],
  templateUrl: './orders-list.component.html',
  styleUrl: './orders-list.component.scss'
})
export class OrdersListComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly sellersService = inject(SellersService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatService = inject(ChatService);
  private readonly searchInput$ = new Subject<string>();

  // Keeps the grid's All/Unpaid/Paid/Completed columns in sync with status changes made concurrently
  // (another admin, or this same admin from an open seller-orders dialog) — mirrors the same
  // "OrderUpdated -> re-fetch the counts" pattern SellerOrdersListComponent already uses.
  private readonly onOrderUpdated = () => this.loadSellerOrderCounts(this.sellers().map((s) => s.id));

  readonly search = signal('');

  readonly sellers = signal<SellerListItemDto[]>([]);
  readonly sellerColumns = ['name', 'storeName', 'email', 'all', 'unpaid', 'paid', 'delivered'];
  readonly sellersPage = signal(1);
  readonly sellersTotalPages = signal(0);
  readonly sellersTotalCount = signal(0);
  readonly sellersLoading = signal(true);
  readonly sellersErrorMessage = signal<string | null>(null);

  /** Keyed by seller id. A seller with no entry yet (still loading, or the batch request failed)
   * falls back to zeros in the template rather than leaving the cell blank. */
  readonly sellerOrderCounts = signal<Record<number, SellerOrderStatusCounts>>({});

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      this.search.set(term);
      this.sellersPage.set(1);
      this.loadSellers();
    });

    this.loadSellers();
    this.ordersService.markCompletedRead();

    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onOrderUpdated);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('OrderUpdated', this.onOrderUpdated);
    });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  /** Zero-filled fallback so the grid's status columns never show a blank cell while the batched
   * counts request is still in flight (or failed) for a given seller. */
  countsFor(sellerId: number): SellerOrderStatusCounts {
    return this.sellerOrderCounts()[sellerId] ?? ZERO_COUNTS;
  }

  openCreateDialog(): void {
    this.dialog
      .open(OrderCreateForSellerDialogComponent, {
        width: '900px',
        maxWidth: '94vw',
        maxHeight: '90vh',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((createdCount?: number) => {
        if (createdCount) {
          // The new orders land directly on the seller they were created for, as Assigned — refresh
          // that row's All/Unpaid/Paid/Delivered counts (a full reload is simplest and cheap; the
          // seller in question is almost always still on the currently-viewed page anyway).
          this.loadSellers();
        }
      });
  }

  /** Opens the seller-orders modal for a clicked Registered Sellers row — the modal is where an admin
   * now views AND changes that seller's order statuses (sellers can only view; see the seller Orders
   * list/detail pages). Refreshes this row's status counts on close if anything actually changed. */
  openSellerOrders(seller: SellerListItemDto): void {
    this.dialog
      .open(SellerOrdersDialogComponent, {
        data: { seller },
        width: '720px',
        maxWidth: '94vw',
        maxHeight: '90vh'
      })
      .afterClosed()
      .subscribe((hasChanges?: boolean) => {
        if (hasChanges) {
          this.loadSellerOrderCounts(this.sellers().map((s) => s.id));
        }
      });
  }

  private loadSellers(): void {
    this.sellersLoading.set(true);
    this.sellersErrorMessage.set(null);
    this.sellersService.list(this.sellersPage(), SELLERS_PAGE_SIZE, false, this.search()).subscribe({
      next: (res) => {
        this.sellers.set(res.items);
        this.sellersTotalPages.set(res.totalPages);
        this.sellersTotalCount.set(res.totalCount);
        this.sellersLoading.set(false);
        this.loadSellerOrderCounts(res.items.map((s) => s.id));
      },
      error: () => {
        this.sellersErrorMessage.set('Failed to load sellers.');
        this.sellersLoading.set(false);
      }
    });
  }

  private loadSellerOrderCounts(sellerIds: number[]): void {
    if (sellerIds.length === 0) {
      this.sellerOrderCounts.set({});
      return;
    }
    this.ordersService.sellerStatusCounts(sellerIds).subscribe({
      next: (counts) => this.sellerOrderCounts.set(counts),
      error: () => {} // Cells fall back to zero; not worth a page-level error banner for this.
    });
  }

  onSellersPageChange(page: number): void {
    this.sellersPage.set(page);
    this.loadSellers();
  }
}
