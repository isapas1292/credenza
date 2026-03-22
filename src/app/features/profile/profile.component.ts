import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent {
  stats = [
    { title: 'Ingresos mensuales', value: 'RD$85,000', hint: 'Actualizados este mes' },
    { title: 'Gastos recurrentes', value: 'RD$38,500', hint: 'Servicios, hogar y otros' },
    { title: 'Compromisos activos', value: 'RD$20,000', hint: 'Préstamos y cuotas' },
    { title: 'Capacidad disponible', value: 'RD$26,500', hint: 'Margen estimado' }
  ];

  metrics = [
    { title: 'Ahorro/meta mensual', value: 'RD$7,000' },
    { title: 'Nivel de estabilidad', value: 'Alta' },
    { title: 'Tolerancia al riesgo', value: 'Moderada' },
    { title: 'Cuota ideal máxima', value: 'RD$6,000' }
  ];

  history = [
    { title: 'Laptop de trabajo', amount: 'RD$3,500/mes', label: 'Recomendada', type: 'success' },
    { title: 'Vehículo compacto', amount: 'RD$17,100/mes', label: 'Con cautela', type: 'warn' },
    { title: 'Seguro de salud', amount: 'RD$1,850/mes', label: 'Buena opción', type: 'success' }
  ];
}