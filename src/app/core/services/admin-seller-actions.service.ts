import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import {
  AdjustBalanceRequest,
  AdminBankDetailsUpdateRequest,
  AdminResetPasswordRequest,
  AdminResetTransactionPasswordRequest,
  BankDetails,
  DeleteStoreRequest,
  LoginHistoryItemDto,
  ProductLimitUpdateRequest,
  ReasonRequest,
  SendNotificationRequest
} from '../models/seller-action.model';
import { KycSubmissionDto } from '../models/kyc.model';
import { AppNotificationPage } from '../models/notification.model';
import { SellerListItemDto } from '../models/seller.model';
import { StoreMonitoringDto } from '../models/store-monitoring.model';
import { ApiService } from './api.service';

/**
 * One service for every "Account Actions" dropdown item that isn't plain status/rating (those stay
 * on SellersService) — mirrors AdminSellerActionsController one-to-one, same ApiService pattern as
 * every other admin service in this app.
 */
@Injectable({ providedIn: 'root' })
export class AdminSellerActionsService {
  private readonly api = inject(ApiService);

  notify(sellerId: number, request: SendNotificationRequest): Observable<void> {
    return this.api.post<void, SendNotificationRequest>(`admin/sellers/${sellerId}/notify`, request);
  }

  loginHistory(sellerId: number, page: number, pageSize: number): Observable<PagedResult<LoginHistoryItemDto>> {
    return this.api.get<PagedResult<LoginHistoryItemDto>>(`admin/sellers/${sellerId}/login-history`, { page, pageSize });
  }

  adjustBalance(sellerId: number, request: AdjustBalanceRequest): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, AdjustBalanceRequest>(`admin/sellers/${sellerId}/adjust-balance`, request);
  }

  productLimit(sellerId: number, request: ProductLimitUpdateRequest): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, ProductLimitUpdateRequest>(`admin/sellers/${sellerId}/product-limit`, request);
  }

  getBankDetails(sellerId: number): Observable<BankDetails> {
    return this.api.get<BankDetails>(`admin/sellers/${sellerId}/bank-details`);
  }

  updateBankDetails(sellerId: number, request: AdminBankDetailsUpdateRequest): Observable<BankDetails> {
    return this.api.put<BankDetails, AdminBankDetailsUpdateRequest>(`admin/sellers/${sellerId}/bank-details`, request);
  }

  /** Latest KYC submission for this seller, or null if they've never submitted one — backs the Sellers module's KYC status/approve entry point (approve/reject itself stays on KycAdminService.review, the same endpoint the KYC Review screen already uses). */
  getKyc(sellerId: number): Observable<KycSubmissionDto | null> {
    return this.api.get<KycSubmissionDto | null>(`admin/sellers/${sellerId}/kyc`);
  }

  suspend(sellerId: number, request: ReasonRequest): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, ReasonRequest>(`admin/sellers/${sellerId}/suspend`, request);
  }

  unsuspend(sellerId: number): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, object>(`admin/sellers/${sellerId}/unsuspend`, {});
  }

  blockWithdrawals(sellerId: number, request: ReasonRequest): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, ReasonRequest>(`admin/sellers/${sellerId}/block-withdrawals`, request);
  }

  unblockWithdrawals(sellerId: number): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, object>(`admin/sellers/${sellerId}/unblock-withdrawals`, {});
  }

  deleteStore(sellerId: number, request: DeleteStoreRequest): Observable<void> {
    return this.api.post<void, DeleteStoreRequest>(`admin/sellers/${sellerId}/delete`, request);
  }

  restoreStore(sellerId: number): Observable<SellerListItemDto> {
    return this.api.post<SellerListItemDto, object>(`admin/sellers/${sellerId}/restore`, {});
  }

  resetPassword(sellerId: number, request: AdminResetPasswordRequest): Observable<void> {
    return this.api.post<void, AdminResetPasswordRequest>(`admin/sellers/${sellerId}/reset-password`, request);
  }

  resetTransactionPassword(sellerId: number, request: AdminResetTransactionPasswordRequest): Observable<void> {
    return this.api.post<void, AdminResetTransactionPasswordRequest>(`admin/sellers/${sellerId}/reset-transaction-password`, request);
  }

  /** Product setup progress, order-stage progression, and recent orders/recharges/withdrawals for one seller — backs the seller detail dialog's Store Monitoring panels. */
  getMonitoring(sellerId: number): Observable<StoreMonitoringDto> {
    return this.api.get<StoreMonitoringDto>(`admin/sellers/${sellerId}/monitoring`);
  }

  /** Every notification ever sent to (or broadcast toward) this specific seller — backs the seller's
   * 3-dot menu -> All Notifications. Reuses the same NotificationDto shape the seller's own bell uses;
   * this just scopes it to an admin-supplied sellerId instead of the caller's own identity. */
  getNotifications(sellerId: number, page: number, pageSize: number): Observable<AppNotificationPage> {
    return this.api.get<AppNotificationPage>(`admin/sellers/${sellerId}/notifications`, { page, pageSize });
  }

  /** Backs both the single "Delete" action and the "Delete Selected" bulk action on that same list — the frontend always sends a list, a 1-element one for the single case. */
  deleteNotifications(sellerId: number, notificationIds: number[]): Observable<{ deletedCount: number }> {
    return this.api.post<{ deletedCount: number }, { notificationIds: number[] }>(`admin/sellers/${sellerId}/notifications/delete`, { notificationIds });
  }
}
