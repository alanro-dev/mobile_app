import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, NavController } from '@ionic/angular';

export type AppTabId = 'characters' | 'hub' | 'analytics' | 'profile';

interface AppTabItem {
  id: AppTabId;
  label: string;
  icon: string;
  route: string;
}

/**
 * Shared bottom navigation bar. Drop it into any page inside an <ion-footer>
 * and tell it which entry is active:
 *
 *   <ion-footer class="app-footer"><app-tab-bar active="hub"></app-tab-bar></ion-footer>
 */
@Component({
  selector: 'app-tab-bar',
  templateUrl: './app-tab-bar.component.html',
  styleUrls: ['./app-tab-bar.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class AppTabBarComponent {
  @Input() active: AppTabId | '' = '';

  // Icons used here are already registered in icons.ts.
  readonly items: AppTabItem[] = [
    { id: 'characters', label: 'Agents', icon: 'people-outline', route: '/characters' },
    { id: 'hub', label: 'Hub', icon: 'grid-outline', route: '/hub' },
    { id: 'analytics', label: 'Analytics', icon: 'stats-chart-outline', route: '/analytics' },
    { id: 'profile', label: 'Profile', icon: 'person-circle-outline', route: '/tabs/tab1' },
  ];

  constructor(private nav: NavController) {}

  go(item: AppTabItem): void {
    if (item.id === this.active) return;
    this.nav.navigateRoot(item.route);
  }
}
