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

  readonly goalOptions = [
    'Comprar mejor',
    'Reducir deudas',
    'Organizar mi presupuesto',
    'Ahorrar más',
    'Empezar a invertir',
    'Tomar decisiones con menos riesgo'
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

  // Solo se capturan los datos que el análisis y las pantallas realmente usan.
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
      timeHorizon: '6 a 12 meses'
    },
    preferences: {
      riskTolerance: 'Moderado',
      // Perfil de consumo (usado por el motor de análisis)
      bigPurchaseHabit: '',
      expenseTracking: ''
    },
    investments: {
      hasExperience: 'No',
      currentCapital: 0
    }
  };

  private router = inject(Router);
  private authService = inject(AuthService);

  isFromRegister = false;
  isEditMode = false;
  saving = false;
  validationError = '';

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
    if (this.step < this.totalSteps && this.validateThrough(this.step)) {
      this.step = (this.step + 1) as StepNumber;
    }
  }

  previousStep(): void {
    if (this.step > 1) {
      this.step = (this.step - 1) as StepNumber;
    }
  }

  goToStep(step: StepNumber): void {
    if (step > this.step && !this.validateThrough((step - 1) as StepNumber)) {
      return;
    }

    this.validationError = '';
    this.step = step;
  }

  setGoal(goal: string): void {
    this.model.goals.mainGoal = goal;
  }

  setRisk(risk: string): void {
    this.model.preferences.riskTolerance = risk;
  }

  saveProfile(): void {
    if (this.saving) {
      return;
    }

    if (!this.validateThrough(4)) {
      return;
    }

    this.saving = true;

    if (this.isEditMode) {
      const user = this.authService.currentUser();
      this.authService.updateProfile(user.id, this.model).subscribe({
        next: () => {
          this.saving = false;
          console.log('Perfil actualizado');
          this.router.navigate(['/perfil']);
        },
        error: (err) => {
          this.saving = false;
          console.error('Error al actualizar', err);
          alert(err?.error?.error || 'Hubo un error al actualizar. Inténtalo de nuevo.');
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
          this.saving = false;
          console.log('Registro exitoso', response);
          this.router.navigate(['/perfil']);
        },
        error: (error) => {
          this.saving = false;
          console.error('Error al registrar usuario', error);
          alert(error?.error?.error || 'Hubo un error al registrarse. Inténtalo de nuevo.');
        }
      });
    }
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

  private validateThrough(lastStep: StepNumber): boolean {
    for (let current = 1; current <= lastStep; current++) {
      const error = this.validateStep(current as StepNumber);
      if (error) {
        this.validationError = error;
        this.step = current as StepNumber;
        return false;
      }
    }

    this.validationError = '';
    return true;
  }

  private validateStep(step: StepNumber): string {
    if (step === 1) {
      const personal = this.model.personal;
      if (!this.hasText(personal.firstName) || !this.hasText(personal.lastName) || !this.hasText(personal.city)) {
        return 'Completa tu nombre, apellido y ciudad.';
      }
      if (!Number.isFinite(Number(personal.age)) || Number(personal.age) <= 0) {
        return 'Ingresa una edad válida mayor que 0.';
      }
      if (!this.isNonNegativeNumber(personal.dependents)) {
        return 'Los dependientes deben ser 0 o un número mayor.';
      }
      if (!this.hasText(personal.maritalStatus) || !this.hasText(personal.employmentType)) {
        return 'Selecciona tu estado civil y situación laboral.';
      }
    }

    if (step === 2 && Object.values(this.model.finances).some((value) => !this.isNonNegativeNumber(value))) {
      return 'Completa todos los datos financieros con 0 o un número mayor.';
    }

    if (step === 3 && (!this.hasText(this.model.goals.mainGoal) || !this.hasText(this.model.goals.timeHorizon))) {
      return 'Selecciona tu objetivo principal y horizonte de decisión.';
    }

    if (step === 4) {
      const { preferences, investments } = this.model;
      if (!this.hasText(preferences.riskTolerance)
        || !this.hasText(preferences.bigPurchaseHabit)
        || !this.hasText(preferences.expenseTracking)
        || !this.hasText(investments.hasExperience)) {
        return 'Completa todas las preferencias y tu experiencia de inversión.';
      }
      if (!this.isNonNegativeNumber(investments.currentCapital)) {
        return 'El capital actual debe ser 0 o un número mayor.';
      }
    }

    return '';
  }
}
