/** Cost/Sell/Profit mirrors Product's existing Price/Profit fields — Sell = price, Cost is derived (Sell - Profit), computed server-side. */
export interface SellerProductListItem {
  id: number;
  name: string;
  description: string | null;
  sell: number;
  cost: number;
  profit: number;
  imageUrl: string | null;
  category: string;
  addedAt: string;
}

export interface CatalogProduct {
  id: number;
  name: string;
  description: string | null;
  sell: number;
  cost: number;
  profit: number;
  imageUrl: string | null;
  category: string;
}

export interface SellerProductLimit {
  ownedCount: number;
  requiredProductCount: number;
  remainingSlots: number;
}

export interface QuickAddRandomResponse {
  requested: number;
  addedCount: number;
  addedProductIds: number[];
  message: string;
}
