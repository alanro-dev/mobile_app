import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

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

  constructor(private auth: AuthService, private router: Router) {}

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
        this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
      },
      error: (err: Error) => {
        this.loading = false;
        this.serverError = err.message;
      },
    });
  }
}
