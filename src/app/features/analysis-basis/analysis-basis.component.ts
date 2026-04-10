import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MockDataService } from '../../core/services/mock-data.service';

@Component({
  selector: 'app-analysis-basis',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './analysis-basis.component.html',
  styleUrl: './analysis-basis.component.css'
})
export class AnalysisBasisComponent {
  private mockDataService = inject(MockDataService);
  currentUser = this.mockDataService.currentUser;

  get financialMetrics() {
    const user = this.currentUser();
    if (user) return user.financialMetrics;
    
    return {
      monthlyIncome: 85000,
      fixedExpenses: 35000,
      debts: 12000,
      freeCashFlow: 38000,
      emergencyFundStatus: 'Saludable',
      maxCapacityForNewDebt: 15000
    };
  }

  get consumerProfile() {
    const user = this.currentUser();
    if (user) return user.consumerProfile;

    return {
      riskTolerance: 'Moderado',
      dealHunter: true,
      extraMoneyDisposition: 'Ahorrar',
      bigPurchaseHabit: 'Crédito Inmediato', 
      expenseTracking: 'Mental',
      financialGoal: 'Comprar mejor sin ahogarse'
    };
  }
}
