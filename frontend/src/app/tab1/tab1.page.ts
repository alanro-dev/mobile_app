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

  // Profile fields (name/email)
  name = '';
  email = '';
  profileSaving = false;
  profileError = '';
  profileSuccess = '';

  // Password change fields
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordSaving = false;
  passwordError = '';
  passwordSuccess = '';

  // Delete account
  deleting = false;

  loadingUser = true;
  loadError = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {
    this.loadUser();
  }

  // READ — pull the freshest copy of the user's info from the server.
  loadUser(): void {
    this.loadingUser = true;
    this.loadError = '';

    this.auth.refreshCurrentUser().subscribe({
      next: ({ user }) => {
        this.applyUser(user);
        this.loadingUser = false;
      },
      error: (err: Error) => {
        // Fall back to whatever we already have cached, if anything.
        if (this.auth.currentUser) {
          this.applyUser(this.auth.currentUser);
        } else {
          this.loadError = err.message;
        }
        this.loadingUser = false;
      },
    });
  }

  private applyUser(user: AuthUser): void {
    this.user = user;
    this.name = user.name ?? '';
    this.email = user.email;
  }

  // UPDATE — name and/or email. Email changes require the current password,
  // enforced server-side; we ask for it inline only when email actually changed.
  async saveProfile(): Promise<void> {
    if (!this.email) return;

    const emailChanged = this.email.trim().toLowerCase() !== this.user?.email;
    let currentPassword: string | undefined;

    if (emailChanged) {
      currentPassword = await this.promptForPassword(
        'Confirm password',
        'Enter your current password to change your email.'
      );
      if (currentPassword === undefined) return; // cancelled
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

  // UPDATE — password change, as its own form/section since it needs its
  // own current-password + confirm-new-password validation.
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

  // DELETE — permanently remove the account, after a confirming alert +
  // password prompt.
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
    if (currentPassword === undefined) return; // cancelled

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

  // Small reusable password prompt used by both the email-change and
  // delete-account flows. Resolves to undefined if the user cancels.
  private async promptForPassword(header: string, message: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.alertCtrl
        .create({
          header,
          message,
          inputs: [{ name: 'password', type: 'password', placeholder: 'Current password' }],
          buttons: [
            { text: 'Cancel', role: 'cancel', handler: () => resolve(undefined) },
            {
              text: 'Confirm',
              handler: (data) => resolve(data.password || ''),
            },
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
