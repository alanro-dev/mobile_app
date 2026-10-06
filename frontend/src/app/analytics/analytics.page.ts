import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, ViewWillEnter } from '@ionic/angular';

import { AgentStats, AgentSummary, ZzzProfileService } from '../services/zzz-profile.service';
import { IonFooter } from '@ionic/angular';
import { AppTabBarComponent } from '../app-tab-bar/app-tab-bar.component';


type TabId = 'discs' | 'skills' | 'roster' | 'compare';

interface BarRow {
  label: string;
  display: string;
  pct: number; // 0-100, drives the bar width
  sub?: string;
  iconUrl?: string | null;
}

interface DonutSegment {
  label: string;
  count: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

interface Donut {
  title: string;
  total: number;
  segments: DonutSegment[];
}

interface StatOption {
  key: keyof AgentStats;
  label: string;
  percent: boolean;
}

const SKILL_LABELS: Record<string, string> = {
  basic: 'Basic Attack',
  special: 'Special Attack',
  dash: 'Dash',
  ultimate: 'Ultimate',
  core: 'Core Skill',
  assist: 'Assist',
};
const SKILL_ORDER = ['basic', 'special', 'dash', 'ultimate', 'core', 'assist'];

// Bar scale caps for the skills chart. Normal skills top out at 16; the core
// skill uses its own 1-7 scale (A-F). Adjust here if the game changes.
const SKILL_CAP = 16;
const CORE_SKILL_CAP = 7;

const STAT_OPTIONS: StatOption[] = [
  { key: 'hp', label: 'HP', percent: false },
  { key: 'atk', label: 'ATK', percent: false },
  { key: 'def', label: 'DEF', percent: false },
  { key: 'impact', label: 'Impact', percent: false },
  { key: 'critRate', label: 'CRIT Rate', percent: true },
  { key: 'critDmg', label: 'CRIT DMG', percent: true },
  { key: 'attributeDmgBonus', label: 'DMG Bonus', percent: true },
  { key: 'anomalyMastery', label: 'Anomaly Mastery', percent: false },
  { key: 'anomalyProficiency', label: 'Anomaly Prof.', percent: false },
  { key: 'penRatio', label: 'PEN Ratio', percent: true },
  { key: 'penFlat', label: 'PEN', percent: false },
  { key: 'energyRegen', label: 'Energy Regen', percent: false },
];

const PALETTE = ['#5b7fff', '#8b5cf6', '#34d399', '#fbbf24', '#f87171', '#22d3ee', '#f472b6', '#a3e635'];

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.page.html',
  styleUrls: ['./analytics.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, IonContent, IonIcon, IonSpinner, AppTabBarComponent, IonFooter],
})
export class AnalyticsPage implements ViewWillEnter {
  agents: AgentSummary[] = [];
  loading = true;
  errorMessage = '';
  activeTab: TabId = 'discs';

  // Shared by the Discs and Skills tabs. 'all' = whole roster.
  selectedId = 'all';
  compareKey: keyof AgentStats = 'atk';
  readonly statOptions = STAT_OPTIONS;

  // Everything below is precomputed (not getters) so it isn't rebuilt on every
  // change-detection pass.
  discRows: BarRow[] = [];
  discSummary = '';
  skillRows: BarRow[] = [];
  skillTitle = '';
  donuts: Donut[] = [];
  levelRows: BarRow[] = [];
  compareRows: BarRow[] = [];

  constructor(
    private router: Router,
    private profileService: ZzzProfileService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ionViewWillEnter(): void {
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.changeDetector.detectChanges();

    this.profileService.getProfile().subscribe({
      next: (profile) => {
        this.loading = false;
        this.agents = profile.agents ?? [];
        // If the previously selected agent vanished from the latest snapshot, reset.
        if (this.selectedId !== 'all' && !this.agents.some((a) => a.snapshotId === this.selectedId)) {
          this.selectedId = 'all';
        }
        this.recompute();
        this.changeDetector.detectChanges();
      },
      error: (err: Error) => {
        this.loading = false;
        this.errorMessage = err.message;
        this.changeDetector.detectChanges();
      },
    });
  }

  // ─── UI actions ─────────────────────────────────────────────────────────────

  setTab(tab: TabId): void {
    this.activeTab = tab;
    this.changeDetector.detectChanges();
  }

  selectAgent(id: string): void {
    this.selectedId = id;
    this.buildDiscRows();
    this.buildSkillRows();
    this.changeDetector.detectChanges();
  }

  selectStat(key: keyof AgentStats): void {
    this.compareKey = key;
    this.buildCompareRows();
    this.changeDetector.detectChanges();
  }

  goBack(): void {
    this.router.navigate(['/hub']);
  }

  // ─── Data builders ──────────────────────────────────────────────────────────

  private recompute(): void {
    this.buildDiscRows();
    this.buildSkillRows();
    this.buildDonuts();
    this.buildLevelRows();
    this.buildCompareRows();
  }

  private get selectedAgents(): AgentSummary[] {
    return this.selectedId === 'all'
      ? this.agents
      : this.agents.filter((a) => a.snapshotId === this.selectedId);
  }

  /** Total substat rolls per stat, across the selected agent's (or all agents') discs. */
  private buildDiscRows(): void {
    const totals = new Map<string, { name: string; isPercent: boolean; rolls: number; discs: number }>();
    let discCount = 0;

    for (const agent of this.selectedAgents) {
      for (const disc of agent.discs ?? []) {
        discCount++;
        for (const sub of disc.subStats ?? []) {
          const key = `${sub.name}|${sub.isPercent}`;
          const entry = totals.get(key) ?? { name: sub.name, isPercent: sub.isPercent, rolls: 0, discs: 0 };
          entry.rolls += sub.rolls;
          entry.discs += 1;
          totals.set(key, entry);
        }
      }
    }

    // "ATK" can exist as both flat and percent — only add a suffix when needed.
    const names = [...totals.values()].map((e) => e.name);
    const isAmbiguous = (name: string) => names.filter((n) => n === name).length > 1;

    const entries = [...totals.values()].sort((a, b) => b.rolls - a.rolls);
    const max = entries[0]?.rolls ?? 0;
    const totalRolls = entries.reduce((sum, e) => sum + e.rolls, 0);

    this.discRows = entries.map((e) => ({
      label: isAmbiguous(e.name) ? `${e.name} ${e.isPercent ? '(%)' : '(flat)'}` : e.name,
      display: `${e.rolls} ${e.rolls === 1 ? 'roll' : 'rolls'}`,
      sub: `on ${e.discs} ${e.discs === 1 ? 'disc' : 'discs'}`,
      pct: max ? (e.rolls / max) * 100 : 0,
    }));
    this.discSummary = discCount
      ? `${totalRolls} total rolls across ${discCount} ${discCount === 1 ? 'disc' : 'discs'}`
      : '';
  }

  /** Skill levels for one agent, or the roster average per skill when 'all' is selected. */
  private buildSkillRows(): void {
    const sums = new Map<string, { total: number; count: number }>();
    for (const agent of this.selectedAgents) {
      for (const skill of agent.skills ?? []) {
        const s = sums.get(skill.type) ?? { total: 0, count: 0 };
        s.total += skill.level;
        s.count += 1;
        sums.set(skill.type, s);
      }
    }

    const rank = (t: string) => (SKILL_ORDER.indexOf(t) === -1 ? 99 : SKILL_ORDER.indexOf(t));
    const isAll = this.selectedId === 'all';

    this.skillTitle = isAll ? 'Average skill level across your roster' : 'Skill levels';
    this.skillRows = [...sums.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([type, { total, count }]) => {
        const level = total / count;
        const cap = type === 'core' ? CORE_SKILL_CAP : SKILL_CAP;
        return {
          label: SKILL_LABELS[type] ?? type,
          display: isAll ? `Avg ${level.toFixed(1)}` : `Lv. ${level}`,
          sub: `max ${cap}`,
          pct: Math.min(level / cap, 1) * 100,
        };
      });
  }

  private buildDonuts(): void {
    this.donuts = [
      this.makeDonut('Attribute', (a) => a.attribute),
      this.makeDonut('Specialty', (a) => a.specialty),
      this.makeDonut('Rarity', (a) => a.rarity),
    ];
  }

  private makeDonut(title: string, pick: (a: AgentSummary) => string | null): Donut {
    const counts = new Map<string, number>();
    for (const agent of this.agents) {
      const label = pick(agent) ?? 'Unknown';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const total = this.agents.length;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    let cumulative = 0;
    const segments: DonutSegment[] = sorted.map(([label, count], i) => {
      const pct = total ? (count / total) * 100 : 0;
      const seg: DonutSegment = {
        label,
        count,
        color: PALETTE[i % PALETTE.length],
        dashArray: `${pct} ${100 - pct}`,
        dashOffset: 25 - cumulative, // 25 = start at 12 o'clock
      };
      cumulative += pct;
      return seg;
    });

    return { title, total, segments };
  }

  private buildLevelRows(): void {
    const buckets = [
      { label: 'Lv. 1–10', min: 1, max: 10 },
      { label: 'Lv. 11–20', min: 11, max: 20 },
      { label: 'Lv. 21–30', min: 21, max: 30 },
      { label: 'Lv. 31–40', min: 31, max: 40 },
      { label: 'Lv. 41–50', min: 41, max: 50 },
      { label: 'Lv. 51–60', min: 51, max: 60 },
    ];
    const counts = buckets.map((b) => this.agents.filter((a) => a.level >= b.min && a.level <= b.max).length);
    const max = Math.max(0, ...counts);

    this.levelRows = buckets.map((b, i) => ({
      label: b.label,
      display: `${counts[i]}`,
      pct: max ? (counts[i] / max) * 100 : 0,
    }));
  }

  private buildCompareRows(): void {
    const option = STAT_OPTIONS.find((o) => o.key === this.compareKey) ?? STAT_OPTIONS[0];
    const sorted = [...this.agents].sort((a, b) => b.stats[option.key] - a.stats[option.key]);
    const max = sorted[0]?.stats[option.key] ?? 0;

    this.compareRows = sorted.map((a) => {
      const value = a.stats[option.key];
      return {
        label: a.name,
        iconUrl: a.iconUrl,
        sub: `Lv. ${a.level}`,
        display: option.percent ? `${(value * 100).toFixed(1)}%` : Math.round(value).toLocaleString(),
        pct: max > 0 ? (value / max) * 100 : 0,
      };
    });
  }
}
