import { CommonModule } from '@angular/common';
import { Component, inject, computed } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './investments.component.html',
  styleUrls: ['./investments.component.css']
})
export class InvestmentsComponent {
  get portfolio() {
    const inv = this.user()?.investments;
    const capital = inv?.currentCapital || 0;
    
    if (!capital || capital === 0) {
      return [
        { title: 'Capital inicial para invertir', value: 'RD$0' },
        { title: 'Ganancia acumulada', value: 'RD$0' },
        { title: 'Rendimiento', value: '0.0%' }
      ];
    }

    // Como Credenza no conecta a un broker real aún, estimamos rendimientos
    // basados en la expectativa del usuario o mostramos el capital neto real.
    const isExperienced = inv?.hasExperience !== 'No';
    const rendimiento = isExperienced ? 6.5 : 0;
    const ganancia = capital * (rendimiento / 100);

    return [
      { title: 'Capital declarado', value: `RD$${capital.toLocaleString()}` },
      { title: 'Ganancia estimada (Anual)', value: `+RD$${ganancia.toLocaleString()}` },
      { title: 'Rendimiento proyectado', value: `${rendimiento}%` }
    ];
  }

  trendDays = [
    { day: 'Lun', value: 32 },
    { day: 'Mar', value: 46 },
    { day: 'Mié', value: 41 },
    { day: 'Jue', value: 58 },
    { day: 'Vie', value: 72 },
    { day: 'Sáb', value: 68 },
    { day: 'Dom', value: 84 }
  ];

  get topStocks() {
    const assets = this.user()?.investments?.preferredAssets || [];
    
    // Si el usuario eligió Cripto
    if (assets.includes('Criptomonedas')) {
      return [
        { symbol: 'BTC', name: 'Bitcoin', price: '$68,400', change: '+2.4%', sentiment: 'Alta volatilidad', type: 'positive' },
        { symbol: 'ETH', name: 'Ethereum', price: '$3,800', change: '+1.1%', sentiment: 'Crecimiento de red', type: 'positive' },
        { symbol: 'COIN', name: 'Coinbase', price: '$210.50', change: '-0.5%', sentiment: 'Soporte institucional', type: 'neutral' }
      ];
    }
    // Si eligió Bienes Raíces (REITs)
    if (assets.includes('Bienes Raíces')) {
      return [
        { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', price: '$84.20', change: '+0.8%', sentiment: 'Dividendos estables', type: 'positive' },
        { symbol: 'O', name: 'Realty Income Corp', price: '$54.10', change: '+1.2%', sentiment: 'Pago mensual seguro', type: 'positive' },
        { symbol: 'SPG', name: 'Simon Property Group', price: '$150.30', change: '-0.3%', sentiment: 'Recuperación comercial', type: 'neutral' }
      ];
    }
    
    // Default / Acciones y ETFs
    return [
      { symbol: 'VOO', name: 'Vanguard S&P 500', price: '$480.10', change: '+1.2%', sentiment: 'Crecimiento seguro', type: 'positive' },
      { symbol: 'NVDA', name: 'NVIDIA', price: '$118.40', change: '+4.8%', sentiment: 'Fuerte momentum en IA', type: 'positive' },
      { symbol: 'MSFT', name: 'Microsoft', price: '$421.10', change: '+2.1%', sentiment: 'Estabilidad tecnológica', type: 'positive' },
      { symbol: 'AAPL', name: 'Apple Inc.', price: '$190.50', change: '-0.4%', sentiment: 'Soporte fuerte', type: 'neutral' }
    ];
  }

  get allocation() {
    const assets = this.user()?.investments?.preferredAssets || [];
    
    if (assets.length > 0) {
      const percentage = Math.round(100 / assets.length);
      return assets.map((asset: string, i: number) => {
        const isLast = i === assets.length - 1;
        const val = isLast ? 100 - (percentage * i) : percentage;
        return { title: asset, value: `${val}%` };
      });
    }

    const risk = this.riskProfile;
    if (risk === 'Conservador') {
      return [
        { title: 'Certificados Financieros', value: '70%' },
        { title: 'Liquidez (Ahorros)', value: '30%' }
      ];
    } else if (risk === 'Agresivo') {
      return [
        { title: 'Acciones de crecimiento', value: '50%' },
        { title: 'Criptomonedas', value: '30%' },
        { title: 'Startups', value: '20%' }
      ];
    }
    
    return [
      { title: 'Renta fija', value: '35%' },
      { title: 'Fondos indexados', value: '40%' },
      { title: 'Acciones', value: '25%' }
    ];
  }

  private authService = inject(AuthService);
  user = computed(() => this.authService.currentUser()?.perfil);

  get riskProfile() {
    return this.user()?.preferences?.riskTolerance || 'Moderado';
  }

  get recommendedAreas() {
    const prefs = this.user()?.preferences || {};
    const risk = this.riskProfile;
    const recommendations = [];

    // 1. Bienes Raíces: Para quienes buscan valor a largo plazo y no necesitan liquidez inmediata
    if (prefs.prefersLongTermValue && prefs.liquidityNeed === 'Baja') {
      recommendations.push({
        name: 'Bienes Raíces (Real Estate)',
        desc: 'Como en tus compras prefieres el valor a largo plazo y no necesitas liquidez inmediata, la inversión en propiedades se alinea perfectamente con tu paciencia y enfoque patrimonial.'
      });
    }

    // 2. Acciones "Blue Chip": Para quienes priorizan marcas y calidad
    if (prefs.prioritizesBrand && risk !== 'Conservador') {
      recommendations.push({
        name: 'Acciones "Blue Chip" (Empresas Líderes)',
        desc: 'Sueles guiarte por marcas reconocidas y confiables al comprar. Invertir en empresas consolidadas y líderes de mercado (como Apple o Microsoft) te dará esa misma seguridad y calidad.'
      });
    }

    // 3. Fondos Indexados (ETFs): Para quienes quieren simplicidad
    if (prefs.wantsSimpleRecommendations || risk === 'Moderado') {
      recommendations.push({
        name: 'Fondos Indexados (S&P 500)',
        desc: 'Prefieres procesos simples sin complicaciones. Un fondo indexado hace el trabajo por ti, diversificando automáticamente en las 500 mejores empresas sin que tengas que analizar una por una.'
      });
    }

    // 4. Value Investing / Stocks Individuales: Para los analíticos
    if (prefs.decisionStyle === 'Analítico' && risk !== 'Conservador') {
      recommendations.push({
        name: 'Acciones Individuales (Value Investing)',
        desc: 'Eres muy analítico y detallas tus opciones de compra. Esa habilidad es clave para evaluar estados financieros de empresas y encontrar acciones infravaloradas en el mercado.'
      });
    }

    // 5. Certificados y Renta Fija: Para conservadores con necesidad de liquidez
    if (risk === 'Conservador' || prefs.liquidityNeed === 'Alta') {
      recommendations.push({
        name: 'Certificados Financieros / Bonos',
        desc: 'Tu perfil de compra es cauteloso y prefieres tener dinero disponible en caso de emergencia. La renta fija te asegura capital protegido y rendimientos predecibles.'
      });
    }

    // 6. Startups / Cripto: Para los más tolerantes al riesgo
    if (risk === 'Agresivo' && prefs.investmentInterestLevel === 'Alto') {
      recommendations.push({
        name: 'Criptomonedas y Startups',
        desc: 'Tienes un alto nivel de interés y toleras el riesgo. Te gusta apostar por lo disruptivo, por lo que una pequeña parte de tu portafolio puede buscar ganancias asimétricas aquí.'
      });
    }

    // Deduplicate and return top 3
    const uniqueRecs = Array.from(new Map(recommendations.map(item => [item.name, item])).values());
    
    // Si por alguna razón no hay coincidencias, retornar defaults basados en riesgo
    if (uniqueRecs.length === 0) {
      if (risk === 'Conservador') {
        return [
          { name: 'Certificados Financieros', desc: 'Tu meta central es mantener el capital. Las tasas fijas minimizan el riesgo.' },
          { name: 'Bonos Gubernamentales', desc: 'Inversión respaldada por el estado, ideal para no correr riesgos.' }
        ];
      }
      return [
        { name: 'Fondos Indexados (S&P 500)', desc: 'Perfecto balance riesgo-rendimiento histórico para tu perfil.' },
        { name: 'Renta Inmobiliaria', desc: 'Ofrece flujo de caja mensual con apreciación estable del activo.' }
      ];
    }

    return uniqueRecs.slice(0, 3);
  }
}