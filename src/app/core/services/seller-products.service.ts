import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import { CatalogProduct, QuickAddRandomResponse, SellerProductListItem, SellerProductLimit } from '../models/seller-product.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SellerProductsService {
  private readonly api = inject(ApiService);

  listMine(): Observable<SellerProductListItem[]> {
    return this.api.get<SellerProductListItem[]>('seller/products');
  }

  getLimit(): Observable<SellerProductLimit> {
    return this.api.get<SellerProductLimit>('seller/products/limit');
  }

  browseCatalog(search: string, category: string | null, page: number, pageSize: number): Observable<PagedResult<CatalogProduct>> {
    const params: Record<string, string | number> = { search, page, pageSize };
    if (category) {
      params['category'] = category;
    }
    return this.api.get<PagedResult<CatalogProduct>>('seller/products/catalog', params);
  }

  listCategories(): Observable<string[]> {
    return this.api.get<string[]>('seller/products/categories');
  }

  quickAddRandom(count: number): Observable<QuickAddRandomResponse> {
    return this.api.post<QuickAddRandomResponse, { count: number }>('seller/products/quick-add-random', { count });
  }

  addMany(productIds: number[]): Observable<QuickAddRandomResponse> {
    return this.api.post<QuickAddRandomResponse, { productIds: number[] }>('seller/products/add-many', { productIds });
  }

  addSingle(productId: number): Observable<void> {
    return this.api.post<void, object>(`seller/products/${productId}/add`, {});
  }
}
