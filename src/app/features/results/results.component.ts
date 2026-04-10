import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MockDataService } from '../../core/services/mock-data.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './results.component.html',
  styleUrl: './results.component.css'
})
export class ResultsComponent {
  private mockDataService = inject(MockDataService);
  
  draft = this.mockDataService.analysisDraft;
  user = this.mockDataService.currentUser;

  get analysisTitle() {
    return this.draft()?.product?.name || 'Laptop de trabajo';
  }

  get overallCompatibility() {
    const d = this.draft();
    const u = this.user();
    if (!d || !u) return { score: '88%', class: 'badge-success', message: 'Según la situación financiera guardada en tu perfil, esta compra es viable y mantiene un margen mensual saludable.' };

    const price = d.product.price || 0;
    const capacity = u.financialMetrics.freeCashFlow;

    if (price > capacity * 2) {
      return { score: '35%', class: 'badge-danger', message: 'Esta compra representa un riesgo alto. El costo supera por mucho tu margen libre, forzándote a adquirir nueva deuda.' };
    } else if (price > capacity * 0.8) {
      return { score: '60%', class: 'badge-warn', message: 'Toma precauciones. Esta compra absorbería gran parte de tu margen mensual libre actual.' };
    }

    return { score: '95%', class: 'badge-success', message: 'Excelente decisión basada en tus números de este mes. Tu margen absorbe fácilmente esta transacción.' };
  }

  get primaryImpact() {
    const d = this.draft();
    if (!d || !d.product.price) return 'RD$3,500/mes';
    // Assume 12 months for cash/credit mockup
    return `RD$${(d.product.price / 12).toLocaleString(undefined, {maximumFractionDigits: 0})}/mes`;
  }

  get scenarios() {
    return [
      { title: 'Pago al contado', subtitle: 'Mejor escenario', description: 'Sin intereses, liquidación inmediata.', highlight: true },
      { title: 'Financiamiento corto', subtitle: 'Escenario medio', description: 'Impacto mensual manejable, poco interés.', highlight: false },
      { title: 'Financiamiento largo', subtitle: 'Escenario riesgoso', description: 'Compromete tu flexibilidad por más tiempo.', highlight: false }
    ];
  }

  get recommendations() {
    const baseImpact = this.draft()?.product?.price ? (this.draft()!.product.price! / 12) : 3500;
    
    return [
      {
        title: 'Pago al contado',
        description: 'La opción financieramente más inteligente, pagando 0 intereses.',
        label: 'Recomendada',
        labelType: 'success',
        compatibility: '95%',
        impact: `RD$${(baseImpact * 12).toLocaleString(undefined, {maximumFractionDigits: 0})} (Único)`
      },
      {
        title: 'Préstamo a 6 meses',
        description: 'Viable si prefieres mantener liquidez, pero tiene un costo.',
        label: 'Con cautela',
        labelType: 'warn',
        compatibility: '70%',
        impact: `RD$${(baseImpact * 2.1).toLocaleString(undefined, {maximumFractionDigits: 0})}/mes`
      },
      {
        title: 'Préstamo a 24 meses',
        description: 'Costoso a largo plazo. Tu perfil actual sugiere evitar este sobrecargo.',
        label: 'No ideal',
        labelType: 'danger',
        compatibility: '30%',
        impact: `RD$${(baseImpact * 0.6).toLocaleString(undefined, {maximumFractionDigits: 0})}/mes`
      }
    ];
  }

  get similarProducts() {
    const d = this.draft();
    const category = d?.category || 'Laptop';
    const price = d?.product?.price || 50000;

    if (category === 'Vehículo') {
      return [
        { name: 'Sedán compacto (Asumiendo usado)', price: `RD$${(price * 0.7).toLocaleString(undefined, {maximumFractionDigits: 0})}`, desc: 'Cumple tu necesidad ahorrando un 30% en el precio inicial.', payment: 'Financiamiento 36 cuotas' },
        { name: 'Vehículo eléctrico/híbrido usado', price: `RD$${(price * 1.1).toLocaleString(undefined, {maximumFractionDigits: 0})}`, desc: 'Ligeramente más caro pero ahorras en combustible mensual.', payment: 'Financiamiento 48 cuotas (Tasa verde)' }
      ];
    } else if (category === 'Tecnología' || category === 'Laptop') {
      return [
        { name: 'Modelo anterior (Refurbished)', price: `RD$${(price * 0.6).toLocaleString(undefined, {maximumFractionDigits: 0})}`, desc: 'Mismo rendimiento para uso básico con una rebaja significativa.', payment: 'Pago al contado recomendado' },
        { name: 'Alternativa de marca media', price: `RD$${(price * 0.75).toLocaleString(undefined, {maximumFractionDigits: 0})}`, desc: 'Esquema de especificaciones bastante similares a un menor precio.', payment: 'Diferido en 3 cuotas sin interés' }
      ];
    }
    
    return [
      { name: 'Alternativa más económica', price: `RD$${(price * 0.7).toLocaleString(undefined, {maximumFractionDigits: 0})}`, desc: 'Excelente forma de liberar margen reteniendo valor base.', payment: 'Pago al contado' },
      { name: 'Alternativa premium duradera', price: `RD$${(price * 1.2).toLocaleString(undefined, {maximumFractionDigits: 0})}`, desc: 'Un poco más cara, pero duplica la vida útil del producto.', payment: 'Financiamiento a 12 meses' }
    ];
  }
}