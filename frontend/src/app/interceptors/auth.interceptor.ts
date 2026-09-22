import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService, private router: Router) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = this.auth.getToken();

    // Check expiry client-side before even sending the request.
    // Saves a round-trip and gives a cleaner redirect than waiting for 401.
    if (token && this.isTokenExpired(token)) {
      this.auth.logout();
      this.router.navigate(['/login'], { replaceUrl: true });
      return throwError(() => new Error('Session expired. Please log in again.'));
    }

    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(authReq).pipe(
      catchError((err: HttpErrorResponse) => {
        // Catch any 401 that slips through (e.g. token revoked server-side,
        // clock skew between client and server, etc.) and redirect to login.
        if (err.status === 401) {
          this.auth.logout();
          this.router.navigate(['/login'], { replaceUrl: true });
        }
        return throwError(() => err);
      })
    );
  }

  // Decode the JWT payload and compare exp against the current time.
  // No library needed — JWT payloads are just base64-encoded JSON.
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // exp is in seconds, Date.now() is in milliseconds.
      return Date.now() >= payload.exp * 1000;
    } catch {
      // If we can't decode it at all, treat it as expired.
      return true;
    }
  }
}
