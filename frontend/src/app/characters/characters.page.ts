import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, ViewWillEnter } from '@ionic/angular';
import { AgentSummary, ZzzProfileService } from '../services/zzz-profile.service';

@Component({
  selector: 'app-characters',
  templateUrl: './characters.page.html',
  styleUrls: ['./characters.page.scss'],
  standalone: false,
})
export class CharactersPage implements ViewWillEnter {
  agents: AgentSummary[] = [];
  nickname: string | null = null;
  uid: string | null = null;
  fetchedAt: string | null = null;

  loading = true;
  refreshing = false;
  errorMessage = '';

  constructor(
    private profileService: ZzzProfileService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  // Fires every time this page becomes active — the backend is always the
  // source of truth here, so we re-fetch rather than relying on cached state.
  ionViewWillEnter(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.loading = true;
    this.errorMessage = '';

    this.profileService.getProfile().subscribe({
      next: (profile) => {
        this.loading = false;
        this.uid = profile.uid;
        this.nickname = profile.nickname;
        this.fetchedAt = profile.fetchedAt;
        this.agents = profile.agents;
      },
      error: (err: Error) => {
        this.loading = false;
        // No snapshot yet means the account has no UID saved — send them to
        // link one instead of showing a dead-end error screen.
        if (err.message.includes('Set a UID first')) {
          this.router.navigate(['/uid'], { replaceUrl: true });
          return;
        }
        this.errorMessage = err.message;
      },
    });
  }

  refresh(): void {
    this.refreshing = true;
    this.profileService.refreshProfile().subscribe({
      next: () => {
        this.refreshing = false;
        this.loadProfile();
      },
      error: async (err: Error) => {
        this.refreshing = false;
        const toast = await this.toastCtrl.create({
          message: err.message,
          duration: 2500,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  openAgent(agent: AgentSummary): void {
    // TODO: character detail page (3-tab view) isn't built yet — this route
    // doesn't exist yet. Wire it up once that page is created.
    this.router.navigate(['/characters', agent.snapshotId]);
  }
}
