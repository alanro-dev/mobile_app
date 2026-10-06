import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, ToastController } from '@ionic/angular';
import { IonFooter } from '@ionic/angular';
import { AppTabBarComponent } from '../app-tab-bar/app-tab-bar.component';

// One entry per button on the hub. Fill in `route` once the destination
// page/route exists (e.g. '/tabs/tab2'); leave it null as a placeholder and
// the button will show a "coming soon" toast instead of navigating.
export interface HubItem {
  label: string;
  description: string;
  icon: string;
  route: string | null;
}

@Component({
  selector: 'app-hub',
  templateUrl: 'hub.page.html',
  styleUrls: ['hub.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, IonContent, IonIcon, IonFooter, AppTabBarComponent],
})
export class HubPage {
  // TODO: set each `route` as the destination views are built.
  items: HubItem[] = [
    {
      label: 'Characters',
      description: 'View your agent roster',
      icon: 'people-outline',
      route: '/characters',
    },
    {
      label: 'Profile',
      description: 'View and edit your account',
      icon: 'person-circle-outline',
      route: '/tabs/tab1',
    },
    {
      label: 'Analytics',
      description: 'Charts for your roster and gear',
      icon: 'stats-chart-outline',
      route: '/analytics',
    },
    {
      label: 'Section Three',
      description: 'Not set up yet',
      icon: 'layers-outline',
      route: null,
    },
    {
      label: 'Section Four',
      description: 'Not set up yet',
      icon: 'sparkles-outline',
      route: null,
    },
  ];

  constructor(
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async open(item: HubItem): Promise<void> {
    if (!item.route) {
      const toast = await this.toastCtrl.create({
        message: `${item.label} isn't set up yet.`,
        duration: 1800,
        color: 'medium',
      });
      await toast.present();
      return;
    }

    this.router.navigateByUrl(item.route);
  }
}