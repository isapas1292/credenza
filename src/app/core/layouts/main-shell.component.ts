import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MockDataService } from '../services/mock-data.service';

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

  public mockDataService = inject(MockDataService);
}