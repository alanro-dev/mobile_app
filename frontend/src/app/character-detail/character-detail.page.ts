import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';

import { AgentSkill, AgentSummary, ZzzProfileService } from '../services/zzz-profile.service';

type TabId = 'overview' | 'skills' | 'gear';

interface StatRow {
  label: string;
  value: string;
}

const SKILL_LABELS: Record<string, string> = {
  basic: 'Basic Attack',
  special: 'Special Attack',
  dash: 'Dash',
  ultimate: 'Ultimate',
  core: 'Core Skill',
  assist: 'Assist',
};

// Order matches the game's own stat panel roughly. `percent: true` stats are
// stored as decimal fractions (0.074 = 7.4%) and formatted accordingly.
const STAT_DISPLAY: { key: keyof AgentSummary['stats']; label: string; percent: boolean }[] = [
  { key: 'hp', label: 'HP', percent: false },
  { key: 'atk', label: 'ATK', percent: false },
  { key: 'def', label: 'DEF', percent: false },
  { key: 'impact', label: 'Impact', percent: false },
  { key: 'critRate', label: 'CRIT Rate', percent: true },
  { key: 'critDmg', label: 'CRIT DMG', percent: true },
  { key: 'attributeDmgBonus', label: 'DMG Bonus', percent: true },
  { key: 'anomalyMastery', label: 'Anomaly Mastery', percent: false },
  { key: 'anomalyProficiency', label: 'Anomaly Proficiency', percent: false },
  { key: 'penRatio', label: 'PEN Ratio', percent: true },
  { key: 'penFlat', label: 'PEN', percent: false },
  { key: 'energyRegen', label: 'Energy Regen', percent: false },
];

@Component({
  selector: 'app-character-detail',
  templateUrl: './character-detail.page.html',
  styleUrls: ['./character-detail.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonSpinner],
})
export class CharacterDetailPage {
  agent: AgentSummary | null = null;
  loading = true;
  errorMessage = '';
  activeTab: TabId = 'overview';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private profileService: ZzzProfileService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ionViewWillEnter(): void {
    this.load();
  }

  private load(): void {
    const snapshotId = this.route.snapshot.paramMap.get('id');
    this.loading = true;
    this.errorMessage = '';
    this.changeDetector.detectChanges();

    // The backend is the source of truth every load (same as the roster
    // page) — this also means the detail page works correctly on a direct
    // refresh, not just when navigated to from the roster.
    this.profileService.getProfile().subscribe({
      next: (profile) => {
        this.loading = false;
        const found = profile.agents.find((a) => a.snapshotId === snapshotId);
        if (!found) {
          this.errorMessage = 'This agent could not be found in your latest profile snapshot.';
          return;
        }
        this.agent = found;
      },
      error: (err: Error) => {
        this.loading = false;
        this.errorMessage = err.message;
      },
    });
  }

  setTab(tab: TabId): void {
    this.activeTab = tab;
  }

  goBack(): void {
    this.router.navigate(['/characters']);
  }

  get statRows(): StatRow[] {
    if (!this.agent) return [];
    return STAT_DISPLAY.map(({ key, label, percent }) => ({
      label,
      value: percent
        ? `${(this.agent!.stats[key] * 100).toFixed(1)}%`
        : Math.round(this.agent!.stats[key]).toLocaleString(),
    }));
  }

  skillLabel(skill: AgentSkill): string {
    return SKILL_LABELS[skill.type] ?? skill.type;
  }

  formatStatValue(value: number, isPercent: boolean): string {
    return isPercent ? `${(value * 100).toFixed(1)}%` : Math.round(value).toLocaleString();
  }
}
