import { CommonModule } from '@angular/common';
import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalysisService } from '../../core/services/analysis.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, RouterLink],
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

  ngOnInit(): void {
    const draft = this.draft();
    const user = this.authService.currentUser();
    const profile = user?.perfil;

    if (draft && user && profile) {
      this.analysisService.getRecommendation(user.id, draft, profile).subscribe({
        next: () => this.loading.set(false),
        error: (err) => {
          console.error('Error fetching recommendation', err);
          this.error.set('No se pudo obtener el análisis de la IA. Mostrando datos locales.');
          this.loading.set(false);
        }
      });
    } else {
      this.loading.set(false);
    }
  }

  get analysisTitle() {
    return this.draft()?.product?.name || 'Producto analizado';
  }

  get aiResult() {
    return this.analysisService.latestResult()?.data;
  }

  get overallCompatibility() {
    const res = this.aiResult;
    if (!res) {
      return { 
        score: '88%', 
        class: 'badge-success', 
        message: 'No hay datos de la IA disponibles actualmente.' 
      };
    }

    const analysis = res.chosen_analysis;
    return {
      score: `${Math.round(analysis.recommendation_score * 100)}%`,
      class: analysis.viable ? 'badge-success' : analysis.risk_band === 1 ? 'badge-warn' : 'badge-danger',
      message: analysis.explanation
    };
  }

  get primaryImpact() {
    const res = this.aiResult;
    if (!res) return 'RD$0/mes';
    
    const analysis = res.chosen_analysis;
    const installment = analysis.scenario_details?.installment || 0;
    
    if (installment === 0) {
      return `RD$${(this.draft()?.product.price || 0).toLocaleString()} (Único)`;
    }

    return `RD$${installment.toLocaleString(undefined, {maximumFractionDigits: 0})}/mes`;
  }

  get impactMessage() {
    const res = this.aiResult;
    if (!res) return 'Análisis pendiente...';
    return res.suggestion_text || 'Análisis basado en tu perfil financiero.';
  }

  get scenarios() {
    const res = this.aiResult;
    if (!res) return [];
    
    return [
      { title: 'Contado', subtitle: 'Sin intereses', description: 'Pago único de contado.', highlight: res.best_option.scenario_details.type === 'contado' },
      { title: 'Sugerido', subtitle: 'Óptimo', description: 'Plazo recomendado por la IA.', highlight: res.best_option.scenario_details.type === 'sugerido' },
      { title: 'Largo Plazo', subtitle: 'Cuota mínima', description: 'Mayor plazo, menor cuota.', highlight: res.best_option.scenario_details.type === 'largo_plazo' }
    ];
  }

  get recommendations() {
    const res = this.aiResult;
    if (!res || !res.all_scenarios) return [];
    
    return res.all_scenarios.map((s: any) => ({
      title: s.scenario_details.name,
      description: s.scenario_details.description,
      label: s.risk_band_name,
      labelType: s.viable ? 'success' : s.risk_band === 1 ? 'warn' : 'danger',
      compatibility: `${Math.round(s.recommendation_score * 100)}%`,
      impact: s.scenario_details.installment > 0 
        ? `RD$${s.scenario_details.installment.toLocaleString()}/mes`
        : `RD$${s.scenario_details.down_payment.toLocaleString()} (Único)`
    }));
  }

  get similarProducts() {
    const d = this.draft();
    const category = d?.category || 'Laptop';
    const price = d?.product?.price || 50000;

    if (category === 'Vehículo') {
      return [
        { name: 'Sedán compacto (Usado)', price: `RD$${(price * 0.7).toLocaleString()}`, desc: 'Cumple tu necesidad ahorrando un 30% en el precio inicial.', payment: 'Financiamiento 36 cuotas' },
        { name: 'Híbrido usado', price: `RD$${(price * 1.1).toLocaleString()}`, desc: 'Ligeramente más caro pero ahorras en combustible mensual.', payment: 'Tasa verde' }
      ];
    }
    
    return [
      { name: 'Alternativa económica', price: `RD$${(price * 0.7).toLocaleString()}`, desc: 'Excelente forma de liberar margen reteniendo valor base.', payment: 'Pago al contado' },
      { name: 'Alternativa duradera', price: `RD$${(price * 1.2).toLocaleString()}`, desc: 'Un poco más cara, pero duplica la vida útil del producto.', payment: '12 meses' }
    ];
  }
}