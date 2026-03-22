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

  product = {
    name: '',
    price: 50000,
    paymentType: 'Contado',
    provider: '',
    priority: 'Costo-beneficio',
    notes: ''
  };

  constructor(private readonly router: Router) {}

  selectCategory(title: string): void {
    this.selectedCategory = title;
  }

  goToResults(): void {
    this.router.navigate(['/resultados']);
  }
}