export interface OrderLimitConfigDto {
  id: number;
  maxOrderCount: number;
}

export interface OrderLimitConfigUpdateRequest {
  maxOrderCount: number;
}
