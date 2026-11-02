import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AdminProductsService } from '../../../core/services/admin-products.service';
import { BulkProductCreateItem, BulkProductCreateResultItem } from '../../../core/models/product.model';
import { FileUploadComponent } from '../../../shared/file-upload/file-upload.component';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';

const MAX_PRODUCTS = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface BulkProductRow {
  id: number;
  file: File;
  previewUrl: string;
  name: string;
  description: string;
  price: number | null;
  profit: number | null;
  category: string;
  error: string | null;
}

/**
 * Image-driven "Add Multiple Products" — the admin browses/drops up to 10 images at once, each becomes
 * one row with its own editable name/price/profit (Product.Profit — see its own doc comment: "the
 * commission the admin wants on this product"), and the whole batch submits in one multipart request
 * (AdminProductsService.bulkCreate). Reuses FileUploadComponent purely as the browse/drop input (its own
 * file-list rendering is unused here — `[files]` is always empty — since each row needs its own
 * thumbnail + price/profit fields, not just a filename).
 */
@Component({
  selector: 'app-product-bulk-create-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatIconModule, FileUploadComponent],
  templateUrl: './product-bulk-create-dialog.component.html',
  styleUrl: './product-bulk-create-dialog.component.scss'
})
export class ProductBulkCreateDialogComponent implements OnInit, OnDestroy {
  private readonly productsService = inject(AdminProductsService);
  private readonly imagePreview = inject(ImagePreviewService);
  readonly dialogRef = inject(MatDialogRef<ProductBulkCreateDialogComponent, boolean>);

  private nextRowId = 0;

  readonly rows = signal<BulkProductRow[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly anyCreated = signal(false);
  /** Existing catalog categories, offered as suggestions (via a <datalist>) on each row's Category
   * field — the admin can still type a brand-new category, since Category is plain catalog text, not
   * a managed list of its own. */
  readonly categoryOptions = signal<string[]>([]);

  readonly maxProducts = MAX_PRODUCTS;

  readonly canAddMore = () => this.rows().length < MAX_PRODUCTS;

  // Deliberately NOT part of the Save button's [disabled] binding — a disabled button never fires
  // (click), so gating on validity here would mean a user with one bad row could never actually press
  // Save and would never see why, since the per-row error spans only render after save() sets
  // submitted(). canAttemptSave (below) is what the button binds to instead; this stays the "are we
  // actually ready to call the API" check used inside save() itself.
  readonly canSave = () => this.rows().length > 0 && this.rows().length <= MAX_PRODUCTS && this.rows().every((r) => this.isRowValid(r)) && !this.saving();

  readonly canAttemptSave = () => this.rows().length > 0 && this.rows().length <= MAX_PRODUCTS && !this.saving();

  ngOnInit(): void {
    this.productsService.listCategories().subscribe({
      next: (categories) => this.categoryOptions.set(categories),
      error: () => {} // Suggestions are a convenience, not required — the field still works as free text.
    });
  }

  isRowValid(row: BulkProductRow): boolean {
    return row.name.trim().length > 0 && row.price !== null && row.price > 0 && row.profit !== null && !this.isDuplicateName(row);
  }

  /** Mirrors the server's own same-batch duplicate check (AdminProductsController.BulkCreate) so the
   * admin sees the conflict before submitting instead of only after a round trip. */
  isDuplicateName(row: BulkProductRow): boolean {
    const name = row.name.trim().toLowerCase();
    if (!name) {
      return false;
    }
    return this.rows().some((other) => other.id !== row.id && other.name.trim().toLowerCase() === name);
  }

  onFilesSelected(files: File[]): void {
    const skippedReasons: string[] = [];
    const existingKeys = new Set(this.rows().map((r) => fileKey(r.file)));
    const accepted: File[] = [];

    for (const file of files) {
      const key = fileKey(file);
      if (existingKeys.has(key)) {
        skippedReasons.push(`"${file.name}" was already selected.`);
        continue;
      }
      if (!file.type.startsWith('image/')) {
        skippedReasons.push(`"${file.name}" must be an image.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        skippedReasons.push(`"${file.name}" exceeds the 5 MB limit.`);
        continue;
      }
      existingKeys.add(key);
      accepted.push(file);
    }

    const remainingSlots = MAX_PRODUCTS - this.rows().length;
    const toAdd = accepted.slice(0, remainingSlots);
    const overflow = accepted.length - toAdd.length;
    if (overflow > 0) {
      skippedReasons.push(`You can select up to ${MAX_PRODUCTS} images at once — ${overflow} additional image${overflow === 1 ? ' was' : 's were'} not added.`);
    }

    if (toAdd.length > 0) {
      const newRows = toAdd.map((file) => this.toRow(file));
      this.rows.update((current) => [...current, ...newRows]);
    }

    this.errorMessage.set(skippedReasons.length > 0 ? skippedReasons.join(' ') : null);
  }

  openImage(event: Event, row: BulkProductRow): void {
    event.stopPropagation();
    this.imagePreview.open(row.previewUrl, row.name || 'Product image');
  }

  removeRow(id: number): void {
    const row = this.rows().find((r) => r.id === id);
    if (row) {
      URL.revokeObjectURL(row.previewUrl);
    }
    this.rows.update((current) => current.filter((r) => r.id !== id));
  }

  save(): void {
    this.submitted.set(true);
    if (!this.canSave()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const products: BulkProductCreateItem[] = this.rows().map((r) => ({
      name: r.name.trim(),
      description: r.description.trim(),
      price: r.price!,
      profit: r.profit!,
      category: r.category.trim()
    }));
    const images = this.rows().map((r) => r.file);

    this.productsService.bulkCreate(products, images).subscribe({
      next: (response) => {
        this.saving.set(false);
        const failed = response.results.filter((r: BulkProductCreateResultItem) => !r.success);

        if (response.successCount > 0) {
          this.anyCreated.set(true);
        }

        if (failed.length === 0) {
          this.dialogRef.close(true);
          return;
        }

        // Keep only the rows that failed (with their reason attached) so retrying doesn't recreate the
        // ones that already saved — same recovery pattern the previous text-only version used. Indexed
        // directly off the original request order (results[i] always corresponds to rows()[i]), not by
        // relative position, so there's no risk of an off-by-one mismatch after filtering.
        const failedByIndex = new Map(failed.map((r: BulkProductCreateResultItem) => [r.index, r.error ?? 'Invalid.']));
        const currentRows = this.rows();
        for (const [i, row] of currentRows.entries()) {
          if (!failedByIndex.has(i)) {
            URL.revokeObjectURL(row.previewUrl);
          }
        }
        this.rows.set(
          currentRows
            .map((row, i): BulkProductRow | null => (failedByIndex.has(i) ? { ...row, error: failedByIndex.get(i) ?? null } : null))
            .filter((row): row is BulkProductRow => row !== null)
        );
        this.submitted.set(false);

        this.errorMessage.set(
          response.successCount > 0
            ? `${response.successCount} product${response.successCount === 1 ? '' : 's'} saved. ${failed.length} row${failed.length === 1 ? '' : 's'} need${failed.length === 1 ? 's' : ''} fixing before you can submit again, or remove ${failed.length === 1 ? 'it' : 'them'}.`
            : 'None of the products were saved — fix the errors below and try again.'
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.error ?? 'Failed to save products.');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(this.anyCreated());
  }

  ngOnDestroy(): void {
    for (const row of this.rows()) {
      URL.revokeObjectURL(row.previewUrl);
    }
  }

  private toRow(file: File): BulkProductRow {
    return {
      id: this.nextRowId++,
      file,
      previewUrl: URL.createObjectURL(file),
      name: deriveNameFromFile(file),
      description: '',
      price: null,
      profit: null,
      category: '',
      error: null
    };
  }
}

function fileKey(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

function deriveNameFromFile(file: File): string {
  const withoutExtension = file.name.replace(/\.[^./\\]+$/, '');
  return withoutExtension.replace(/[-_]+/g, ' ').trim();
}
