import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AgentStats } from './zzz-profile.service';

export interface HistorySnapshot {
  snapshotId: string;
  fetchedAt: string;
  interknotLevel: number | null;
  agentCount: number;
}

export interface AgentHistoryPoint {
  snapshotId: string;
  fetchedAt: string;
  level: number;
  promotionLevel: number;
  mindscapeCinema: number;
  coreSkillEnhancement: number;
  stats: AgentStats;
}

export interface AgentHistory {
  agentId: number;
  name: string;
  iconUrl: string | null;
  attribute: string | null;
  specialty: string | null;
  rarity: string | null;
  points: AgentHistoryPoint[]; // oldest → newest
}

export interface ProfileHistory {
  snapshots: HistorySnapshot[]; // oldest → newest
  agents: AgentHistory[];
}

@Injectable({ providedIn: 'root' })
export class ZzzHistoryService {
  constructor(private http: HttpClient) {}

  /** GET /api/profile/history — one point per stored snapshot, grouped by agent. */
  getHistory(limit = 50): Observable<ProfileHistory> {
    return this.http
      .get<ProfileHistory>(`${environment.apiUrl}/profile/history`, { params: { limit } })
      .pipe(
        catchError((err) =>
          throwError(() => new Error(err?.error?.message ?? 'Could not load your growth history.'))
        )
      );
  }
}
