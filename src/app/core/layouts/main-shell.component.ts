import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-main-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-shell.component.html',
  styleUrl: './main-shell.component.css'
})
export class MainShellComponent {
  navItems = [
    { label: 'Home', route: '/' },
    { label: 'Registro', route: '/registro' },
    { label: 'Inicio de sesión', route: '/login' },
    { label: 'Perfil', route: '/perfil' },
    { label: 'Analizar productos', route: '/analizar' },
    { label: 'Resultados', route: '/resultados' },
    { label: 'Inversiones', route: '/inversiones' }
  ];
}