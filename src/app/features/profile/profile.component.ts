import { CommonModule } from '@angular/common';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AnalysisService } from '../../core/services/analysis.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private analysisService = inject(AnalysisService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;

  // ── Historial REAL del usuario (desde la BD) ──
  history = signal<any[]>([]);
  loadingHistory = signal<boolean>(false);
  historyError = signal<string | null>(null);

  // En el perfil solo se muestran los 3 más recientes; el resto en /historial.
  recentHistory = computed(() => this.history().slice(0, 3));

  ngOnInit(): void {
    if (this.currentUser()) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);
    this.analysisService.getHistory().subscribe({
      next: (res) => {
        this.history.set(res?.data || []);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.historyError.set('No se pudo cargar tu historial en este momento.');
        this.loadingHistory.set(false);
      }
    });
  }

  goToFullHistory(): void {
    this.router.navigate(['/historial']);
  }

  scoreClass(score: number): string {
    const pct = Math.round((score || 0) * 100);
    return pct >= 65 ? 'badge-success' : pct >= 45 ? 'badge-warn' : 'badge-danger';
  }

  get stats() {
    const user = this.currentUser();
    if (!user || !user.perfil || !user.perfil.finances) return [];

    const f = user.perfil.finances;
    const income = (Number(f.monthlyIncome) || 0) + (Number(f.extraIncome) || 0);
    const expenses = (Number(f.fixedExpenses) || 0) + (Number(f.variableExpenses) || 0);
    const freeCashFlow = income - expenses - (Number(f.activeDebts) || 0);

    return [
      { title: 'Ingresos mensuales', value: `RD$${income.toLocaleString()}`, hint: 'Principal + extra' },
      { title: 'Gastos recurrentes', value: `RD$${expenses.toLocaleString()}`, hint: 'Fijos + variables' },
      { title: 'Compromisos activos', value: `RD$${(Number(f.activeDebts) || 0).toLocaleString()}`, hint: 'Préstamos y cuotas' },
      { title: 'Capacidad disponible', value: `RD$${freeCashFlow.toLocaleString()}`, hint: 'Flujo libre estimado' }
    ];
  }

  get metrics() {
    const user = this.currentUser();
    if (!user || !user.perfil || !user.perfil.finances || !user.perfil.preferences) return [];

    const f = user.perfil.finances;
    const p = user.perfil.preferences;
    const income = (Number(f.monthlyIncome) || 0) + (Number(f.extraIncome) || 0);
    const expenses = (Number(f.fixedExpenses) || 0) + (Number(f.variableExpenses) || 0);
    const freeCashFlow = income - expenses - (Number(f.activeDebts) || 0);
    const emergencyStatus = f.emergencyFundMonths >= 3 ? 'Saludable' : 'En construcción';

    return [
      { title: 'Ahorro/meta mensual', value: `RD$${(Number(f.monthlySavingsCapacity) || 0).toLocaleString()}` },
      { title: 'Nivel de estabilidad', value: emergencyStatus },
      { title: 'Tolerancia al riesgo', value: p.riskTolerance },
      { title: 'Cuota ideal máxima', value: `RD$${Math.max(freeCashFlow * 0.5, 0).toLocaleString()}` }
    ];
  }

  editProfile() {
    this.router.navigate(['/perfil-configuracion']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
