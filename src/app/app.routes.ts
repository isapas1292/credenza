import { Routes } from '@angular/router';
import { MainShellComponent } from './core/layouts/main-shell.component';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { ProfileComponent } from './features/profile/profile.component';
import { AnalyzeComponent } from './features/analyze/analyze.component';
import { ResultsComponent } from './features/results/results.component';
import { InvestmentsComponent } from './features/investments/investments.component';

export const routes: Routes = [
  {
    path: '',
    component: MainShellComponent,
    children: [
      { path: '', component: HomeComponent, title: 'Credenza | Inicio' },
      { path: 'registro', component: RegisterComponent, title: 'Credenza | Registro' },
      { path: 'login', component: LoginComponent, title: 'Credenza | Iniciar sesión' },
      { path: 'perfil', component: ProfileComponent, title: 'Credenza | Perfil' },
      { path: 'analizar', component: AnalyzeComponent, title: 'Credenza | Analizar productos' },
      { path: 'resultados', component: ResultsComponent, title: 'Credenza | Resultados' },
      { path: 'inversiones', component: InvestmentsComponent, title: 'Credenza | Inversiones' },
    ]
  },
  { path: '**', redirectTo: '' }
];