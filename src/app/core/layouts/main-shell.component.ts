import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-main-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-shell.component.html',
  styleUrls: ['./main-shell.component.css']
})
export class MainShellComponent {
  mainNavItems = [
    { label: 'Inicio', route: '/' },
    { label: 'Analizar', route: '/analizar' },
    { label: 'Inversiones', route: '/inversiones' }
  ];

  public authService = inject(AuthService);
  private router = inject(Router);

  // Estado del menú desplegable (solo se usa en celular/tablet vía CSS).
  menuOpen = signal(false);

  constructor() {
    // Cerrar el menú al navegar a otra pantalla.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }
}
