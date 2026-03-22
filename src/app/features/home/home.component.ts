import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  benefits = [
    {
      title: 'Elige visualmente',
      description: 'Las categorías aparecen primero como tarjetas con iconos para que el inicio del flujo sea más intuitivo.'
    },
    {
      title: 'Tu situación financiera vive en Perfil',
      description: 'Así el usuario no repite los mismos datos cada vez que quiera analizar un producto.'
    },
    {
      title: 'Resultados en su propia pantalla',
      description: 'Las recomendaciones tienen más espacio visual para compararse con claridad.'
    }
  ];
}