/** The admin-owned product catalog (Products module) — sellers have no product model of their own; they only ever see a product's name/image/price/profit as fields already snapshotted onto their assigned Order. */
export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  profit: number;
  imageUrl: string | null;
  category: string;
  createdDate: string;
}

export interface BulkProductCreateItem {
  name: string;
  description: string;
  price: number;
  profit: number;
  category: string;
}

export interface BulkProductCreateResultItem {
  index: number;
  success: boolean;
  productId: number | null;
  error: string | null;
}

export interface BulkProductCreateResponse {
  results: BulkProductCreateResultItem[];
  successCount: number;
  failureCount: number;
}
