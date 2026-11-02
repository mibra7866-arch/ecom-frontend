import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { environment } from '../../../../environments/environment';
import { AdminProductsService } from '../../../core/services/admin-products.service';
import { Product } from '../../../core/models/product.model';
import { FileUploadComponent } from '../../../shared/file-upload/file-upload.component';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';

export interface ProductFormModalData {
  mode: 'create' | 'edit';
  product?: Product;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * One form reused for both Add Product and Edit Product (mode toggles the title/submit label and
 * whether fields pre-fill) — same "one shared modal, config-driven per caller" shape as
 * BankDetailsModalComponent. Reuses FileUploadComponent (already built for KYC/receipt uploads) for
 * the browse+preview control rather than a bespoke one.
 */
@Component({
  selector: 'app-product-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, FileUploadComponent],
  templateUrl: './product-form-modal.component.html',
  styleUrl: './product-form-modal.component.scss'
})
export class ProductFormModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly productsService = inject(AdminProductsService);
  private readonly imagePreview = inject(ImagePreviewService);
  readonly dialogRef = inject(MatDialogRef<ProductFormModalComponent, Product>);
  readonly data = inject<ProductFormModalData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.product?.name ?? '', Validators.required],
    description: [this.data.product?.description ?? ''],
    price: [this.data.product?.price ?? null as number | null, [Validators.required, Validators.min(0.01)]],
    profit: [this.data.product?.profit ?? null as number | null, Validators.required],
    category: [this.data.product?.category ?? '']
  });

  readonly selectedImage = signal<File | null>(null);
  readonly imageError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly existingImageUrl = this.data.product?.imageUrl ? `${environment.filesBaseUrl}${this.data.product.imageUrl}` : null;

  openExistingImage(): void {
    if (this.existingImageUrl) {
      this.imagePreview.open(this.existingImageUrl, this.data.product?.name ?? 'Current product image');
    }
  }

  readonly canSave = () => this.form.valid && !this.saving() && !this.imageError();

  onImageSelected(files: File[]): void {
    const file = files[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.imageError.set('File must be an image.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      this.imageError.set('Image must be 5 MB or smaller.');
      return;
    }

    this.imageError.set(null);
    this.selectedImage.set(file);
  }

  onImageRemoved(): void {
    this.selectedImage.set(null);
    this.imageError.set(null);
  }

  save(): void {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, description, price, profit, category } = this.form.getRawValue();
    this.saving.set(true);
    this.errorMessage.set(null);

    const values = { name, description, price: price!, profit: profit!, category, image: this.selectedImage() };
    const request =
      this.data.mode === 'create'
        ? this.productsService.create(values)
        : this.productsService.update(this.data.product!.id, values);

    request.subscribe({
      next: (product) => this.dialogRef.close(product),
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? `Failed to ${this.data.mode === 'create' ? 'create' : 'update'} product.`);
        this.saving.set(false);
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
