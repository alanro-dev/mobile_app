import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';

import { ZzzProfileService } from '../services/zzz-profile.service';

@Component({
  selector: 'app-uid-entry',
  templateUrl: './uid-entry.page.html',
  styleUrls: ['./uid-entry.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonSpinner],
})
export class UidEntryPage {
  uid = '';
  loading = false;
  serverError = '';

  constructor(private profileService: ZzzProfileService, private router: Router) {}

  onSubmit(): void {
    if (!this.uid) return;

    this.loading = true;
    this.serverError = '';

    this.profileService.setUid(this.uid.trim()).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/hub'], { replaceUrl: true });
      },
      error: (err: Error) => {
        this.loading = false;
        this.serverError = err.message;
      },
    });
  }
}