import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ImagePreviewData {
  url: string;
  alt: string;
}

@Component({
  selector: 'app-image-preview-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './image-preview-dialog.component.html',
  styleUrl: './image-preview-dialog.component.scss'
})
export class ImagePreviewDialogComponent {
  protected readonly data = inject<ImagePreviewData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ImagePreviewDialogComponent>);

  /** The dialog itself opens instantly; this just tracks whether the (possibly large, over-the-network)
   * full-size photo has actually finished loading, so a spinner shows in its place instead of a blank
   * gap — set on error too, so a broken image doesn't leave the spinner spinning forever. */
  readonly loaded = signal(false);

  close(): void {
    this.dialogRef.close();
  }
}
