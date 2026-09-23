import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'hub',
    canActivate: [authGuard],
    loadChildren: () => import('./hub/hub.module').then( m => m.HubPageModule)
  },
  {
    path: 'uid',
    canActivate: [authGuard],
    loadChildren: () => import('./uid-entry/uid-entry.module').then(m => m.UidEntryPageModule)
  },
  {
    path: 'characters',
    canActivate: [authGuard],
    loadChildren: () => import('./characters/characters.module').then(m => m.CharactersPageModule)
  }
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
