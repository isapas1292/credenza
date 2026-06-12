import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AnalysisService } from '../../core/services/analysis.service';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent {
  // ... (categories remain the same)
  categories = [
    { icon: '💻', title: 'Laptop', description: 'Equipos para estudio, trabajo o uso profesional.' },
    { icon: '🚗', title: 'Vehículo', description: 'Compra o financiamiento de un automóvil.' },
    { icon: '🛡️', title: 'Seguro', description: 'Salud, vida, auto o protección personal.' },
    { icon: '💳', title: 'Préstamo', description: 'Crédito para cubrir una necesidad puntual.' },
    { icon: '🏠', title: 'Hogar', description: 'Artículos grandes o mejoras importantes.' },
    { icon: '📱', title: 'Tecnología', description: 'Celulares, tablets y otros dispositivos.' }
  ];

  selectedCategory = 'Laptop';
  currentStep = 1;

  product = {
    name: '',
    price: null as number | null,
    interestRate: null as number | null,
    condition: 'Nuevo',
    paymentType: 'Contado',
    paymentDuration: null as number | null,
    provider: '',
    
    // Hogar specifics
    squareMeters: null as number | null,
    bedrooms: null as number | null,
    zone: '',
    
    // Context and Preferences
    purpose: '',
    lifespan: '',
    mainConstraint: '',
    notes: ''
  };

  private router = inject(Router);
  private analysisService = inject(AnalysisService);

  // ── Textos del formulario según la categoría ───────────────────
  get namePlaceholder(): string {
    switch (this.selectedCategory) {
      case 'Vehículo': return 'Ej. Toyota Corolla 2020';
      case 'Seguro': return 'Ej. Seguro de salud familiar';
      case 'Préstamo': return 'Ej. Préstamo personal';
      case 'Hogar': return 'Ej. Apartamento 2 habitaciones';
      case 'Tecnología': return 'Ej. iPhone 15 Pro';
      default: return 'Ej. MacBook Air M3 13 pulgadas';
    }
  }

  get brandPlaceholder(): string {
    switch (this.selectedCategory) {
      case 'Vehículo': return 'Ej. Toyota, Honda, Kia';
      case 'Seguro': return 'Ej. Humano, Mapfre, Universal';
      case 'Tecnología': return 'Ej. Samsung, Apple, Xiaomi';
      default: return 'Ej. Apple Store';
    }
  }

  get purposeQuestion(): string {
    switch (this.selectedCategory) {
      case 'Vehículo': return '¿Para qué usarás este vehículo?';
      case 'Hogar': return '¿Para qué comprarás esta propiedad?';
      case 'Seguro': return '¿Qué quieres proteger con este seguro?';
      case 'Préstamo': return '¿Para qué necesitas este préstamo?';
      default: return '¿Cuál es el propósito principal de esta compra?';
    }
  }

  // Opciones de propósito por categoría. El `value` se mapea en el motor a
  // esencial / mejora / ocio para ajustar la viabilidad.
  get purposeOptions(): { value: string; icon: string; title: string; desc: string }[] {
    switch (this.selectedCategory) {
      case 'Vehículo':
        return [
          { value: 'Trabajo', icon: '💼', title: 'Trabajo / Transporte diario', desc: 'Lo necesito para movilizarme o generar ingresos.' },
          { value: 'Familiar', icon: '👨‍👩‍👧', title: 'Uso familiar', desc: 'Para las necesidades de mi familia.' },
          { value: 'Reemplazo', icon: '🔄', title: 'Reemplazo', desc: 'El que tengo ya no sirve o da problemas.' },
          { value: 'Lujo', icon: '✨', title: 'Lujo / Gusto', desc: 'Un capricho o por estatus, no una necesidad.' }
        ];
      case 'Hogar':
        return [
          { value: 'Vivir', icon: '🏠', title: 'Vivir allí', desc: 'Para mí o para mi familia.' },
          { value: 'Inversión', icon: '📈', title: 'Inversión / Alquiler', desc: 'Para generar ingresos o proteger capital.' }
        ];
      case 'Seguro':
        return [
          { value: 'Salud', icon: '🏥', title: 'Salud', desc: 'Cobertura médica para mí o mi familia.' },
          { value: 'Vida', icon: '🛡️', title: 'Vida', desc: 'Proteger a mis dependientes ante un imprevisto.' },
          { value: 'Vehículo', icon: '🚗', title: 'Vehículo', desc: 'Proteger mi auto ante accidentes o robo.' },
          { value: 'Bienes', icon: '🏠', title: 'Bienes / Propiedad', desc: 'Proteger mi hogar o mis activos.' }
        ];
      case 'Préstamo':
        return [
          { value: 'Consolidar', icon: '🧮', title: 'Consolidar deudas', desc: 'Unificar deudas caras en una sola cuota.' },
          { value: 'Emergencia', icon: '🚑', title: 'Emergencia', desc: 'Un gasto imprevisto que no puede esperar.' },
          { value: 'Negocio', icon: '📈', title: 'Negocio / Inversión', desc: 'Para emprender o hacer crecer un ingreso.' },
          { value: 'Personal', icon: '🛍️', title: 'Gasto personal', desc: 'Un gusto, viaje o compra discrecional.' }
        ];
      default: // Laptop, Tecnología
        return [
          { value: 'Trabajo', icon: '💼', title: 'Trabajo / Estudio', desc: 'Esencial para generar ingresos o formarme.' },
          { value: 'Reemplazo', icon: '🔄', title: 'Reemplazo por daño', desc: 'Mi equipo actual falló y necesito uno nuevo.' },
          { value: 'Mejora', icon: '🚀', title: 'Mejora (Upgrade)', desc: 'Quiero algo mejor, aunque el actual aún sirve.' },
          { value: 'Entretenimiento', icon: '🎮', title: 'Entretenimiento', desc: 'Para disfrutar en mi tiempo libre.' }
        ];
    }
  }

  // ... (select methods remain the same)
  selectCategory(title: string): void {
    this.selectedCategory = title;
    this.product.purpose = ''; // el propósito depende de la categoría
    if (this.selectedCategory === 'Préstamo') {
      this.product.paymentType = 'Financiado';
      this.product.name = 'Préstamo Personal'; // Default name since we hide the field
    } else if (this.selectedCategory === 'Seguro') {
      this.product.paymentType = 'Contado'; // We'll treat it as monthly cash flow
      this.product.paymentDuration = 1;
    } else if (this.selectedCategory === 'Vehículo' || this.selectedCategory === 'Hogar') {
      if (this.product.paymentType === 'Tarjeta / Cuotas') {
        this.product.paymentType = 'Financiado';
      }
      if (this.selectedCategory === 'Vehículo' && this.product.condition === 'Refurbished') {
        this.product.condition = 'Usado';
      }
    }
  }

  nextStep(): void {
    if (this.currentStep < 3) {
      this.currentStep++;
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  selectCondition(condition: string): void {
    this.product.condition = condition;
  }

  selectPurpose(purpose: string): void {
    this.product.purpose = purpose;
  }

  selectLifespan(lifespan: string): void {
    this.product.lifespan = lifespan;
  }

  selectConstraint(constraint: string): void {
    this.product.mainConstraint = constraint;
  }

  goToResults(): void {
    this.analysisService.setAnalysisDraft({
      category: this.selectedCategory,
      product: {
        name: this.product.name,
        price: this.product.price,
        interestRate: this.product.interestRate,
        condition: this.product.condition,
        paymentType: this.product.paymentType,
        paymentDuration: this.product.paymentDuration,
        provider: this.product.provider,
        squareMeters: this.product.squareMeters,
        bedrooms: this.product.bedrooms,
        zone: this.product.zone,
        purpose: this.product.purpose,
        lifespan: this.product.lifespan,
        mainConstraint: this.product.mainConstraint,
        notes: this.product.notes
      }
    });

    this.router.navigate(['/resultados']);
  }
}