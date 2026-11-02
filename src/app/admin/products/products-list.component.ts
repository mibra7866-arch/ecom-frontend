import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AdminProductsService } from '../../core/services/admin-products.service';
import { Product } from '../../core/models/product.model';
import { PagerComponent } from '../../shared/pager/pager.component';
import { ResultsPillComponent } from '../../shared/results-pill/results-pill.component';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../../shared/confirmation-modal/confirmation-modal.component';
import { ProductCardComponent } from './product-card/product-card.component';
import { ProductFormModalComponent, ProductFormModalData } from './product-form-modal/product-form-modal.component';
import { ProductAssignDialogComponent, ProductAssignDialogData } from './assign/product-assign-dialog.component';
import { ProductBulkCreateDialogComponent } from './bulk-create/product-bulk-create-dialog.component';

const PAGE_SIZE = 10;

/** The Products module — admin-only. Follows the same list-page shell (header/search/results pill) as Sellers/KYC/Top-Up, with a responsive product-card grid instead of a table. */
@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, PagerComponent, ResultsPillComponent, ProductCardComponent],
  templateUrl: './products-list.component.html',
  styleUrl: './products-list.component.scss'
})
export class ProductsListComponent implements OnInit {
  private readonly productsService = inject(AdminProductsService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();

  readonly products = signal<Product[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly errorMessage = signal<string | null>(null);

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
        this.products.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to load products.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  openAddDialog(): void {
    this.dialog
      .open<ProductFormModalComponent, ProductFormModalData, Product>(ProductFormModalComponent, {
        width: '520px',
        maxWidth: '92vw',
        height: '640px',
        maxHeight: '90vh',
        panelClass: 'seller-catalog-dialog-panel',
        data: { mode: 'create' }
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) {
          return;
        }
        this.page.set(1);
        this.load();
      });
  }

  openEditDialog(product: Product): void {
    this.dialog
      .open<ProductFormModalComponent, ProductFormModalData, Product>(ProductFormModalComponent, {
        width: '520px',
        maxWidth: '92vw',
        height: '640px',
        maxHeight: '90vh',
        panelClass: 'seller-catalog-dialog-panel',
        data: { mode: 'edit', product }
      })
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) {
          return;
        }
        this.products.update((current) => current.map((p) => (p.id === updated.id ? updated : p)));
      });
  }

  openAssignDialog(product: Product): void {
    this.dialog.open<ProductAssignDialogComponent, ProductAssignDialogData>(ProductAssignDialogComponent, {
      width: '440px',
      panelClass: 'seller-catalog-dialog-panel',
      data: { product }
    });
  }

  confirmDelete(product: Product): void {
    this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data: {
          title: 'Delete Product',
          message: `${product.name} will be removed from the catalog. Existing orders that used this product keep their own copy of its details and are not affected.`,
          variant: 'red',
          confirmLabel: 'Delete',
          icon: 'delete'
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.deleteProduct(product);
      });
  }

  private deleteProduct(product: Product): void {
    this.productsService.delete(product.id).subscribe({
      next: () => {
        this.products.update((current) => current.filter((p) => p.id !== product.id));
        this.totalCount.update((count) => Math.max(0, count - 1));
      },
      error: (err) => this.errorMessage.set(err.error?.error ?? 'Failed to delete product.')
    });
  }

  openBulkCreateDialog(): void {
    this.dialog
      .open<ProductBulkCreateDialogComponent, undefined, boolean>(ProductBulkCreateDialogComponent, {
        width: '740px',
        maxWidth: '94vw',
        maxHeight: '90vh',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((createdAny) => {
        if (!createdAny) {
          return;
        }
        this.page.set(1);
        this.load();
      });
  }
}
