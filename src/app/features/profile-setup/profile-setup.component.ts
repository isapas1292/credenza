import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MockDataService } from '../../core/services/mock-data.service';

type StepNumber = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-setup.component.html',
  styleUrls: ['./profile-setup.component.css']
})
export class ProfileSetupComponent {
  step: StepNumber = 1;
  readonly totalSteps = 5;

  readonly categoryOptions = [
    'Tecnología',
    'Vehículo',
    'Seguro',
    'Préstamo',
    'Hogar',
    'Inversiones'
  ];

  readonly goalOptions = [
    'Comprar mejor',
    'Reducir deudas',
    'Organizar mi presupuesto',
    'Ahorrar más',
    'Empezar a invertir',
    'Tomar decisiones con menos riesgo'
  ];

  readonly assetOptions = [
    'Fondos indexados',
    'Bonos / renta fija',
    'Acciones',
    'ETFs',
    'Certificados',
    'Liquidez / efectivo'
  ];

  readonly urgencyOptions = [
    'Inmediata',
    'Este mes',
    'En 3 a 6 meses',
    'Más adelante'
  ];

  readonly riskCards = [
    {
      value: 'Conservador',
      title: 'Conservador',
      description: 'Prefiere estabilidad y evitar grandes variaciones.'
    },
    {
      value: 'Moderado',
      title: 'Moderado',
      description: 'Busca equilibrio entre crecimiento y control del riesgo.'
    },
    {
      value: 'Agresivo',
      title: 'Agresivo',
      description: 'Tolera más volatilidad a cambio de mayor crecimiento.'
    }
  ];

  model = {
    personal: {
      firstName: '',
      lastName: '',
      age: 30,
      city: '',
      maritalStatus: 'Soltero/a',
      dependents: 0,
      employmentType: 'Empleado/a'
    },
    finances: {
      monthlyIncome: 0,
      extraIncome: 0,
      fixedExpenses: 0,
      variableExpenses: 0,
      activeDebts: 0,
      monthlySavingsCapacity: 0,
      emergencyFundMonths: 0
    },
    goals: {
      mainGoal: 'Comprar mejor',
      timeHorizon: '6 a 12 meses',
      monthlyBudgetForNewCommitments: 0,
      urgency: 'Este mes',
      preferredCategories: [] as string[]
    },
    preferences: {
      decisionStyle: 'Analítico',
      riskTolerance: 'Moderado',
      prefersLowInstallment: true,
      prioritizesBrand: false,
      prefersLongTermValue: true,
      wantsSimpleRecommendations: true,
      investmentInterestLevel: 'Medio',
      liquidityNeed: 'Media',
      
      // Consumer profiling
      extraMoneyAction: '',
      bigPurchaseHabit: '',
      expenseTracking: ''
    },
    investments: {
      hasExperience: 'No',
      currentCapital: 0,
      preferredAssets: [] as string[],
      expectedReturn: 'Moderado',
      frequency: 'Mensual'
    }
  };

  private router = inject(Router);
  private mockDataService = inject(MockDataService);

  get progressPercentage(): number {
    return (this.step / this.totalSteps) * 100;
  }

  nextStep(): void {
    if (this.step < this.totalSteps) {
      this.step = (this.step + 1) as StepNumber;
    }
  }

  previousStep(): void {
    if (this.step > 1) {
      this.step = (this.step - 1) as StepNumber;
    }
  }

  goToStep(step: StepNumber): void {
    this.step = step;
  }

  toggleCategory(option: string): void {
    const exists = this.model.goals.preferredCategories.includes(option);

    this.model.goals.preferredCategories = exists
      ? this.model.goals.preferredCategories.filter(item => item !== option)
      : [...this.model.goals.preferredCategories, option];
  }

  toggleAsset(option: string): void {
    const exists = this.model.investments.preferredAssets.includes(option);

    this.model.investments.preferredAssets = exists
      ? this.model.investments.preferredAssets.filter(item => item !== option)
      : [...this.model.investments.preferredAssets, option];
  }

  setGoal(goal: string): void {
    this.model.goals.mainGoal = goal;
  }

  setRisk(risk: string): void {
    this.model.preferences.riskTolerance = risk;
  }

  saveProfile(): void {
    this.mockDataService.register({
      firstName: this.model.personal.firstName || 'Nuevo',
      lastName: this.model.personal.lastName || 'Usuario',
      email: 'usuario.nuevo@credenza.com',
      city: this.model.personal.city || 'Santo Domingo',
      goal: this.model.goals.mainGoal,
      financialMetrics: {
        monthlyIncome: this.model.finances.monthlyIncome,
        fixedExpenses: this.model.finances.fixedExpenses,
        debts: this.model.finances.activeDebts,
        freeCashFlow: this.model.finances.monthlyIncome - this.model.finances.fixedExpenses - this.model.finances.activeDebts,
        emergencyFundStatus: this.model.finances.emergencyFundMonths >= 3 ? 'Saludable' : 'En construcción',
        maxCapacityForNewDebt: (this.model.finances.monthlyIncome - this.model.finances.fixedExpenses - this.model.finances.activeDebts) * 0.5
      },
      consumerProfile: {
        riskTolerance: this.model.preferences.riskTolerance,
        dealHunter: this.model.preferences.wantsSimpleRecommendations,
        extraMoneyDisposition: this.model.preferences.extraMoneyAction,
        bigPurchaseHabit: this.model.preferences.bigPurchaseHabit,
        expenseTracking: this.model.preferences.expenseTracking,
        financialGoal: this.model.goals.mainGoal,
      }
    });
    this.router.navigate(['/perfil']);
  }
}