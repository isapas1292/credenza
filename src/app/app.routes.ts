import { Routes } from '@angular/router';
import { MainShellComponent } from './core/layouts/main-shell.component';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { ProfileComponent } from './features/profile/profile.component';
import { AnalyzeComponent } from './features/analyze/analyze.component';
import { ResultsComponent } from './features/results/results.component';
import { InvestmentsComponent } from './features/investments/investments.component';
import { HistoryComponent } from './features/history/history.component';
import { ProfileSetupComponent } from './features/profile-setup/profile-setup.component';
import { AnalysisBasisComponent } from './features/analysis-basis/analysis-basis.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainShellComponent,
    children: [
      { path: '', component: HomeComponent, title: 'Credenza | Inicio' },
      { path: 'login', component: LoginComponent, title: 'Credenza | Iniciar sesión' },
      { path: 'registro', component: RegisterComponent, title: 'Credenza | Registro' },

      // Rutas protegidas
      { path: 'analizar', component: AnalyzeComponent, title: 'Credenza | Analizar', canActivate: [authGuard] },
      { path: 'inversiones', component: InvestmentsComponent, title: 'Credenza | Inversiones', canActivate: [authGuard] },
      { path: 'perfil', component: ProfileComponent, title: 'Credenza | Perfil', canActivate: [authGuard] },
      { path: 'historial', component: HistoryComponent, title: 'Credenza | Historial', canActivate: [authGuard] },
      { path: 'perfil-configuracion', component: ProfileSetupComponent, title: 'Credenza | Configurar perfil' },
      { path: 'base-analisis', component: AnalysisBasisComponent, title: 'Credenza | Base del Análisis', canActivate: [authGuard] },
      { path: 'resultados', component: ResultsComponent, title: 'Credenza | Resultados', canActivate: [authGuard] }
    ]
  },
  { path: '**', redirectTo: '' }
];