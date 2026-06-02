import { CommonModule } from '@angular/common';
import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalysisService } from '../../core/services/analysis.service';
import { AuthService } from '../../core/services/auth.service';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType, ChartOptions } from 'chart.js';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './results.component.html',
  styleUrl: './results.component.css'
})
export class ResultsComponent implements OnInit {
  private analysisService = inject(AnalysisService);
  private authService = inject(AuthService);
  
  draft = this.analysisService.analysisDraft;
  user = computed(() => this.authService.currentUser()?.perfil);
  
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Simulador interactivo
  sliderMonths = signal<number>(24); // Meses por defecto

  // Gráfico Doughnut
  public pieChartType: 'doughnut' = 'doughnut';
  public pieChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#000000', font: { family: 'Inter', size: 13 } }
      }
    },
    cutout: '70%'
  };

  ngOnInit(): void {
    const draft = this.draft();
    const user = this.authService.currentUser();
    const profile = user?.perfil;

    if (draft && user && profile) {
      this.analysisService.getRecommendation(user.id, draft, profile).subscribe({
        next: () => this.loading.set(false),
        error: (err) => {
          console.error('Error fetching recommendation', err);
          this.error.set('No se pudo obtener el análisis estructurado de la IA.');
          this.loading.set(false);
        }
      });
    } else {
      this.loading.set(false);
    }
  }

  get aiResult() {
    return this.analysisService.latestResult()?.data;
  }

  get financialData() {
    const profile = this.user();
    if (!profile || !profile.finances) return { income: 0, fixed: 0, debts: 0 };
    return {
      income: parseFloat(profile.finances.monthlyIncome || profile.finances.monthly_income_avg || 0),
      fixed: parseFloat(profile.finances.fixedExpenses || profile.finances.fixed_expenses_monthly || 0),
      debts: parseFloat(profile.finances.activeDebts || profile.finances.current_debt_payment_monthly || 0),
    };
  }

  get simulatedInstallment() {
    const price = this.draft()?.product.price || 0;
    return price / this.sliderMonths();
  }

  get simulatedFreeCashFlow() {
    const { income, fixed, debts } = this.financialData;
    return income - fixed - debts - this.simulatedInstallment;
  }

  get pieChartData(): ChartData<'doughnut'> {
    const { income, fixed, debts } = this.financialData;
    const newInstallment = this.simulatedInstallment;
    const currentExpenses = fixed + debts;
    const free = Math.max(0, income - currentExpenses - newInstallment);

    return {
      labels: ['Gastos + Deudas', 'Nueva Cuota', 'Flujo Libre'],
      datasets: [{
        data: [currentExpenses, newInstallment, free],
        backgroundColor: [
          '#3f3f46', // Gris oscuro para gastos fijos
          '#8b5cf6', // Púrpura (primary) para la nueva cuota
          '#10b981'  // Verde esmeralda para el flujo libre
        ],
        hoverBackgroundColor: ['#52525b', '#7c3aed', '#059669'],
        hoverBorderColor: 'transparent'
      }]
    };
  }

  get overallCompatibility() {
    const res = this.aiResult;
    if (!res) {
      return { score: '0%', class: 'badge-neutral', message: 'Cargando datos...' };
    }
    const score = Math.round((res.chosen_analysis?.recommendation_score || 0) * 100);
    return {
      score: `${score}%`,
      class: score >= 70 ? 'badge-success' : score >= 40 ? 'badge-warn' : 'badge-danger',
      message: res.suggestion_text || 'Revisión técnica de la compra.'
    };
  }

  get scenarios() {
    const res = this.aiResult;
    if (!res || !res.all_scenarios) return [];
    return res.all_scenarios.map((s: any) => ({
      title: s.scenario_details?.name || 'Escenario',
      description: s.scenario_details?.description || '',
      highlight: s.scenario_details?.type === res.best_option?.scenario_details?.type
    }));
  }

  get similarProducts() {
    const res = this.aiResult;
    if (res && res.alternatives) {
      return res.alternatives;
    }
    return [];
  }
}