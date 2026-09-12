import { IonicModule } from '@ionic/angular/lazy';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HubPage } from './hub.page';
import { HubPageRoutingModule } from './hub-routing.module';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, HubPageRoutingModule],
  declarations: [HubPage],
})
export class HubPageModule {}
