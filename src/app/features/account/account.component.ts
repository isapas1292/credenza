import { CommonModule } from '@angular/common';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AnalysisService } from '../../core/services/analysis.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css']
})
export class AccountComponent implements OnInit {
  public authService = inject(AuthService);
  private analysisService = inject(AnalysisService);
  private router = inject(Router);

  history = signal<any[]>([]);
  loadingHistory = signal<boolean>(false);
  historyError = signal<string | null>(null);
  showAll = signal<boolean>(false);

  // Muestra los 5 más recientes salvo que el usuario pida ver todo.
  visibleHistory = computed(() => {
    const all = this.history();
    return this.showAll() ? all : all.slice(0, 5);
  });

  ngOnInit(): void {
    if (this.authService.currentUser()) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);
    this.analysisService.getHistory().subscribe({
      next: (res) => {
        this.history.set(res?.data || []);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.historyError.set('No se pudo cargar tu historial en este momento.');
        this.loadingHistory.set(false);
      }
    });
  }

  toggleShowAll(): void {
    this.showAll.update(v => !v);
  }

  scoreClass(score: number): string {
    const pct = Math.round((score || 0) * 100);
    return pct >= 65 ? 'hist-score-good' : pct >= 45 ? 'hist-score-mid' : 'hist-score-bad';
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
