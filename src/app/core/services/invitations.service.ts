import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MyInvitationCodeDto } from '../models/invitation.model';
import { ApiService } from './api.service';

/** Every admin has exactly one permanent, reusable invitation code — see AdminInvitationsController. */
@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly api = inject(ApiService);

  getMine(): Observable<MyInvitationCodeDto> {
    return this.api.get<MyInvitationCodeDto>('admin/invitations/mine');
  }

  regenerate(): Observable<MyInvitationCodeDto> {
    return this.api.post<MyInvitationCodeDto>('admin/invitations/regenerate', {});
  }
}
