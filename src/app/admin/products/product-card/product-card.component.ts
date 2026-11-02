import { Component, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../../environments/environment';
import { Product } from '../../../core/models/product.model';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';

/**
 * Square 1:1 product card with a gradient-overlaid price (bottom-left) / profit (bottom-right) and a
 * three-dot action menu (Assign Order / Edit / Delete). Menu-open state lives here, one card at a
 * time, closed via the same "@HostListener document:click + stopPropagation on the trigger/panel"
 * pattern SellerCatalogModalComponent's category dropdown already used.
 */
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss'
})
export class ProductCardComponent {
  private readonly imagePreview = inject(ImagePreviewService);

  @Input({ required: true }) product!: Product;
  @Output() assignOrder = new EventEmitter<Product>();
  @Output() editProduct = new EventEmitter<Product>();
  @Output() deleteProduct = new EventEmitter<Product>();

  readonly menuOpen = signal(false);

  @HostListener('document:click')
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  onAssignOrder(): void {
    this.menuOpen.set(false);
    this.assignOrder.emit(this.product);
  }

  onEditProduct(): void {
    this.menuOpen.set(false);
    this.editProduct.emit(this.product);
  }

  onDeleteProduct(): void {
    this.menuOpen.set(false);
    this.deleteProduct.emit(this.product);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event, imageUrl: string): void {
    event.stopPropagation();
    this.imagePreview.open(this.fileUrl(imageUrl), this.product.name);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
}
