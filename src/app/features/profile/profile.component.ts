import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  
  currentUser = this.authService.currentUser;

  get stats() {
    const user = this.currentUser();
    if (!user || !user.perfil || !user.perfil.finances) return [];
    
    const f = user.perfil.finances;
    const freeCashFlow = f.monthlyIncome - f.fixedExpenses - f.activeDebts;

    return [
      { title: 'Ingresos mensuales', value: `RD$${f.monthlyIncome.toLocaleString()}`, hint: 'Actualizados este mes' },
      { title: 'Gastos recurrentes', value: `RD$${f.fixedExpenses.toLocaleString()}`, hint: 'Servicios, hogar y otros' },
      { title: 'Compromisos activos', value: `RD$${f.activeDebts.toLocaleString()}`, hint: 'Préstamos y cuotas' },
      { title: 'Capacidad disponible', value: `RD$${freeCashFlow.toLocaleString()}`, hint: 'Margen estimado' }
    ];
  }

  get metrics() {
    const user = this.currentUser();
    if (!user || !user.perfil || !user.perfil.finances || !user.perfil.preferences) return [];

    const f = user.perfil.finances;
    const p = user.perfil.preferences;
    const freeCashFlow = f.monthlyIncome - f.fixedExpenses - f.activeDebts;
    const emergencyStatus = f.emergencyFundMonths >= 3 ? 'Saludable' : 'En construcción';

    return [
      { title: 'Ahorro/meta mensual', value: `RD$${f.monthlySavingsCapacity.toLocaleString()}` },
      { title: 'Nivel de estabilidad', value: emergencyStatus },
      { title: 'Tolerancia al riesgo', value: p.riskTolerance },
      { title: 'Cuota ideal máxima', value: `RD$${(freeCashFlow * 0.5).toLocaleString()}` }
    ];
  }

  history = [
    { title: 'Laptop de trabajo', amount: 'RD$3,500/mes', label: 'Recomendada', type: 'success' },
    { title: 'Vehículo compacto', amount: 'RD$17,100/mes', label: 'Con cautela', type: 'warn' },
    { title: 'Seguro de salud', amount: 'RD$1,850/mes', label: 'Buena opción', type: 'success' }
  ];

  editProfile() {
    this.router.navigate(['/perfil-configuracion']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}