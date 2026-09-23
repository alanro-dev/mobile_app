import { IonicModule } from '@ionic/angular/lazy';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CharactersPage } from './characters.page';
import { CharactersPageRoutingModule } from './characters-routing.module';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, CharactersPageRoutingModule],
  declarations: [CharactersPage],
})
export class CharactersPageModule {}
