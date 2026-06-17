import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AnalysisService } from './analysis.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = `${environment.apiUrl}/api/auth`;
  private analysisService = inject(AnalysisService);

  // Estado reactivo usando Signals
  currentUser = signal<any | null>(null);
  token = signal<string | null>(null);
  private _tempRegisterData = signal<any | null>(null);

  constructor(private http: HttpClient, private router: Router) {
    this.loadTokenFromStorage();
  }

  private loadTokenFromStorage() {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      this.token.set(storedToken);
      this.currentUser.set(JSON.parse(storedUser));
    }
  }

  register(userData: any) {
    return this.http.post<any>(`${this.API_URL}/register`, userData).pipe(
      tap(res => this.handleAuthResponse(res))
    );
  }

  login(credentials: any) {
    return this.http.post<any>(`${this.API_URL}/login`, credentials).pipe(
      tap(res => this.handleAuthResponse(res))
    );
  }

  logout() {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** Borra TODO rastro del usuario actual (token, datos y análisis en memoria
   *  y en localStorage) para evitar que otro usuario vea datos ajenos. */
  private clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.token.set(null);
    this.currentUser.set(null);
    this._tempRegisterData.set(null);
    this.analysisService.reset();   // borrador y resultado de análisis
  }

  updateProfile(userId: number, profileData: any) {
    return this.http.put<any>(`${this.API_URL}/usuarios/${userId}/perfil`, { perfil: profileData }).pipe(
      tap(res => {
        // Actualizar el estado local si es exitoso
        const current = this.currentUser();
        if (current) {
          const updatedUser = {
            ...current,
            perfil: profileData,
            segmento: res?.segmento || current.segmento
          };
          this.currentUser.set(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      })
    );
  }

  private handleAuthResponse(res: any) {
    if (res && res.token) {
      // Antes de establecer la nueva sesión, limpiar cualquier dato del usuario
      // anterior (análisis, borrador, etc.) para que NO se filtre entre cuentas.
      this.analysisService.reset();
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.usuario));
      this.token.set(res.token);
      this.currentUser.set(res.usuario);
    }
  }

  // Retrieve temporary registration data (used during multi-step registration)
  // Retrieve temporary registration data (used during multi-step registration)
  setTempRegisterData(data: any): void {
    this._tempRegisterData.set(data);
  }

  // Returns the stored temporary registration data or null
  tempRegisterData(): any {
    return this._tempRegisterData();
  }

  isAuthenticated(): boolean {
    return !!this.token();
  }
}
