import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-analysis-basis',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './analysis-basis.component.html',
  styleUrl: './analysis-basis.component.css'
})
export class AnalysisBasisComponent {
  financialMetrics = {
    monthlyIncome: 85000,
    fixedExpenses: 35000,
    debts: 12000,
    freeCashFlow: 38000,
    emergencyFundStatus: 'Saludable', // Recomendado vs Real
    maxCapacityForNewDebt: 15000 // Para mantenerse seguro
  };

  consumerProfile = {
    riskTolerance: 'Moderado',
    dealHunter: true,
    extraMoneyDisposition: 'Ahorrar',
    bigPurchaseHabit: 'Crédito Inmediato', 
    expenseTracking: 'Mental',
    financialGoal: 'Comprar mejor sin ahogarse'
  };
}
