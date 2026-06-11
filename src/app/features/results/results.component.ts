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
    const result = this.analysisService.latestResult();
    return result?.data || result?.fallback;
  }

  get financialData() {
    const profile = this.user();
    if (!profile || !profile.finances) return { income: 0, fixed: 0, variable: 0, debts: 0 };
    const baseIncome = parseFloat(profile.finances.monthlyIncome || profile.finances.monthly_income_avg || 0);
    const extraIncome = parseFloat(profile.finances.extraIncome || 0);
    return {
      // El ingreso incluye la ganancia extra (afecta el poder adquisitivo real).
      income: baseIncome + (isNaN(extraIncome) ? 0 : extraIncome),
      fixed: parseFloat(profile.finances.fixedExpenses || profile.finances.fixed_expenses_monthly || 0),
      variable: parseFloat(profile.finances.variableExpenses || profile.finances.variable_expenses_monthly_avg || 0),
      debts: parseFloat(profile.finances.activeDebts || profile.finances.current_debt_payment_monthly || 0),
    };
  }

  get simulatedInstallment() {
    const price = this.draft()?.product.price || 0;
    const months = this.sliderMonths();
    if (months <= 1) return price; // contado: el "esfuerzo" es el precio completo
    // Usa la tasa real del producto (sistema francés) si el usuario la indicó.
    const annualRate = (this.draft()?.product.interestRate || 0) / 100;
    if (annualRate > 0) {
      const r = annualRate / 12;
      return (price * r) / (1 - Math.pow(1 + r, -months));
    }
    return price / months;
  }

  get simulatedFreeCashFlow() {
    const { income, fixed, variable, debts } = this.financialData;
    return income - fixed - variable - debts - this.simulatedInstallment;
  }

  get pieChartData(): ChartData<'doughnut'> {
    const { income, fixed, variable, debts } = this.financialData;
    const newInstallment = this.simulatedInstallment;
    const currentExpenses = fixed + variable + debts;
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
      return { score: '0%', class: 'badge-neutral', message: 'Cargando datos...', label: '' };
    }
    const score = Math.round((res.chosen_analysis?.recommendation_score || 0) * 100);
    const viable = res.chosen_analysis?.viable === true;
    // La etiqueta refleja el veredicto real del motor, no un "Viable" fijo.
    const label = res.chosen_analysis?.risk_band_name
      ? this.capitalize(res.chosen_analysis.risk_band_name)
      : (viable ? 'Viable' : 'No recomendable');
    return {
      score: `${score}%`,
      class: score >= 65 ? 'badge-success' : score >= 45 ? 'badge-warn' : 'badge-danger',
      message: res.suggestion_text || res.chosen_analysis?.explanation || 'Revisión técnica de la compra.',
      label
    };
  }

  private capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  get rateAnalysis() {
    const res = this.aiResult;
    return res?.rate_analysis || null;
  }

  get scenarios() {
    const res = this.aiResult;
    if (!res || !res.all_scenarios) return [];
    return res.all_scenarios.map((s: any) => ({
      title: s.scenario_details?.name || 'Escenario',
      description: s.scenario_details?.description || '',
      highlight: s.scenario_details?.type === res.best_option?.scenario_details?.type,
      score: Math.round((s.recommendation_score || 0) * 100),
      installment: s.metrics?.installment || s.scenario_details?.installment || 0,
      dtiPost: s.metrics?.dti_post ? Math.round(s.metrics.dti_post * 100) : null,
      fcfPost: s.metrics?.fcf_post || null
    }));
  }

  get similarProducts() {
    const res = this.aiResult;
    if (res && res.alternatives) {
      return res.alternatives;
    }
    return [];
  }

  get actionPlan() {
    const res = this.aiResult;
    if (!res) return [];
    
    // Prefer Gemini's refined action plan if available
    if (res.gemini_action_plan && res.gemini_action_plan.length > 0) {
      return res.gemini_action_plan;
    }
    
    // Fallback to the backend's raw action plan
    if (res.chosen_analysis && res.chosen_analysis.action_plan) {
      return res.chosen_analysis.action_plan;
    }
    
    return [];
  }
}