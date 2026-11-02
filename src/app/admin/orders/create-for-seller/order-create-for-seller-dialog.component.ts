import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { OrdersService } from '../../../core/services/orders.service';
import { SellersService } from '../../../core/services/sellers.service';
import { CreateForSellerFailure } from '../../../core/models/order.model';
import { SellerListItemDto } from '../../../core/models/seller.model';
import { SellerProductListItem } from '../../../core/models/seller-product.model';
import { PagerComponent } from '../../../shared/pager/pager.component';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';

type Step = 'sellers' | 'products' | 'address' | 'result';

const SELLERS_PAGE_SIZE = 10;

/** Fictional-but-plausible test data for the address step — saves the admin from typing a customer by
 * hand for every test order. City/zip are paired so they stay geographically consistent, and phone
 * numbers use the 555-01xx block reserved by the North American Numbering Plan for fiction, so nothing
 * generated here is ever a real, dialable number. */
const TEST_FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
  'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'
];
const TEST_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez'
];
const TEST_STREET_NAMES = [
  'Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Washington', 'Lincoln', 'Sunset', 'Highland', 'Park',
  'Willow', 'Birch', 'Chestnut', 'River', 'Lake'
];
const TEST_STREET_TYPES = ['Street', 'Avenue', 'Drive', 'Lane', 'Road', 'Court', 'Boulevard', 'Way'];
const TEST_UNIT_TYPES = ['Apt', 'Suite', 'Unit', 'Floor'];
const TEST_CITIES: { city: string; zipCode: string; areaCode: string }[] = [
  { city: 'New York', zipCode: '10001', areaCode: '212' },
  { city: 'Los Angeles', zipCode: '90001', areaCode: '310' },
  { city: 'Chicago', zipCode: '60601', areaCode: '312' },
  { city: 'Houston', zipCode: '77002', areaCode: '713' },
  { city: 'Phoenix', zipCode: '85001', areaCode: '602' },
  { city: 'Philadelphia', zipCode: '19102', areaCode: '215' },
  { city: 'San Antonio', zipCode: '78205', areaCode: '210' },
  { city: 'San Diego', zipCode: '92101', areaCode: '619' },
  { city: 'Dallas', zipCode: '75201', areaCode: '214' },
  { city: 'Austin', zipCode: '73301', areaCode: '512' },
  { city: 'Seattle', zipCode: '98101', areaCode: '206' },
  { city: 'Denver', zipCode: '80202', areaCode: '303' },
  { city: 'Boston', zipCode: '02108', areaCode: '617' },
  { city: 'Miami', zipCode: '33101', areaCode: '305' },
  { city: 'Atlanta', zipCode: '30301', areaCode: '404' }
];

function pickOne<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

function randomDigits(length: number): string {
  let digits = '';
  for (let i = 0; i < length; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  return digits;
}

function generateTestAddress() {
  const location = pickOne(TEST_CITIES);
  const houseNumber = 100 + Math.floor(Math.random() * 899);
  return {
    customerName: `${pickOne(TEST_FIRST_NAMES)} ${pickOne(TEST_LAST_NAMES)}`,
    addressLine1: `${houseNumber} ${pickOne(TEST_STREET_NAMES)} ${pickOne(TEST_STREET_TYPES)}`,
    addressLine2: `${pickOne(TEST_UNIT_TYPES)} ${1 + Math.floor(Math.random() * 20)}`,
    city: location.city,
    zipCode: location.zipCode,
    phone: `(${location.areaCode}) 555-01${randomDigits(2)}`
  };
}

/**
 * "Create Order" — pick a seller from the full registered-seller list, checkbox-select any number of
 * THAT seller's own products (never the whole catalog — ExistsForSellerAsync is re-checked server-side
 * regardless), fill in one customer-address form shared by every order about to be created, submit via
 * AdminOrdersController.CreateForSeller. One order is created per selected product, each already
 * Assigned to that seller (this endpoint IS create+assign in one step, skipping the separate
 * Pending -> Assign claim) — the same address is snapshotted onto every one of them. Selection is a
 * plain Set<number> rather than tracking full objects across pages, since SellerProducts already
 * returns a seller's whole product list unpaged in one call (no pagination to survive).
 *
 * This replaces the old single-product "click Select to advance immediately" flow (and, separately, the
 * now-removed Bulk Assign dialog, whose checkbox/Select-All/live-summary pattern is reused here instead
 * of against existing Pending orders).
 */
@Component({
  selector: 'app-order-create-for-seller-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, PagerComponent],
  templateUrl: './order-create-for-seller-dialog.component.html',
  styleUrl: './order-create-for-seller-dialog.component.scss'
})
export class OrderCreateForSellerDialogComponent implements OnInit {
  private readonly sellersService = inject(SellersService);
  private readonly ordersService = inject(OrdersService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<OrderCreateForSellerDialogComponent, number>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly sellerSearchInput$ = new Subject<string>();

  readonly step = signal<Step>('sellers');

  // Step 1 — sellers
  readonly sellers = signal<SellerListItemDto[]>([]);
  readonly sellersPage = signal(1);
  readonly sellersTotalPages = signal(0);
  readonly sellersTotalCount = signal(0);
  readonly sellersLoading = signal(true);
  readonly sellersSearch = signal('');
  readonly sellersError = signal<string | null>(null);

  // Step 2 — that seller's own products, multi-select
  readonly selectedSeller = signal<SellerListItemDto | null>(null);
  readonly products = signal<SellerProductListItem[]>([]);
  readonly productsLoading = signal(false);
  readonly productsError = signal<string | null>(null);
  readonly productSearch = signal('');
  readonly selectedProductIds = signal<Set<number>>(new Set());

  /** The endpoint returns the seller's whole product list unpaged (bounded by their own product
   * limit), so search here is a plain client-side filter rather than a second server round trip. */
  readonly filteredProducts = computed(() => {
    const term = this.productSearch().trim().toLowerCase();
    const list = this.products();
    return term ? list.filter((p) => p.name.toLowerCase().includes(term)) : list;
  });

  readonly selectedProducts = computed(() => {
    const ids = this.selectedProductIds();
    return this.products().filter((p) => ids.has(p.id));
  });

  readonly selectedCount = computed(() => this.selectedProductIds().size);
  readonly selectedTotalAmount = computed(() => this.selectedProducts().reduce((sum, p) => sum + p.sell, 0));
  readonly selectedTotalProfit = computed(() => this.selectedProducts().reduce((sum, p) => sum + p.profit, 0));

  readonly allFilteredSelected = computed(() => {
    const filtered = this.filteredProducts();
    return filtered.length > 0 && filtered.every((p) => this.selectedProductIds().has(p.id));
  });

  // Step 3 — customer address (shared by every order about to be created), then submit
  readonly addressForm = this.fb.nonNullable.group({
    customerName: ['', Validators.required],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    city: ['', Validators.required],
    zipCode: ['', Validators.required],
    phone: ['', Validators.required]
  });
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  // Step 4 — result
  readonly createdCount = signal(0);
  readonly failures = signal<CreateForSellerFailure[]>([]);

  /** Which exact set of products the address form was last auto-filled for — re-entering the address
   * step with the SAME selection (e.g. after backing up to double-check something) leaves the form
   * untouched instead of clobbering it with a fresh random set; changing the selection gets a fresh one. */
  private autoFilledForKey: string | null = null;

  ngOnInit(): void {
    this.sellerSearchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      this.sellersSearch.set(term);
      this.sellersPage.set(1);
      this.loadSellers();
    });

    this.loadSellers();
  }

  onSellerSearchInput(value: string): void {
    this.sellerSearchInput$.next(value);
  }

  loadSellers(): void {
    this.sellersLoading.set(true);
    this.sellersError.set(null);
    this.sellersService.list(this.sellersPage(), SELLERS_PAGE_SIZE, false, this.sellersSearch(), null).subscribe({
      next: (res) => {
        this.sellers.set(res.items);
        this.sellersTotalPages.set(res.totalPages);
        this.sellersTotalCount.set(res.totalCount);
        this.sellersLoading.set(false);
      },
      error: (err) => {
        this.sellersError.set(err.error?.error ?? 'Failed to load sellers.');
        this.sellersLoading.set(false);
      }
    });
  }

  onSellersPageChange(page: number): void {
    this.sellersPage.set(page);
    this.loadSellers();
  }

  selectSeller(seller: SellerListItemDto): void {
    this.selectedSeller.set(seller);
    this.productSearch.set('');
    this.selectedProductIds.set(new Set());
    this.step.set('products');
    this.loadProducts(seller.id);
  }

  private loadProducts(sellerId: number): void {
    this.productsLoading.set(true);
    this.productsError.set(null);
    this.ordersService.sellerProducts(sellerId).subscribe({
      next: (items) => {
        this.products.set(items);
        this.productsLoading.set(false);
      },
      error: (err) => {
        this.productsError.set(err.error?.error ?? "Failed to load this seller's products.");
        this.productsLoading.set(false);
      }
    });
  }

  onProductSearchInput(value: string): void {
    this.productSearch.set(value);
  }

  backToSellers(): void {
    this.step.set('sellers');
    this.selectedSeller.set(null);
    this.products.set([]);
  }

  isSelected(product: SellerProductListItem): boolean {
    return this.selectedProductIds().has(product.id);
  }

  toggleProduct(product: SellerProductListItem): void {
    this.selectedProductIds.update((current) => {
      const next = new Set(current);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.add(product.id);
      }
      return next;
    });
  }

  /** Select All is scoped to the currently-filtered (searched) list, same as ticking every visible
   * checkbox by hand — it never silently selects a product hidden by the current search term. */
  toggleSelectAll(): void {
    const filtered = this.filteredProducts();
    const selectAll = !this.allFilteredSelected();
    this.selectedProductIds.update((current) => {
      const next = new Set(current);
      for (const product of filtered) {
        if (selectAll) {
          next.add(product.id);
        } else {
          next.delete(product.id);
        }
      }
      return next;
    });
  }

  proceedToAddress(): void {
    if (this.selectedCount() === 0) {
      return;
    }

    const key = Array.from(this.selectedProductIds()).sort((a, b) => a - b).join(',');
    if (this.autoFilledForKey !== key) {
      this.addressForm.patchValue(generateTestAddress());
      this.autoFilledForKey = key;
    }
    this.submitError.set(null);
    this.step.set('address');
  }

  backToProducts(): void {
    this.step.set('products');
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event, item: SellerProductListItem): void {
    event.stopPropagation();
    if (item.imageUrl) {
      this.imagePreview.open(this.fileUrl(item.imageUrl), item.name);
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  submit(): void {
    if (this.addressForm.invalid || this.submitting() || this.selectedCount() === 0) {
      this.addressForm.markAllAsTouched();
      return;
    }

    const seller = this.selectedSeller();
    if (!seller) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    const { customerName, addressLine1, addressLine2, city, zipCode, phone } = this.addressForm.getRawValue();
    this.ordersService
      .createForSeller({
        sellerId: seller.id,
        productIds: Array.from(this.selectedProductIds()),
        customerName,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        zipCode,
        phone
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.createdCount.set(result.created.length);
          this.failures.set(result.failed);
          this.step.set('result');
        },
        error: (err) => {
          this.submitError.set(err.error?.error ?? 'Failed to create these orders.');
          this.submitting.set(false);
        }
      });
  }

  close(): void {
    this.dialogRef.close(this.createdCount() > 0 ? this.createdCount() : undefined);
  }
}
