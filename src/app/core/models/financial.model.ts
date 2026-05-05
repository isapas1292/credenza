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
    paymentDuration?: number | null;
    provider: string;
    purpose: string;
    lifespan: string;
    mainConstraint: string;
    notes: string;
  };
}
