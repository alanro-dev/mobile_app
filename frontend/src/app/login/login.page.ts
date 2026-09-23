import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ZzzProfileService } from '../services/zzz-profile.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  email = '';
  password = '';
  showPassword = false;
  loading = false;
  serverError = '';
  isRegisterMode = false;

  constructor(
    private auth: AuthService,
    private profileService: ZzzProfileService,
    private router: Router
  ) {}

  toggleMode(): void {
    this.isRegisterMode = !this.isRegisterMode;
    this.serverError = '';
  }

  onSubmit(): void {
    if (!this.email || !this.password) return;

    this.loading = true;
    this.serverError = '';

    const request$ = this.isRegisterMode
      ? this.auth.register(this.email, this.password)
      : this.auth.login(this.email, this.password);

    request$.subscribe({
      next: () => {
        this.loading = false;
        this.routeAfterLogin();
      },
      error: (err: Error) => {
        this.loading = false;
        this.serverError = err.message;
      },
    });
  }

  // Decides where to send the user right after signing in:
  // - localStorage has a UID already -> straight to /hub (fast path).
  // - no local UID (new device, cleared storage, etc.) -> ask the backend,
  //   since that's the actual source of truth for whether one is saved.
  // - no UID anywhere -> UID entry screen.
  private routeAfterLogin(): void {
    if (this.profileService.getLocalUid()) {
      this.router.navigate(['/hub'], { replaceUrl: true });
      return;
    }

    this.profileService.getSavedUid().subscribe({
      next: ({ uid }) => {
        if (uid) {
          this.router.navigate(['/hub'], { replaceUrl: true });
        } else {
          this.router.navigate(['/uid'], { replaceUrl: true });
        }
      },
      // If the check itself fails (network hiccup, etc.), don't strand the
      // user on the login page — send them to the UID screen; setting it
      // again is harmless if one was already saved.
      error: () => this.router.navigate(['/uid-entry'], { replaceUrl: true }),
    });
  }
}
