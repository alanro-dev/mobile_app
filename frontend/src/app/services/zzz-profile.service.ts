import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';

export interface AgentStats {
  hp: number;
  atk: number;
  def: number;
  impact: number;
  critRate: number;
  critDmg: number;
  attributeDmgBonus: number;
  anomalyMastery: number;
  anomalyProficiency: number;
  penRatio: number;
  penFlat: number;
  energyRegen: number;
}

export interface AgentSkill {
  type: string;
  level: number;
}

export interface StatValue {
  name: string;
  value: number;
  isPercent: boolean;
}

export interface WeaponInfo {
  weaponId: number;
  name: string;
  specialty: string | null;
  rarity: string | null;
  iconUrl: string | null;
  level: number;
  phase: number;
  modification: number;
  mainStat: StatValue | null;
  subStat: StatValue | null;
}

export interface DiscSubStat extends StatValue {
  propertyId: number;
  rolls: number;
}

export interface DiscMainStat extends StatValue {
  propertyId: number;
}

export interface DiscInfo {
  slot: number;
  equipmentId: number;
  setName: string | null;
  rarity: string | null;
  iconUrl: string | null;
  level: number;
  mainStat: DiscMainStat | null;
  subStats: DiscSubStat[];
}

export interface AgentSummary {
  snapshotId: string;
  agentId: number;
  name: string;
  attribute: string | null;
  specialty: string | null;
  rarity: string | null;
  iconUrl: string | null;
  level: number;
  promotionLevel: number;
  mindscapeCinema: number;
  coreSkillEnhancement: number;
  stats: AgentStats;
  skills: AgentSkill[];
  weapon: WeaponInfo | null;
  discs: DiscInfo[];
}

export interface ProfileResponse {
  uid: string;
  nickname: string | null;
  interknotLevel: number | null;
  fetchedAt: string;
  agents: AgentSummary[];
}

const LOCAL_UID_KEY = 'zzz_uid';

@Injectable({ providedIn: 'root' })
export class ZzzProfileService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ─── localStorage mirror (fast "do we need the UID screen?" check) ─────────

  getLocalUid(): string | null {
    return localStorage.getItem(LOCAL_UID_KEY);
  }

  private setLocalUid(uid: string): void {
    localStorage.setItem(LOCAL_UID_KEY, uid);
  }

  clearLocalUid(): void {
    localStorage.removeItem(LOCAL_UID_KEY);
  }

  // ─── API calls ───────────────────────────────────────────────────────────
  // The backend is always the source of truth for profile data (per project
  // decision) — localStorage is only used to skip the UID entry screen fast.

  /** Checks the backend for a previously saved UID (fallback when localStorage is empty, e.g. new device). */
  getSavedUid(): Observable<{ uid: string | null }> {
    return this.http
      .get<{ uid: string | null }>(`${this.apiUrl}/users/uid`)
      .pipe(catchError(this.handleError));
  }

  /** Validates + saves a new UID, and takes the first profile snapshot. */
  setUid(uid: string): Observable<{ uid: string; snapshotId: string }> {
    return this.http
      .post<{ uid: string; snapshotId: string }>(`${this.apiUrl}/users/uid`, { uid })
      .pipe(
        tap((res) => this.setLocalUid(res.uid)),
        catchError(this.handleError)
      );
  }

  /** Latest stored snapshot — call this every time /hub or the characters page loads. */
  getProfile(): Observable<ProfileResponse> {
    return this.http
      .get<ProfileResponse>(`${this.apiUrl}/profile`)
      .pipe(catchError(this.handleError));
  }

  /** Manual refresh — re-fetches from enka.network and stores a new snapshot. */
  refreshProfile(): Observable<{ snapshotId: string }> {
    return this.http
      .post<{ snapshotId: string }>(`${this.apiUrl}/profile/refresh`, {})
      .pipe(catchError(this.handleError));
  }

  // ─── Error handling (mirrors AuthService's convention) ──────────────────────

  private handleError = (err: HttpErrorResponse) => {
    let message = 'Something went wrong. Please try again.';

    if (err.error instanceof ErrorEvent) {
      message = 'Could not reach the server. Check your connection.';
    } else if (err.error?.message) {
      message = err.error.message;
    }

    return throwError(() => new Error(message));
  };
}
