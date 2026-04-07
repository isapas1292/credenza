import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent {
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
    condition: 'Nuevo',
    paymentType: 'Contado',
    provider: '',
    
    // Context and Preferences
    purpose: '',
    lifespan: '',
    mainConstraint: '',
    notes: ''
  };

  constructor(private readonly router: Router) {}

  selectCategory(title: string): void {
    this.selectedCategory = title;
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
    this.router.navigate(['/resultados']);
  }
}