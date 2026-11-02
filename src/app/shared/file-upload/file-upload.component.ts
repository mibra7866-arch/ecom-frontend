import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.scss'
})
export class FileUploadComponent implements OnChanges, OnDestroy {
  @Input() files: File[] = [];
  @Input() accept = 'image/*,.pdf';
  @Input() multiple = true;
  @Input() hint = 'PNG, JPG or PDF';
  /** 'dark' matches the signup/onboarding wizard this component was built for; 'light' fits a light card/modal (e.g. the top-up modal). */
  @Input() theme: 'dark' | 'light' = 'dark';
  /** Shrinks the dropzone's padding/icon for space-constrained hosts (e.g. the top-up modal); false everywhere else so the signup wizard and seller-home KYC upload keep their existing size. */
  @Input() dense = false;

  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() fileRemoved = new EventEmitter<File>();

  /** file.name+size -> object URL, only populated for image files, so the file-list can show a thumbnail instead of a generic icon. */
  private readonly previewUrls = new Map<string, string>();

  ngOnChanges(): void {
    const currentKeys = new Set(this.files.map(fileKey));
    for (const [key, url] of this.previewUrls) {
      if (!currentKeys.has(key)) {
        URL.revokeObjectURL(url);
        this.previewUrls.delete(key);
      }
    }

    for (const file of this.files) {
      const key = fileKey(file);
      if (!this.previewUrls.has(key) && file.type.startsWith('image/')) {
        this.previewUrls.set(key, URL.createObjectURL(file));
      }
    }
  }

  ngOnDestroy(): void {
    for (const url of this.previewUrls.values()) {
      URL.revokeObjectURL(url);
    }
  }

  previewFor(file: File): string | null {
    return this.previewUrls.get(fileKey(file)) ?? null;
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.filesSelected.emit(Array.from(input.files));
    }
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) {
      this.filesSelected.emit(Array.from(dropped));
    }
  }

  remove(file: File): void {
    this.fileRemoved.emit(file);
  }
}

function fileKey(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`;
}
