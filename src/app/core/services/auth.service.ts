import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';
  
  // Estado temporal para el registro (se guarda aquí en el paso 1)
  tempRegisterData = signal<any>(null);

  // Usuario actual logueado
  private currentUserSig = signal<any>(null);
  public currentUser = this.currentUserSig.asReadonly();
  
  public isLoggedIn = computed(() => !!this.currentUserSig());

  constructor(private http: HttpClient) {
    // Cargar usuario del localStorage si existe
    const storedUser = localStorage.getItem('credenza_user');
    if (storedUser) {
      try {
        this.currentUserSig.set(JSON.parse(storedUser));
      } catch (e) {}
    }
  }

  setTempRegisterData(data: any) {
    this.tempRegisterData.set(data);
  }

  register(profileData: any): Observable<any> {
    const authData = this.tempRegisterData();
    const payload = {
      nombre: authData?.firstName || 'Nuevo',
      email: authData?.email || 'test@test.com',
      password: authData?.password || '123456',
      perfil: profileData
    };

    return this.http.post(`${this.apiUrl}/register`, payload).pipe(
      tap((res: any) => {
        if (res && res.usuario) {
          this.currentUserSig.set(res.usuario);
          localStorage.setItem('credenza_user', JSON.stringify(res.usuario));
          this.tempRegisterData.set(null); // Limpiar datos temporales
        }
      })
    );
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap((res: any) => {
        if (res && res.usuario) {
          this.currentUserSig.set(res.usuario);
          localStorage.setItem('credenza_user', JSON.stringify(res.usuario));
        }
      })
    );
  }

  updateProfile(userId: number, profileData: any): Observable<any> {
    return this.http.put(`http://localhost:3000/api/usuarios/${userId}/perfil`, { perfil: profileData }).pipe(
      tap(() => {
        // Actualizar el perfil localmente
        const user = this.currentUserSig();
        if (user) {
          user.perfil = profileData;
          this.currentUserSig.set({ ...user });
          localStorage.setItem('credenza_user', JSON.stringify(user));
        }
      })
    );
  }

  logout() {
    this.currentUserSig.set(null);
    localStorage.removeItem('credenza_user');
  }
}
