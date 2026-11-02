import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ImagePreviewDialogComponent, ImagePreviewData } from './image-preview-dialog.component';

/** Opens a product/order photo full-size in a lightbox — the click target for every thumbnail across
 * Admin and Seller (product cards/rows, order cards/detail, the catalog and create-order pickers). */
@Injectable({ providedIn: 'root' })
export class ImagePreviewService {
  private readonly dialog = inject(MatDialog);

  open(url: string, alt: string): void {
    this.dialog.open<ImagePreviewDialogComponent, ImagePreviewData>(ImagePreviewDialogComponent, {
      data: { url, alt },
      panelClass: 'image-preview-panel',
      maxWidth: '100vw',
      maxHeight: '100vh',
      width: '100vw',
      height: '100vh',
      autoFocus: false
    });
  }
}
