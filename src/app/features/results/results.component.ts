import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './results.component.html',
  styleUrl: './results.component.css'
})
export class ResultsComponent {
  scenarios = [
    { title: 'Opción A', subtitle: 'Mejor escenario', description: 'Cuota baja y buen rendimiento.', highlight: true },
    { title: 'Opción B', subtitle: 'Escenario medio', description: 'Más costo, pero todavía manejable.', highlight: false },
    { title: 'Opción C', subtitle: 'Escenario riesgoso', description: 'Reduce demasiado tu flexibilidad mensual.', highlight: false }
  ];

  recommendations = [
    {
      title: 'Opción A',
      description: 'Tiene el mejor balance entre precio, impacto mensual y utilidad.',
      label: 'Recomendada',
      labelType: 'success',
      compatibility: '88%',
      impact: 'RD$3,500'
    },
    {
      title: 'Opción B',
      description: 'Es viable, pero exige más esfuerzo mensual y deja menos margen.',
      label: 'Con cautela',
      labelType: 'warn',
      compatibility: '67%',
      impact: 'RD$5,750'
    },
    {
      title: 'Opción C',
      description: 'El precio o la cuota tienen un peso demasiado alto para tu perfil actual.',
      label: 'No ideal',
      labelType: 'danger',
      compatibility: '39%',
      impact: 'RD$8,167'
    }
  ];
}