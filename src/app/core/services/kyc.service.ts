import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { KycSubmissionDto, KycUploadResponse } from '../models/kyc.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class KycService {
  private readonly api = inject(ApiService);

  /** The seller's own latest submission — status, documents, and (when Rejected) the reason. 404s if
   * the seller has never submitted, which shouldn't happen post-signup but is handled by callers. */
  getStatus(): Observable<KycSubmissionDto> {
    return this.api.get<KycSubmissionDto>('seller/kyc/status');
  }

  upload(files: File[]): Observable<KycUploadResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    return this.api.postFormData<KycUploadResponse>('seller/kyc/upload', formData);
  }
}
