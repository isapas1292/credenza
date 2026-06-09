import { CommonModule } from '@angular/common';
import { Component, inject, computed, OnInit, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalysisService } from '../../core/services/analysis.service';
import { AuthService } from '../../core/services/auth.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './results.component.html',
  styleUrl: './results.component.css'
})
export class ResultsComponent implements OnInit, AfterViewInit {
  @ViewChild('pieCanvas') pieCanvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;

  private analysisService = inject(AnalysisService);
  private authService = inject(AuthService);

  draft = this.analysisService.analysisDraft;
  user = computed(() => this.authService.currentUser()?.perfil);

  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  sliderMonths = signal<number>(24);

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

  ngAfterViewInit(): void {
    this.initChart();
  }

  private initChart(): void {
    const { income, fixed, debts } = this.financialData;
    const newInstallment = this.simulatedInstallment;
    const currentExpenses = fixed + debts;
    const free = Math.max(0, income - currentExpenses - newInstallment);

    this.chart = new Chart(this.pieCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Gastos + Deudas', 'Nueva Cuota', 'Flujo Libre'],
        datasets: [{
          data: [currentExpenses, newInstallment, free],
          backgroundColor: ['#3f3f46', '#8b5cf6', '#10b981'],
          hoverBackgroundColor: ['#52525b', '#7c3aed', '#059669'],
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#000000', font: { family: 'Inter', size: 13 } }
          }
        }
      }
    });
  }

  updateChart(): void {
    if (!this.chart) return;
    const { income, fixed, debts } = this.financialData;
    const newInstallment = this.simulatedInstallment;
    const currentExpenses = fixed + debts;
    const free = Math.max(0, income - currentExpenses - newInstallment);

    this.chart.data.datasets[0].data = [currentExpenses, newInstallment, free];
    this.chart.update();
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

  get overallCompatibility() {
    const res = this.aiResult;
    if (!res) return { score: '0%', class: 'badge-neutral', message: 'Cargando datos...' };
    const score = Math.round((res.chosen_analysis?.recommendation_score || 0) * 100);
    return {
      score: `${score}%`,
      class: score >= 70 ? 'badge-success' : score >= 40 ? 'badge-warn' : 'badge-danger',
      message: res.suggestion_text || 'Revisión técnica de la compra.'
    };
  }

  get aiResult() {
    return this.analysisService.latestResult()?.data;
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
    return this.aiResult?.alternatives || [];
  }
}