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

  // ... (select methods remain the same)
  selectCategory(title: string): void {
    this.selectedCategory = title;
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