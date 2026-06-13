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
  validationError = '';

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

  private resetProductForCategory(category: string): void {
    this.product = {
      name: category === 'Préstamo' ? 'Préstamo Personal' : '',
      price: null,
      interestRate: null,
      condition: 'Nuevo',
      paymentType: category === 'Préstamo' ? 'Financiado' : 'Contado',
      paymentDuration: category === 'Seguro' ? 1 : null,
      provider: '',
      squareMeters: null,
      bedrooms: null,
      zone: '',
      purpose: '',
      lifespan: '',
      mainConstraint: '',
      notes: ''
    };
  }

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
    if (title === this.selectedCategory) {
      return;
    }

    this.selectedCategory = title;
    this.resetProductForCategory(title);
  }

  nextStep(): void {
    if (this.currentStep < 3 && this.validateStep(this.currentStep)) {
      this.currentStep++;
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.validationError = '';
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
    if (!this.validateStep(3)) {
      return;
    }

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

  private get categoryKey(): string {
    return this.selectedCategory.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private hasText(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isNonNegativeNumber(value: unknown): boolean {
    return value !== null
      && value !== ''
      && Number.isFinite(Number(value))
      && Number(value) >= 0;
  }

  private isPositiveNumber(value: unknown): boolean {
    return this.isNonNegativeNumber(value) && Number(value) > 0;
  }

  private validateStep(step: number): boolean {
    let error = '';
    const category = this.categoryKey;

    if (step === 1 && !this.hasText(this.selectedCategory)) {
      error = 'Selecciona una categoría para continuar.';
    }

    if (step === 2) {
      if (category !== 'prestamo' && !this.hasText(this.product.name)) {
        error = 'Ingresa el nombre o tipo del producto.';
      } else if (!this.isPositiveNumber(this.product.price)) {
        error = 'Ingresa un precio o monto mayor que 0.';
      } else if (category !== 'prestamo' && category !== 'hogar' && !this.hasText(this.product.provider)) {
        error = 'Ingresa la marca, proveedor o aseguradora.';
      } else if (category === 'hogar' && !this.isPositiveNumber(this.product.squareMeters)) {
        error = 'Ingresa los metros cuadrados de la propiedad.';
      } else if (category === 'hogar' && !this.isNonNegativeNumber(this.product.bedrooms)) {
        error = 'Ingresa las habitaciones; puedes usar 0.';
      } else if (category === 'hogar' && !this.hasText(this.product.zone)) {
        error = 'Ingresa la zona o sector de la propiedad.';
      } else if (category !== 'seguro' && this.product.paymentType !== 'Contado'
        && !this.isPositiveNumber(this.product.paymentDuration)) {
        error = 'Ingresa una cantidad de meses mayor que 0.';
      } else if (category !== 'seguro' && this.product.paymentType !== 'Contado'
        && !this.isNonNegativeNumber(this.product.interestRate)) {
        error = 'Ingresa la tasa de interés; puede ser 0.';
      }
    }

    if (step === 3) {
      if (!this.hasText(this.product.purpose)) {
        error = 'Selecciona el propósito principal.';
      } else if (!['prestamo', 'seguro', 'hogar'].includes(category) && !this.hasText(this.product.lifespan)) {
        error = 'Selecciona el tiempo de vida esperado.';
      } else if (!this.hasText(this.product.mainConstraint)) {
        error = 'Selecciona qué es lo más importante para ti.';
      }
    }

    this.validationError = error;
    return !error;
  }
}
