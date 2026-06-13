import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AnalysisService } from '../../core/services/analysis.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.css']
})
export class HistoryComponent implements OnInit {
  private authService = inject(AuthService);
  private analysisService = inject(AnalysisService);
  private router = inject(Router);

  history = signal<any[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.authService.currentUser()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadHistory();
  }

  loadHistory(): void {
    this.loading.set(true);
    this.error.set(null);
    this.analysisService.getHistory().subscribe({
      next: (res) => {
        this.history.set(res?.data || []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar tu historial en este momento.');
        this.loading.set(false);
      }
    });
  }

  scoreClass(score: number): string {
    const pct = Math.round((score || 0) * 100);
    return pct >= 65 ? 'badge-success' : pct >= 45 ? 'badge-warn' : 'badge-danger';
  }

  goBack(): void {
    this.router.navigate(['/perfil']);
  }
}
