import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MockDataService } from '../../core/services/mock-data.service';

@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './investments.component.html',
  styleUrls: ['./investments.component.css']
})
export class InvestmentsComponent {
  portfolio = [
    { title: 'Capital invertido', value: 'RD$420,000' },
    { title: 'Ganancia acumulada', value: '+RD$28,500' },
    { title: 'Rendimiento anual', value: '11.2%' }
  ];

  trendDays = [
    { day: 'Lun', value: 32 },
    { day: 'Mar', value: 46 },
    { day: 'Mié', value: 41 },
    { day: 'Jue', value: 58 },
    { day: 'Vie', value: 72 },
    { day: 'Sáb', value: 68 },
    { day: 'Dom', value: 84 }
  ];

  topStocks = [
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      price: '$118.40',
      change: '+4.8%',
      sentiment: 'Fuerte momentum',
      type: 'positive'
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft',
      price: '$421.10',
      change: '+2.1%',
      sentiment: 'Estabilidad + crecimiento',
      type: 'positive'
    },
    {
      symbol: 'AMZN',
      name: 'Amazon',
      price: '$182.70',
      change: '+1.6%',
      sentiment: 'Buen comportamiento',
      type: 'positive'
    },
    {
      symbol: 'TSLA',
      name: 'Tesla',
      price: '$171.90',
      change: '-1.9%',
      sentiment: 'Mayor volatilidad',
      type: 'neutral'
    }
  ];

  allocation = [
    { title: 'Renta fija', value: '35%' },
    { title: 'Fondos indexados', value: '40%' },
    { title: 'Acciones', value: '25%' }
  ];

  private mockDataService = inject(MockDataService);
  user = this.mockDataService.currentUser;

  get riskProfile() {
    return this.user()?.consumerProfile.riskTolerance || 'Moderado';
  }

  get recommendedAreas() {
    const risk = this.riskProfile;

    if (risk === 'Conservador') {
      return [
        { name: 'Certificados Financieros', desc: 'Tu meta central es mantener capital. Tasas fijas minimizan el riesgo drásticamente.' },
        { name: 'Bienes Raíces (Terrenos)', desc: 'Excelente reserva de valor a largo plazo con depreciación casi inexistente.' }
      ];
    } else if (risk === 'Agresivo') {
      return [
        { name: 'Acciones (Stocks)', desc: 'Tolera mayor volatilidad buscando máximos retornos en empresas de tecnología.' },
        { name: 'Startups / Cripto', desc: 'Aunque de alto riesgo, encaja con tu disposición a la volatilidad por ganancias asimétricas.' }
      ];
    }

    // Default Moderado
    return [
      { name: 'Fondos Indexados (S&P 500)', desc: 'Perfecto balance riesgo-rendimiento histórico para tu perfil.' },
      { name: 'Renta Inmobiliaria', desc: 'Ofrece flujo de caja mensual con apreciación estable de activo.' }
    ];
  }
}