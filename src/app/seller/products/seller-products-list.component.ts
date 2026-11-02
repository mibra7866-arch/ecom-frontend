import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { SellerProductsService } from '../../core/services/seller-products.service';
import { SellerProductListItem, SellerProductLimit } from '../../core/models/seller-product.model';
import { SellerCatalogModalComponent } from './catalog/seller-catalog-modal.component';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';

/**
 * Seller Portal → Products. Shows the Browse-catalog empty state until the seller has at least one
 * product (added via the Catalog modal's Quick Add Random), then shows their owned-products list
 * instead — the Browse entry point does not come back once they own products. Per-item add and
 * select-and-add-many are intentionally not wired up here; only Quick Add Random is.
 *
 * The header's "Quick add N random" button (N = limit().remainingSlots) covers the case where an
 * admin raises the seller's limit after they already own products — the empty-state Browse entry
 * point above is gone by then, so this is the only way to reach the newly available capacity. Calls
 * the exact same SellerProductsService.quickAddRandom() the catalog modal's own button uses; no new
 * selection/eligibility logic.
 */
@Component({
  selector: 'app-seller-products-list',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './seller-products-list.component.html',
  styleUrl: './seller-products-list.component.scss'
})
export class SellerProductsListComponent implements OnInit {
  private readonly productsService = inject(SellerProductsService);
  private readonly dialog = inject(MatDialog);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly snackBar = inject(MatSnackBar);

  readonly products = signal<SellerProductListItem[]>([]);
  readonly limit = signal<SellerProductLimit | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly quickAdding = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.productsService.listMine().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to load your products.');
        this.loading.set(false);
      }
    });

    this.productsService.getLimit().subscribe({ next: (l) => this.limit.set(l) });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event, product: SellerProductListItem): void {
    event.stopPropagation();
    if (product.imageUrl) {
      this.imagePreview.open(this.fileUrl(product.imageUrl), product.name);
    }
  }

  quickAddRandom(): void {
    const remaining = this.limit()?.remainingSlots ?? 0;
    if (remaining <= 0 || this.quickAdding()) {
      return;
    }

    this.quickAdding.set(true);
    this.productsService.quickAddRandom(remaining).subscribe({
      next: (res) => {
        this.quickAdding.set(false);
        this.snackBar.open(res.message, undefined, { duration: 4000 });
        this.load();
      },
      error: (err) => {
        this.quickAdding.set(false);
        this.snackBar.open(err.error?.error ?? 'Failed to add random products.', undefined, { duration: 3000 });
      }
    });
  }

  openCatalog(): void {
    this.dialog
      .open<SellerCatalogModalComponent, undefined, boolean>(SellerCatalogModalComponent, {
        width: '960px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) {
          this.load();
        }
      });
  }
}
