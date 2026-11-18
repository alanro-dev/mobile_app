import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonFooter,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { AppTabBarComponent } from '../app-tab-bar/app-tab-bar.component';
import { AgentSummary, ZzzProfileService } from '../services/zzz-profile.service';
import { FavoritesService } from '../services/favorites.service';

type FilterKey = 'attribute' | 'specialty' | 'rarity';
type SortKey = 'level' | 'name' | 'rarity' | 'atk' | 'hp' | 'critRate' | 'critDmg';

interface FilterGroup {
  key: FilterKey;
  label: string;
  options: string[];
}

const RARITY_RANK: Record<string, number> = { S: 3, A: 2, B: 1 };

@Component({
  selector: 'app-characters',
  templateUrl: './characters.page.html',
  styleUrls: ['./characters.page.scss', './characters.page.extra.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [AppTabBarComponent, IonFooter, CommonModule, IonContent, IonIcon, IonRefresher, IonRefresherContent],
})
export class CharactersPage implements ViewWillEnter {
  agents: AgentSummary[] = [];
  nickname: string | null = null;
  uid: string | null = null;
  fetchedAt: string | null = null;

  loading = true;
  refreshing = false;
  errorMessage = '';

  // ── Search / filter / sort / favorites ──────────────────────────────────────
  searchTerm = '';
  showFilters = false;
  sortKey: SortKey = 'level';
  readonly sortOptions: { key: SortKey; label: string }[] = [
    { key: 'level', label: 'Level (high to low)' },
    { key: 'name', label: 'Name (A–Z)' },
    { key: 'rarity', label: 'Rarity' },
    { key: 'atk', label: 'ATK' },
    { key: 'hp', label: 'HP' },
    { key: 'critRate', label: 'CRIT Rate' },
    { key: 'critDmg', label: 'CRIT DMG' },
  ];

  filterGroups: FilterGroup[] = [];
  private selected: Record<FilterKey, Set<string>> = {
    attribute: new Set(),
    specialty: new Set(),
    rarity: new Set(),
  };
  private favorites = new Set<string>();

  // Precomputed (not a getter) so the list isn't rebuilt on every change-detection pass.
  visibleAgents: AgentSummary[] = [];
  activeFilterCount = 0;

  readonly skeletonItems = [1, 2, 3, 4, 5, 6];

  constructor(
    private profileService: ZzzProfileService,
    private favoritesService: FavoritesService,
    private router: Router,
    private toastCtrl: ToastController,
    private changeDetector: ChangeDetectorRef
  ) {}

  // Fires every time this page becomes active — the backend is always the
  // source of truth here, so we re-fetch rather than relying on cached state.
  // Existing data stays on screen while the request runs (no skeleton flash).
  ionViewWillEnter(): void {
    this.loadProfile();
  }

  private loadProfile(done?: () => void): void {
    this.loading = true;
    this.errorMessage = '';

    this.profileService.getProfile().subscribe({
      next: (profile) => {
        this.loading = false;
        this.uid = profile.uid;
        this.nickname = profile.nickname;
        this.fetchedAt = profile.fetchedAt;
        this.agents = profile.agents ?? [];
        this.favorites = this.favoritesService.load(profile.uid);
        this.buildFilterGroups();
        this.applyView();
        done?.();
        this.changeDetector.detectChanges();
      },
      error: (err: Error) => {
        this.loading = false;
        done?.();
        // No snapshot yet means the account has no UID saved — send them to
        // link one instead of showing a dead-end error screen.
        if (err.message.includes('Set a UID first')) {
          this.router.navigate(['/uid'], { replaceUrl: true });
          return;
        }
        this.errorMessage = err.message;
        this.changeDetector.detectChanges();
      },
    });
  }

  // ── Refresh (button + pull-to-refresh) ──────────────────────────────────────

  refresh(): void {
    this.refreshing = true;
    this.profileService.refreshProfile().subscribe({
      next: () => {
        this.refreshing = false;
        this.loadProfile();
      },
      error: async (err: Error) => {
        this.refreshing = false;
        this.changeDetector.detectChanges();
        await this.showToast(err.message);
      },
    });
  }

  /** Pull down to fetch fresh game data. Always stops the spinner, even on errors (e.g. cooldown). */
  onPullRefresh(event: Event): void {
    const detail = (event as CustomEvent<{ complete: () => void }>).detail;
    this.profileService.refreshProfile().subscribe({
      next: () => this.loadProfile(() => detail.complete()),
      error: async (err: Error) => {
        // Refresh refused (cooldown, Enka down…): tell the user, still re-read stored data.
        await this.showToast(err.message);
        this.loadProfile(() => detail.complete());
      },
    });
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color: 'danger' });
    await toast.present();
  }

  // ── Search / filters / sort ─────────────────────────────────────────────────

  onSearch(value: string): void {
    this.searchTerm = value;
    this.applyView();
    this.changeDetector.detectChanges();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    this.changeDetector.detectChanges();
  }

  toggleFilter(key: FilterKey, value: string): void {
    const set = this.selected[key];
    set.has(value) ? set.delete(value) : set.add(value);
    this.applyView();
    this.changeDetector.detectChanges();
  }

  isSelected(key: FilterKey, value: string): boolean {
    return this.selected[key].has(value);
  }

  onSort(value: string): void {
    this.sortKey = value as SortKey;
    this.applyView();
    this.changeDetector.detectChanges();
  }

  clearFilters(): void {
    this.searchTerm = '';
    (Object.keys(this.selected) as FilterKey[]).forEach((k) => this.selected[k].clear());
    this.applyView();
    this.changeDetector.detectChanges();
  }

  get hasActiveView(): boolean {
    return this.searchTerm.trim() !== '' || this.activeFilterCount > 0;
  }

  // ── Favorites ───────────────────────────────────────────────────────────────

  private keyOf(agent: AgentSummary): string {
    const id = (agent as unknown as { agentId?: number }).agentId;
    return id !== undefined ? String(id) : agent.name;
  }

  isFavorite(agent: AgentSummary): boolean {
    return this.favorites.has(this.keyOf(agent));
  }

  toggleFavorite(agent: AgentSummary, event: Event): void {
    event.stopPropagation(); // don't open the agent
    const key = this.keyOf(agent);
    this.favorites.has(key) ? this.favorites.delete(key) : this.favorites.add(key);
    this.favoritesService.save(this.uid ?? '', this.favorites);
    this.applyView();
    this.changeDetector.detectChanges();
  }

  get favoriteCount(): number {
    return this.agents.filter((a) => this.isFavorite(a)).length;
  }

  // ── View building ───────────────────────────────────────────────────────────

  private buildFilterGroups(): void {
    const unique = (pick: (a: AgentSummary) => string | null) =>
      [...new Set(this.agents.map(pick).filter((v): v is string => !!v))].sort();

    this.filterGroups = [
      { key: 'attribute', label: 'Attribute', options: unique((a) => a.attribute) },
      { key: 'specialty', label: 'Specialty', options: unique((a) => a.specialty) },
      {
        key: 'rarity',
        label: 'Rarity',
        options: unique((a) => a.rarity).sort((x, y) => (RARITY_RANK[y] ?? 0) - (RARITY_RANK[x] ?? 0)),
      },
    ];

    // Drop selections that no longer exist in the roster.
    for (const group of this.filterGroups) {
      for (const value of [...this.selected[group.key]]) {
        if (!group.options.includes(value)) this.selected[group.key].delete(value);
      }
    }
  }

  private sortValue(agent: AgentSummary): number {
    switch (this.sortKey) {
      case 'rarity':
        return RARITY_RANK[agent.rarity ?? ''] ?? 0;
      case 'atk':
      case 'hp':
      case 'critRate':
      case 'critDmg':
        return agent.stats[this.sortKey];
      default:
        return agent.level;
    }
  }

  private applyView(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.activeFilterCount =
      this.selected.attribute.size + this.selected.specialty.size + this.selected.rarity.size;

    const matches = (agent: AgentSummary): boolean => {
      if (term && !agent.name.toLowerCase().includes(term)) return false;
      if (this.selected.attribute.size && !this.selected.attribute.has(agent.attribute ?? '')) return false;
      if (this.selected.specialty.size && !this.selected.specialty.has(agent.specialty ?? '')) return false;
      if (this.selected.rarity.size && !this.selected.rarity.has(agent.rarity ?? '')) return false;
      return true;
    };

    this.visibleAgents = this.agents.filter(matches).sort((a, b) => {
      // Pinned agents always come first.
      const favDiff = Number(this.isFavorite(b)) - Number(this.isFavorite(a));
      if (favDiff) return favDiff;

      if (this.sortKey === 'name') return a.name.localeCompare(b.name);
      return this.sortValue(b) - this.sortValue(a) || a.name.localeCompare(b.name);
    });
  }

  openAgent(agent: AgentSummary): void {
    this.router.navigate(['/characters', agent.snapshotId]);
  }
}
