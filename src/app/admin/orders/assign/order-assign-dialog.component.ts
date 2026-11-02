import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ChatService } from '../../../core/services/chat.service';
import { OrdersService } from '../../../core/services/orders.service';
import { SellerSearchResult } from '../../../core/models/chat.model';
import { OrderListItemDto } from '../../../core/models/order.model';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../../../shared/confirmation-modal/confirmation-modal.component';

export interface OrderAssignDialogData {
  order: OrderListItemDto;
}

/**
 * Same debounced seller-search pattern already built for the admin Chat inbox's "start a new
 * conversation" flow (ChatService.searchSellers, name/email/store match) — reused directly here for
 * picking who an order gets assigned to, rather than a second search implementation.
 */
@Component({
  selector: 'app-order-assign-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './order-assign-dialog.component.html',
  styleUrl: './order-assign-dialog.component.scss'
})
export class OrderAssignDialogComponent implements OnInit {
  private readonly chatService = inject(ChatService);
  private readonly ordersService = inject(OrdersService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<OrderAssignDialogComponent, OrderListItemDto>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();
  readonly data = inject<OrderAssignDialogData>(MAT_DIALOG_DATA);

  readonly query = signal('');
  readonly results = signal<SellerSearchResult[]>([]);
  readonly searching = signal(false);
  readonly assigning = signal(false);
  readonly errorMessage = signal<string | null>(null);

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

  pick(seller: SellerSearchResult): void {
    if (this.assigning() || seller.status !== 'Active') {
      return;
    }

    this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '460px',
        panelClass: 'seller-catalog-dialog-panel',
        data: {
          title: 'Assign Order',
          message: `Assign order #${this.data.order.id} (${this.data.order.productName}) to ${seller.name}?`,
          variant: 'green',
          confirmLabel: 'Assign',
          icon: 'person_add'
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }

        this.assigning.set(true);
        this.errorMessage.set(null);
        this.ordersService.assign(this.data.order.id, { sellerId: seller.sellerId }).subscribe({
          next: (order) => this.dialogRef.close(order),
          error: (err) => {
            this.errorMessage.set(err.error?.error ?? 'Failed to assign this order.');
            this.assigning.set(false);
          }
        });
      });
  }

  close(): void {
    this.dialogRef.close();
  }
}
