import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './investments.component.html',
  styleUrl: './investments.component.css'
})
export class InvestmentsComponent {
  portfolio = [
    { title: 'Capital invertido', value: 'RD$420,000' },
    { title: 'Ganancia acumulada', value: '+RD$28,500' },
    { title: 'Rendimiento anual', value: '11.2%' }
  ];

  options = [
    {
      title: 'Fondos indexados',
      description: 'Pensado para usuarios que quieren crecimiento a largo plazo con diversificación.',
      riskLabel: 'Riesgo estimado: Medio-bajo',
      width: '45%'
    },
    {
      title: 'Bonos / renta fija',
      description: 'Adecuado para priorizar estabilidad y menor volatilidad en el portafolio.',
      riskLabel: 'Riesgo estimado: Bajo',
      width: '28%'
    },
    {
      title: 'Acciones de crecimiento',
      description: 'Mayor potencial de retorno, pero con movimientos más agresivos en el mercado.',
      riskLabel: 'Riesgo estimado: Medio-alto',
      width: '72%'
    }
  ];

  allocation = [
    { title: 'Renta fija', value: '35%' },
    { title: 'Fondos indexados', value: '40%' },
    { title: 'Acciones', value: '25%' }
  ];
}