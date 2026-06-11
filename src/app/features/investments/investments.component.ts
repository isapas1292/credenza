import { CommonModule } from '@angular/common';
import { Component, inject, computed } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

interface AllocationSlice { title: string; pct: number; amount: number; color: string; }
interface Vehicle {
  name: string;
  type: string;
  risk: 'Bajo' | 'Medio' | 'Alto';
  yield: string;
  what: string;
  why: string;
  where: string;
}

@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './investments.component.html',
  styleUrls: ['./investments.component.css']
})
export class InvestmentsComponent {
  private authService = inject(AuthService);
  user = computed(() => this.authService.currentUser()?.perfil);

  // ── Datos REALES declarados por el usuario ─────────────────────
  get riskProfile(): string { return this.user()?.preferences?.riskTolerance || 'Moderado'; }
  get capital(): number { return Number(this.user()?.investments?.currentCapital) || 0; }
  get monthlySavings(): number { return Number(this.user()?.finances?.monthlySavingsCapacity) || 0; }
  get emergencyMonths(): number { return Number(this.user()?.finances?.emergencyFundMonths) || 0; }
  get hasExperience(): boolean {
    const e = this.user()?.investments?.hasExperience;
    return !!e && e !== 'No';
  }
  get mainGoal(): string { return this.user()?.goals?.mainGoal || 'Hacer crecer mi dinero'; }
  get timeHorizon(): string { return this.user()?.goals?.timeHorizon || 'No definido'; }

  /** Tarjetas con el perfil real del usuario (sin inventar nada). */
  get profileFacts() {
    return [
      { label: 'Capital para invertir', value: this.capital > 0 ? `RD$${this.capital.toLocaleString()}` : 'Por definir' },
      { label: 'Capacidad de ahorro', value: this.monthlySavings > 0 ? `RD$${this.monthlySavings.toLocaleString()}/mes` : '—' },
      { label: 'Perfil de riesgo', value: this.riskProfile },
      { label: 'Horizonte de tiempo', value: this.timeHorizon },
      { label: 'Experiencia', value: this.hasExperience ? 'Con experiencia' : 'Principiante' }
    ];
  }

  /** ¿Está listo para invertir? El fondo de emergencia va primero (consejo real). */
  get readiness(): { ready: boolean; message: string } {
    if (this.emergencyMonths < 3) {
      return {
        ready: false,
        message: `Antes de invertir, conviene tener un fondo de emergencia de 3 a 6 meses de gastos. ` +
          `Hoy cubres ${this.emergencyMonths} ${this.emergencyMonths === 1 ? 'mes' : 'meses'}. ` +
          `Prioriza completarlo: invertir con deudas o sin respaldo te obliga a vender en mal momento.`
      };
    }
    if (this.capital <= 0 && this.monthlySavings <= 0) {
      return {
        ready: false,
        message: `Aún no tienes capital ni capacidad de ahorro registrada. El primer paso no es invertir, ` +
          `sino liberar un excedente mensual ajustando tus gastos. Cuando lo tengas, vuelve aquí.`
      };
    }
    return { ready: true, message: '' };
  }

  /** Aporte mensual sugerido: la mitad de la capacidad de ahorro (deja margen). */
  get suggestedMonthly(): number {
    return Math.round(this.monthlySavings * 0.5);
  }

  // ── Distribución sugerida según el perfil de riesgo ────────────
  // Marco de asignación de activos estándar (no son precios ni rendimientos
  // reales de mercado); los montos se calculan con el capital REAL del usuario.
  get allocation(): AllocationSlice[] {
    const colors = ['#8b5cf6', '#22c55e', '#06b6d4', '#f59e0b'];
    let model: { title: string; pct: number }[];
    const r = this.riskProfile;

    if (r === 'Conservador') {
      model = [
        { title: 'Certificados / depósito a plazo', pct: 50 },
        { title: 'Fondos de mercado de dinero', pct: 30 },
        { title: 'Bonos de Hacienda / BCRD', pct: 15 },
        { title: 'Liquidez (efectivo)', pct: 5 }
      ];
    } else if (r === 'Agresivo') {
      model = [
        { title: 'Acciones / ETFs internacionales', pct: 40 },
        { title: 'Fondos de inversión diversificados', pct: 25 },
        { title: 'Fondos cerrados (inmobiliario)', pct: 20 },
        { title: 'Activos alternativos', pct: 15 }
      ];
    } else {
      model = [
        { title: 'Fondos de inversión (renta fija)', pct: 35 },
        { title: 'Fondos diversificados / ETFs', pct: 30 },
        { title: 'Acciones internacionales', pct: 20 },
        { title: 'Liquidez (efectivo)', pct: 15 }
      ];
    }

    return model.map((m, i) => ({
      title: m.title,
      pct: m.pct,
      amount: Math.round(this.capital * (m.pct / 100)),
      color: colors[i % colors.length]
    }));
  }

  // ── Vehículos de inversión REALES disponibles en República Dominicana ──
  // Seleccionados según el perfil de riesgo del usuario. Rendimientos
  // referenciales del mercado dominicano (verificar con cada entidad).
  get recommendations(): Vehicle[] {
    const r = this.riskProfile;
    const goalNote = this.goalRationale();

    const CATALOG: Record<string, Vehicle> = {
      certificado: {
        name: 'Certificados Financieros / Depósito a plazo',
        type: 'Renta fija', risk: 'Bajo', yield: '~8% a 11% anual (referencial)',
        what: 'Depósitos a plazo fijo con tasa garantizada en bancos y asociaciones de ahorros y préstamos (Banco Popular, Banreservas, APAP, ACAP).',
        why: `Protege tu capital y te da un rendimiento predecible. ${goalNote} Ideal para empezar sin sobresaltos.`,
        where: 'Bancos múltiples y asociaciones reguladas por la Superintendencia de Bancos.'
      },
      mercadoDinero: {
        name: 'Fondo de Mercado de Dinero',
        type: 'Renta fija de corto plazo', risk: 'Bajo', yield: '~7% a 9% anual (referencial)',
        what: 'Fondo abierto que invierte en instrumentos de muy corto plazo. Puedes retirar tu dinero casi de inmediato.',
        why: 'Combina bajo riesgo con liquidez diaria: perfecto para tu fondo de oportunidades o como primer paso al invertir.',
        where: 'Administradoras de fondos reguladas por la SIMV (AFI Popular, AFI Reservas, JMMB, Pioneer, Universal).'
      },
      bonos: {
        name: 'Bonos del Ministerio de Hacienda / BCRD',
        type: 'Renta fija soberana', risk: 'Bajo', yield: '~10% a 13% anual (referencial)',
        what: 'Títulos de deuda del Estado dominicano. Pagan intereses periódicos y devuelven el capital al vencimiento.',
        why: 'Respaldados por el Estado: de los activos más seguros del país, con rendimiento superior al de un certificado.',
        where: 'Se compran a través de puestos de bolsa autorizados por la Bolsa y Mercados de Valores (BVRD).'
      },
      fondoRentaFija: {
        name: 'Fondo de Inversión de Renta Fija',
        type: 'Renta fija', risk: 'Bajo', yield: '~9% a 12% anual (referencial)',
        what: 'Fondo gestionado por profesionales que invierte en bonos y certificados diversificados.',
        why: `Diversifica tu renta fija sin que tengas que elegir instrumento por instrumento. ${goalNote}`,
        where: 'Administradoras de fondos reguladas por la SIMV.'
      },
      fondoDiversificado: {
        name: 'Fondo de Inversión Diversificado',
        type: 'Mixto', risk: 'Medio', yield: '~10% a 14% anual (referencial)',
        what: 'Combina renta fija y variable en un solo producto gestionado profesionalmente.',
        why: 'Equilibra crecimiento y estabilidad, alineado con tu perfil moderado y tu horizonte de tiempo.',
        where: 'Administradoras de fondos reguladas por la SIMV.'
      },
      accionesIntl: {
        name: 'Acciones y ETFs internacionales',
        type: 'Renta variable', risk: 'Alto', yield: 'Variable · histórico ~7-10% USD',
        what: 'Participación en empresas globales o índices (ej. S&P 500) a través de un ETF.',
        why: 'Mayor potencial de crecimiento a largo plazo. Tu tolerancia al riesgo permite una porción aquí, sin que sea todo tu portafolio.',
        where: 'Puestos de bolsa locales (Parval, JMMB, Tivalsa) o brokers internacionales regulados.'
      },
      fondoCerrado: {
        name: 'Fondo Cerrado Inmobiliario / de Desarrollo',
        type: 'Alternativo regulado', risk: 'Medio', yield: '~9% a 12% anual (referencial)',
        what: 'Invierte en proyectos inmobiliarios o de desarrollo y reparte las ganancias, sin que compres una propiedad directa.',
        why: 'Te da exposición a bienes raíces con menos capital y mayor diversificación que comprar un inmueble.',
        where: 'Fondos cerrados de oferta pública regulados por la SIMV (Pioneer, Excel, AFI Popular).'
      },
      alternativos: {
        name: 'Activos alternativos (cripto / capital de riesgo)',
        type: 'Especulativo', risk: 'Alto', yield: 'Variable · alta volatilidad',
        what: 'Criptomonedas o participación en emprendimientos. Alto potencial pero también alta probabilidad de pérdida.',
        why: 'Solo una porción pequeña (≤15%) y nunca con dinero que necesitarás pronto. Encaja con tu perfil agresivo como apuesta controlada.',
        where: 'Plataformas reguladas; en RD el mercado cripto no está supervisado por la SIMV, invierte con cautela.'
      }
    };

    let keys: string[];
    if (r === 'Conservador') {
      keys = ['certificado', 'mercadoDinero', 'bonos', 'fondoRentaFija'];
    } else if (r === 'Agresivo') {
      keys = ['accionesIntl', 'fondoDiversificado', 'fondoCerrado', 'alternativos'];
    } else {
      keys = ['fondoDiversificado', 'fondoRentaFija', 'accionesIntl', 'fondoCerrado'];
    }
    return keys.map(k => CATALOG[k]);
  }

  private goalRationale(): string {
    switch (this.mainGoal) {
      case 'Ahorrar más': return 'Acompaña tu meta de ahorrar más, haciendo crecer ese dinero en vez de dejarlo parado.';
      case 'Reducir deudas': return 'Si aún tienes deudas caras, prioriza pagarlas antes de invertir aquí.';
      case 'Empezar a invertir': return 'Es un excelente punto de partida para tu meta de empezar a invertir.';
      default: return 'Se alinea con tu objetivo de hacer crecer tu patrimonio de forma ordenada.';
    }
  }

  riskClass(level: string): string {
    return level === 'Bajo' ? 'risk-low' : level === 'Medio' ? 'risk-mid' : 'risk-high';
  }
}
