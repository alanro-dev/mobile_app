import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

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
  standalone: false,
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
      label: 'Section Two',
      description: 'Not set up yet',
      icon: 'grid-outline',
      route: null,
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
