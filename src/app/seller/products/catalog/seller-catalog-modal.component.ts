import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SellerProductsService } from '../../../core/services/seller-products.service';
import { CatalogProduct, SellerProductLimit } from '../../../core/models/seller-product.model';
import { PagerComponent } from '../../../shared/pager/pager.component';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';

const PAGE_SIZE = 12;

/**
 * Browse the shared admin catalog and add products via "Quick add N random" (N = the seller's live
 * remaining slots, reusing the same backend randomizer Product Setup's auto-fill used to use). Per-item
 * add and select-and-add-many are intentionally not wired up here — only Quick Add Random is, per the
 * current spec; those may come back later as their own separate change.
 */
@Component({
  selector: 'app-seller-catalog-modal',
  standalone: true,
  imports: [MatDialogModule, MatIconModule, MatSelectModule, PagerComponent],
  templateUrl: './seller-catalog-modal.component.html',
  styleUrl: './seller-catalog-modal.component.scss'
})
export class SellerCatalogModalComponent implements OnInit {
  private readonly productsService = inject(SellerProductsService);
  private readonly dialogRef = inject(MatDialogRef<SellerCatalogModalComponent, boolean>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly searchInput$ = new Subject<string>();

  readonly items = signal<CatalogProduct[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly category = signal<string | null>(null);
  readonly categories = signal<string[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly limit = signal<SellerProductLimit | null>(null);
  readonly quickAdding = signal(false);

  private hasChanges = false;

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      this.search.set(term);
      this.page.set(1);
      this.load();
    });

    this.productsService.listCategories().subscribe({ next: (cats) => this.categories.set(cats) });
    this.refreshLimit();
    this.load();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onCategoryChange(value: string): void {
    this.category.set(value || null);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.productsService.browseCatalog(this.search(), this.category(), this.page(), PAGE_SIZE).subscribe({
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

  private refreshLimit(): void {
    this.productsService.getLimit().subscribe({ next: (l) => this.limit.set(l) });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event, item: CatalogProduct): void {
    event.stopPropagation();
    if (item.imageUrl) {
      this.imagePreview.open(this.fileUrl(item.imageUrl), item.name);
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
        this.hasChanges = true;
        this.snackBar.open(res.message, undefined, { duration: 4000 });
        this.removeFromResults(res.addedProductIds);
        this.refreshLimit();
      },
      error: (err) => {
        this.quickAdding.set(false);
        this.snackBar.open(err.error?.error ?? 'Failed to add random products.', undefined, { duration: 3000 });
      }
    });
  }

  private removeFromResults(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }
    const idSet = new Set(ids);
    this.items.update((current) => current.filter((i) => !idSet.has(i.id)));
    this.totalCount.update((c) => Math.max(0, c - ids.length));
  }

  close(): void {
    this.dialogRef.close(this.hasChanges);
  }
}
