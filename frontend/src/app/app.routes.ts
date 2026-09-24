import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'hub',
    canActivate: [authGuard],
    loadComponent: () => import('./hub/hub.page').then((m) => m.HubPage),
  },
  {
    path: 'uid',
    canActivate: [authGuard],
    loadComponent: () => import('./uid-entry/uid-entry.page').then((m) => m.UidEntryPage),
  },
  {
    path: 'characters',
    canActivate: [authGuard],
    loadComponent: () => import('./characters/characters.page').then((m) => m.CharactersPage),
  },
  {
    path: 'characters/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./character-detail/character-detail.page').then((m) => m.CharacterDetailPage),
  },
];