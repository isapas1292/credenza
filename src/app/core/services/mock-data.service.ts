import { Injectable, signal } from '@angular/core';

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  goal: string;
  financialMetrics: {
    monthlyIncome: number;
    fixedExpenses: number;
    debts: number;
    freeCashFlow: number;
    emergencyFundStatus: string;
    maxCapacityForNewDebt: number;
  };
  consumerProfile: {
    riskTolerance: string;
    dealHunter: boolean;
    extraMoneyDisposition: string;
    bigPurchaseHabit: string;
    expenseTracking: string;
    financialGoal: string;
  };
}

export interface AnalysisDraft {
  category: string;
  product: {
    name: string;
    price: number | null;
    condition: string;
    paymentType: string;
    provider: string;
    purpose: string;
    lifespan: string;
    mainConstraint: string;
    notes: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MockDataService {
  private readonly STORAGE_KEY = 'credenza_mock_state';

  // State
  private isLoggedInSig = signal<boolean>(false);
  private currentUserSig = signal<UserProfile | null>(null);
  private analysisDraftSig = signal<AnalysisDraft | null>(null);

  // Expose read-only signals
  public isLoggedIn = this.isLoggedInSig.asReadonly();
  public currentUser = this.currentUserSig.asReadonly();
  public analysisDraft = this.analysisDraftSig.asReadonly();

  constructor() {
    this.loadState();
  }

  // Auth Methods
  login(email: string) {
    if (email === 'demo@credenza.com') {
      this.isLoggedInSig.set(true);
      this.currentUserSig.set(this.getDemoUser());
    } else {
      // Just mock logging in as the registered user or a default one
      this.isLoggedInSig.set(true);
      if (!this.currentUserSig()) {
        this.currentUserSig.set(this.getDefaultUser(email));
      }
    }
    this.saveState();
  }

  register(profileData: Partial<UserProfile>) {
    this.isLoggedInSig.set(true);
    const newUser = {
      ...this.getDefaultUser(profileData.email || 'nuevo@usuario.com'),
      ...profileData
    };
    this.currentUserSig.set(newUser);
    this.saveState();
  }

  logout() {
    this.isLoggedInSig.set(false);
    this.currentUserSig.set(null);
    this.analysisDraftSig.set(null);
    this.saveState();
  }

  // Analysis Methods
  setAnalysisDraft(draft: AnalysisDraft) {
    this.analysisDraftSig.set(draft);
    this.saveState();
  }

  clearAnalysisDraft() {
    this.analysisDraftSig.set(null);
    this.saveState();
  }

  // Persistence
  private saveState() {
    try {
      const state = {
        isLoggedIn: this.isLoggedInSig(),
        currentUser: this.currentUserSig(),
        analysisDraft: this.analysisDraftSig()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Could not save mock state', e);
    }
  }

  private loadState() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        this.isLoggedInSig.set(state.isLoggedIn || false);
        this.currentUserSig.set(state.currentUser || null);
        this.analysisDraftSig.set(state.analysisDraft || null);
      }
    } catch (e) {
      console.error('Could not load mock state', e);
    }
  }

  // Mock Data Generators
  private getDefaultUser(email: string): UserProfile {
    return {
      firstName: 'Usuario',
      lastName: 'Credenza',
      email: email,
      city: 'Santo Domingo',
      goal: 'Comprar mejor sin ahogarse',
      financialMetrics: {
        monthlyIncome: 65000,
        fixedExpenses: 30000,
        debts: 8000,
        freeCashFlow: 27000,
        emergencyFundStatus: 'En construcción',
        maxCapacityForNewDebt: 9000
      },
      consumerProfile: {
        riskTolerance: 'Conservador',
        dealHunter: true,
        extraMoneyDisposition: 'Ahorrar para imprevistos',
        bigPurchaseHabit: 'Planificar e investigar',
        expenseTracking: 'App móvil / Excel',
        financialGoal: 'Comprar mejor sin ahogarse'
      }
    };
  }

  private getDemoUser(): UserProfile {
    return {
      firstName: 'Carlos',
      lastName: 'Martínez',
      email: 'demo@credenza.com',
      city: 'Santiago',
      goal: 'Optimizar mi presupuesto mensual',
      financialMetrics: {
        monthlyIncome: 85000,
        fixedExpenses: 35000,
        debts: 12000,
        freeCashFlow: 38000,
        emergencyFundStatus: 'Saludable',
        maxCapacityForNewDebt: 15000
      },
      consumerProfile: {
        riskTolerance: 'Moderado',
        dealHunter: true,
        extraMoneyDisposition: 'Ahorrar',
        bigPurchaseHabit: 'Crédito Inmediato',
        expenseTracking: 'Mental',
        financialGoal: 'Comprar mejor sin ahogarse'
      }
    };
  }
}
