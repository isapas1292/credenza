import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MockDataService } from '../../core/services/mock-data.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent {
  private mockDataService = inject(MockDataService);
  private router = inject(Router);
  
  currentUser = this.mockDataService.currentUser;

  get stats() {
    const user = this.currentUser();
    if (!user) return [];
    
    return [
      { title: 'Ingresos mensuales', value: `RD$${user.financialMetrics.monthlyIncome.toLocaleString()}`, hint: 'Actualizados este mes' },
      { title: 'Gastos recurrentes', value: `RD$${user.financialMetrics.fixedExpenses.toLocaleString()}`, hint: 'Servicios, hogar y otros' },
      { title: 'Compromisos activos', value: `RD$${user.financialMetrics.debts.toLocaleString()}`, hint: 'Préstamos y cuotas' },
      { title: 'Capacidad disponible', value: `RD$${user.financialMetrics.freeCashFlow.toLocaleString()}`, hint: 'Margen estimado' }
    ];
  }

  get metrics() {
    const user = this.currentUser();
    if (!user) return [];

    return [
      { title: 'Ahorro/meta mensual', value: 'RD$7,000' },
      { title: 'Nivel de estabilidad', value: user.financialMetrics.emergencyFundStatus },
      { title: 'Tolerancia al riesgo', value: user.consumerProfile.riskTolerance },
      { title: 'Cuota ideal máxima', value: `RD$${user.financialMetrics.maxCapacityForNewDebt.toLocaleString()}` }
    ];
  }

  history = [
    { title: 'Laptop de trabajo', amount: 'RD$3,500/mes', label: 'Recomendada', type: 'success' },
    { title: 'Vehículo compacto', amount: 'RD$17,100/mes', label: 'Con cautela', type: 'warn' },
    { title: 'Seguro de salud', amount: 'RD$1,850/mes', label: 'Buena opción', type: 'success' }
  ];

  logout() {
    this.mockDataService.logout();
    this.router.navigate(['/login']);
  }
}