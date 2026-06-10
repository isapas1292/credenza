import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type StepNumber = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-setup.component.html',
  styleUrls: ['./profile-setup.component.css']
})
export class ProfileSetupComponent implements OnInit {
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
      emergencyFundMonths: 0,
      liquidSavings: 0
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
  private authService = inject(AuthService);

  isFromRegister = false;
  isEditMode = false;

  ngOnInit() {
    const tempReg = this.authService.tempRegisterData();
    const currentUser = this.authService.currentUser();

    if (!currentUser && !tempReg) {
      this.router.navigate(['/registro']);
      return;
    }

    if (currentUser && currentUser.perfil) {
      // Estamos en modo edición
      this.isEditMode = true;
      this.isFromRegister = true; // Para bloquear los campos personales básicos
      this.model = JSON.parse(JSON.stringify(currentUser.perfil)); // Clonar para no mutar el estado
      
      // Asegurarnos de que firstName, lastName, y city vengan de la tabla si no están en el perfil
      if (!this.model.personal.firstName) this.model.personal.firstName = currentUser.nombre;
    } else if (tempReg) {
      // Estamos en modo registro
      this.isFromRegister = true;
      this.model.personal.firstName = tempReg.firstName || '';
      this.model.personal.lastName = tempReg.lastName || '';
      this.model.personal.city = tempReg.city || '';
      if (tempReg.goal) {
        this.model.goals.mainGoal = tempReg.goal;
      }
    }
  }

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
    // Mostrar un estado de carga opcional aquí (por ejemplo this.loading = true)
    
    if (this.isEditMode) {
      const user = this.authService.currentUser();
      this.authService.updateProfile(user.id, this.model).subscribe({
        next: () => {
          console.log('Perfil actualizado');
          this.router.navigate(['/perfil']);
        },
        error: (err) => {
          console.error('Error al actualizar', err);
          alert('Hubo un error al actualizar. Inténtalo de nuevo.');
        }
      });
    } else {
      const tempReg = this.authService.tempRegisterData();
      const payload = {
        nombre: tempReg ? `${tempReg.firstName} ${tempReg.lastName}`.trim() : 'Usuario',
        email: tempReg?.email,
        password: tempReg?.password,
        perfil: this.model
      };

      // Llamar al backend usando AuthService
      this.authService.register(payload).subscribe({
        next: (response) => {
          console.log('Registro exitoso', response);
          this.router.navigate(['/perfil']);
        },
        error: (error) => {
          console.error('Error al registrar usuario', error);
          alert('Hubo un error al registrarse. Inténtalo de nuevo.');
        }
      });
    }
  }
}