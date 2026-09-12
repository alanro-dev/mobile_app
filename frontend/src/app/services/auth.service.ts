import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  [key: string]: any;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// Payload for updating the logged-in user's profile. currentPassword is only
// required when email or newPassword is being changed (enforced server-side).
export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  // Tracks the current user so any component/guard can react to login/logout.
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(
    this.getStoredUser()
  );
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((res) => this.setSession(res)),
        catchError(this.handleError)
      );
  }

  register(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/register`, { email, password })
      .pipe(
        tap((res) => this.setSession(res)),
        catchError(this.handleError)
      );
  }

  // Re-fetches the current user from the server (e.g. on the profile page
  // loading, in case it changed on another device).
  refreshCurrentUser(): Observable<{ user: AuthUser }> {
    return this.http
      .get<{ user: AuthUser }>(`${this.apiUrl}/auth/me`)
      .pipe(
        tap((res) => {
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.currentUserSubject.next(res.user);
        }),
        catchError(this.handleError)
      );
  }

  // Update (the "U" in CRUD): name always allowed, email/password require
  // currentPassword — enforced by the backend, mirrored here in the UI.
  updateProfile(payload: UpdateProfilePayload): Observable<AuthResponse> {
    return this.http
      .put<AuthResponse>(`${this.apiUrl}/auth/me`, payload)
      .pipe(
        tap((res) => this.setSession(res)),
        catchError(this.handleError)
      );
  }

  // Delete (the "D" in CRUD): permanently removes the account. Requires the
  // current password as a confirmation step.
  deleteAccount(currentPassword: string): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/auth/me`, { body: { currentPassword } })
      .pipe(
        tap(() => this.logout()),
        catchError(this.handleError)
      );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUserSubject.next(null);
  }

  private setSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.currentUserSubject.next(res.user);
  }

  private getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Normalizes backend error shapes into a single Error with a readable
  // message, so page components can just do err.message.
  private handleError = (err: HttpErrorResponse) => {
    let message = 'Something went wrong. Please try again.';

    if (err.error instanceof ErrorEvent) {
      // Client-side / network error (e.g. server not reachable).
      message = 'Could not reach the server. Check your connection.';
    } else if (err.status === 401) {
      message = err.error?.message || 'Invalid credentials.';
    } else if (err.status === 409) {
      message = err.error?.message || 'An account with that email already exists.';
    } else if (err.error?.message) {
      // Whatever message your Express API sends back, e.g. { message: '...' }
      message = err.error.message;
    }

    return throwError(() => new Error(message));
  };
}
