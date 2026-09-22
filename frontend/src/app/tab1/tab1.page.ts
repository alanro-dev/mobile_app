import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { AuthService, AuthUser } from '../services/auth.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit {
  user: AuthUser | null = null;

  name = '';
  email = '';
  profileSaving = false;
  profileError = '';
  profileSuccess = '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordSaving = false;
  passwordError = '';
  passwordSuccess = '';

  deleting = false;

  // Start with whatever is cached in localStorage — the form shows
  // immediately with no spinner. The server fetch updates it silently.
  loadError = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {
    // Show cached data instantly so the form is never blocked by a network call.
    const cached = this.auth.currentUser;
    if (cached) {
      this.applyUser(cached);
    }

    // Then refresh from server in the background.
    this.auth.refreshCurrentUser().subscribe({
      next: ({ user }) => this.applyUser(user),
      error: () => {
        // Cached data already applied above — nothing extra to do.
        // Only show an error if we had nothing to fall back to.
        if (!this.user) {
          this.loadError = 'Could not load profile. Please check your connection.';
        }
      },
    });
  }

  private applyUser(user: AuthUser): void {
    this.user = user;
    this.name = user.name ?? '';
    this.email = user.email;
  }

  async saveProfile(): Promise<void> {
    if (!this.email) return;

    const emailChanged = this.email.trim().toLowerCase() !== this.user?.email;
    let currentPassword: string | undefined;

    if (emailChanged) {
      currentPassword = await this.promptForPassword(
        'Confirm password',
        'Enter your current password to change your email.'
      );
      if (currentPassword === undefined) return;
    }

    this.profileSaving = true;
    this.profileError = '';
    this.profileSuccess = '';

    this.auth
      .updateProfile({
        name: this.name.trim(),
        email: this.email.trim(),
        ...(currentPassword ? { currentPassword } : {}),
      })
      .subscribe({
        next: (res) => {
          this.profileSaving = false;
          this.applyUser(res.user);
          this.profileSuccess = 'Profile updated.';
          this.showToast('Profile updated.');
        },
        error: (err: Error) => {
          this.profileSaving = false;
          this.profileError = err.message;
        },
      });
  }

  changePassword(): void {
    this.passwordError = '';
    this.passwordSuccess = '';

    if (!this.currentPassword || !this.newPassword) return;

    if (this.newPassword.length < 8) {
      this.passwordError = 'New password must be at least 8 characters.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New password and confirmation do not match.';
      return;
    }

    this.passwordSaving = true;

    this.auth
      .updateProfile({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
      })
      .subscribe({
        next: (res) => {
          this.passwordSaving = false;
          this.applyUser(res.user);
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';
          this.passwordSuccess = 'Password changed.';
          this.showToast('Password changed.');
        },
        error: (err: Error) => {
          this.passwordSaving = false;
          this.passwordError = err.message;
        },
      });
  }

  async confirmDeleteAccount(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete account?',
      message: 'This permanently deletes your account and cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => this.deleteAccount() },
      ],
    });
    await alert.present();
  }

  private async deleteAccount(): Promise<void> {
    const currentPassword = await this.promptForPassword(
      'Confirm deletion',
      'Enter your current password to permanently delete your account.'
    );
    if (currentPassword === undefined) return;

    this.deleting = true;

    this.auth.deleteAccount(currentPassword).subscribe({
      next: () => {
        this.deleting = false;
        this.router.navigate(['/login'], { replaceUrl: true });
      },
      error: async (err: Error) => {
        this.deleting = false;
        await this.showToast(err.message, 'danger');
      },
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  private async promptForPassword(header: string, message: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.alertCtrl
        .create({
          header,
          message,
          inputs: [{ name: 'password', type: 'password', placeholder: 'Current password' }],
          buttons: [
            { text: 'Cancel', role: 'cancel', handler: () => resolve(undefined) },
            { text: 'Confirm', handler: (data) => resolve(data.password || '') },
          ],
        })
        .then((alert) => alert.present());
    });
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color });
    await toast.present();
  }
}
