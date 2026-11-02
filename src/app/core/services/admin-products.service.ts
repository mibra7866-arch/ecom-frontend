import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import { BulkProductCreateItem, BulkProductCreateResponse, Product } from '../models/product.model';
import { ApiService } from './api.service';

export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  profit: number;
  category: string;
  image: File | null;
}

@Injectable({ providedIn: 'root' })
export class AdminProductsService {
  private readonly api = inject(ApiService);

  list(search: string, page: number, pageSize: number): Observable<PagedResult<Product>> {
    return this.api.get<PagedResult<Product>>('admin/products', { search, page, pageSize });
  }

  get(id: number): Observable<Product> {
    return this.api.get<Product>(`admin/products/${id}`);
  }

  listCategories(): Observable<string[]> {
    return this.api.get<string[]>('admin/products/categories');
  }

  create(values: ProductFormValues): Observable<Product> {
    return this.api.postFormData<Product>('admin/products', this.toFormData(values));
  }

  update(id: number, values: ProductFormValues): Observable<Product> {
    return this.api.putFormData<Product>(`admin/products/${id}`, this.toFormData(values));
  }

  delete(id: number): Observable<void> {
    return this.api.delete<void>(`admin/products/${id}`);
  }

  /**
   * Multipart, not JSON — each row's image can't ride inside a JSON body. The backend matches
   * `images[i]` to `products[i]` positionally, so `images` must be the same length as `products`, in
   * the same order, with one file per row (the Add Multiple Products flow is image-driven — every row
   * originates from a picked image, so there's never a gap to represent).
   */
  bulkCreate(products: BulkProductCreateItem[], images: File[]): Observable<BulkProductCreateResponse> {
    const formData = new FormData();
    formData.append('productsJson', JSON.stringify(products));
    images.forEach((image) => formData.append('images', image));
    return this.api.postFormData<BulkProductCreateResponse>('admin/products/bulk', formData);
  }

  private toFormData(values: ProductFormValues): FormData {
    const formData = new FormData();
    formData.append('name', values.name);
    formData.append('description', values.description);
    formData.append('price', values.price.toString());
    formData.append('profit', values.profit.toString());
    formData.append('category', values.category);
    if (values.image) {
      formData.append('image', values.image);
    }
    return formData;
  }
}
