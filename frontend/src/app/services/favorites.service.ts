import { Injectable } from '@angular/core';

/**
 * Pinned ("favorite") agents, stored per device in localStorage.
 *
 * Keys are scoped by game UID so two accounts on the same device don't share
 * pins, and agents are identified by their stable agent id (a snapshot id
 * changes with every refresh, so it would lose the pin).
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private storageKey(scope: string): string {
    return `zzz.favorites.${scope || 'default'}`;
  }

  load(scope: string): Set<string> {
    try {
      const raw = localStorage.getItem(this.storageKey(scope));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  save(scope: string, favorites: Set<string>): void {
    try {
      localStorage.setItem(this.storageKey(scope), JSON.stringify([...favorites]));
    } catch {
      // Storage unavailable (private mode / quota): pins just won't persist.
    }
  }
}
