import { IonicModule } from '@ionic/angular/lazy';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { UidEntryPage } from './uid-entry.page';
import { UidEntryPageRoutingModule } from './uid-entry-routing.module';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, UidEntryPageRoutingModule],
  declarations: [UidEntryPage],
})
export class UidEntryPageModule {}
