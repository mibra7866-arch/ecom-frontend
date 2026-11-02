import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  inject
} from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppNotification } from '../../core/models/notification.model';
import { NotificationService } from '../../core/services/notification.service';
import { notificationIcon } from '../utils/notification-icon.util';

const PANEL_GAP = 6;
const MOBILE_BREAKPOINT = 480;

/**
 * One bell + panel used identically by both the seller sidebar and the admin sidenav — every row
 * renders from the same template driven entirely by data (icon lookup + Title/Body/LinkUrl), never
 * a type-specific template. `variant` only changes how the trigger itself is presented so it fits
 * naturally into each host's nav chrome; the dropdown panel content and behavior never change.
 *
 * Positioning uses CDK Overlay (already the mechanism behind mat-menu elsewhere in this app, e.g.
 * the admin sellers-list actions menu) rather than a plain `position: absolute` child like the
 * catalog modal's category-select — both sidebar hosts here (`.sidebar`, `mat-sidenav`) scroll
 * internally, which would clip a same-DOM-position absolute panel. CDK Overlay portals the panel to
 * a top-level container and handles viewport-edge flip/push natively, while still matching the
 * category-select panel's exact visual language (6px gap, right-anchored under the trigger,
 * 12px radius / light shadow, flips to left-aligned on narrow viewports).
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss'
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);

  /** 'sidebar-link' matches the seller sidebar's full-row nav link chrome; 'icon-button' is a compact trigger for the admin sidenav; 'tab-bar' is icon-above-label to match the other items in the mobile bottom tab bar. */
  @Input() variant: 'sidebar-link' | 'icon-button' | 'tab-bar' = 'icon-button';
  @Input() label = 'Notifications';

  @ViewChild('trigger', { static: false }) private triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('panelTemplate', { static: true }) private panelTemplate!: TemplateRef<unknown>;

  readonly notifications = this.notificationService.notifications;
  readonly unreadCount = this.notificationService.unreadCount;
  readonly loading = this.notificationService.loading;
  readonly hasMore = this.notificationService.hasMore;

  open = false;

  private overlayRef: OverlayRef | null = null;
  private overlaySubscriptions: Subscription[] = [];

  ngOnInit(): void {
    void this.notificationService.init();
  }

  ngOnDestroy(): void {
    this.closePanel();
  }

  toggle(): void {
    if (this.open) {
      this.closePanel();
      return;
    }

    this.openPanel();
    void this.notificationService.loadFirstPage();
  }

  markAllRead(event: Event): void {
    event.stopPropagation();
    void this.notificationService.markAllAsRead();
  }

  loadMore(): void {
    void this.notificationService.loadMore();
  }

  select(notification: AppNotification): void {
    void this.notificationService.markAsRead(notification.id);
    this.closePanel();
    if (notification.linkUrl) {
      void this.router.navigateByUrl(notification.linkUrl);
    }
  }

  iconFor(type: string): string {
    return notificationIcon(type);
  }

  formatRelative(iso: string): string {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 60) {
      return 'just now';
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) {
      return `${diffHour}h ago`;
    }
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) {
      return `${diffDay}d ago`;
    }
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  private openPanel(): void {
    const trigger = this.triggerRef?.nativeElement;
    if (!trigger) {
      return;
    }

    const overlayRef = this.overlay.create({
      positionStrategy: this.buildPositionStrategy(trigger),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: false
    });

    overlayRef.attach(new TemplatePortal(this.panelTemplate, this.viewContainerRef));
    this.overlayRef = overlayRef;
    this.open = true;

    this.overlaySubscriptions.push(
      overlayRef.outsidePointerEvents().subscribe((event) => {
        if (!trigger.contains(event.target as Node)) {
          this.closePanel();
        }
      }),
      overlayRef.keydownEvents().subscribe((event) => {
        if (event.key === 'Escape') {
          this.closePanel();
        }
      })
    );
  }

  private closePanel(): void {
    this.overlaySubscriptions.forEach((sub) => sub.unsubscribe());
    this.overlaySubscriptions = [];
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.open = false;
  }

  /**
   * Matches the catalog modal's category-select panel: anchored below the trigger with a 6px gap,
   * right edge aligned under the trigger's right edge by default. Adds CDK fallback positions (flip
   * above if no room below, flip to left-aligned if no room on the right) plus a push-back-on-screen
   * safety net so the panel can never render partially off-screen — the one behavior a plain
   * `position: absolute` copy of that pattern can't give us here.
   */
  private buildPositionStrategy(trigger: HTMLElement) {
    // The tab-bar trigger sits fixed at the very bottom of the screen — anchoring the panel BELOW it
    // (like every other variant) would place it entirely behind the fixed bar itself, which push's
    // 8px viewport margin has no way to know needs clearing. Opening upward from the trigger's top
    // edge instead means the panel only ever grows into the free space above the bar.
    if (this.variant === 'tab-bar') {
      return this.overlay
        .position()
        .flexibleConnectedTo(trigger)
        .withPositions([{ originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -PANEL_GAP }])
        .withPush(true)
        .withViewportMargin(8)
        .withDefaultOffsetX(0);
    }

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      return this.overlay
        .position()
        .flexibleConnectedTo(trigger)
        .withPositions([{ originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: PANEL_GAP }])
        .withPush(true)
        .withViewportMargin(8)
        .withDefaultOffsetX(0);
    }

    const positions: ConnectedPosition[] = [
      { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: PANEL_GAP },
      { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -PANEL_GAP },
      { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: PANEL_GAP },
      { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -PANEL_GAP }
    ];

    return this.overlay.position().flexibleConnectedTo(trigger).withPositions(positions).withPush(true).withViewportMargin(8);
  }
}
