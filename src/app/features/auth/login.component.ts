import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  loading = false;
  validationError = '';

  credentials = {
    email: '',
    password: ''
  };

  private router = inject(Router);
  private authService = inject(AuthService);

  login() {
    this.validationError = '';
    if (!this.credentials.email.trim() || !this.credentials.password) {
      this.validationError = 'Ingresa tu correo y contraseña.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.credentials.email.trim())) {
      this.validationError = 'Ingresa un correo electrónico válido.';
      return;
    }
    if (this.credentials.email && this.credentials.password && !this.loading) {
      this.loading = true;
      this.authService.login(this.credentials).subscribe({
        next: (res) => {
          this.loading = false;
          console.log('Login exitoso', res);
          this.router.navigate(['/perfil']);
        },
        error: (err) => {
          this.loading = false;
          console.error('Error de login', err);
          alert(err?.error?.error || 'No fue posible iniciar sesión. Inténtalo de nuevo.');
        }
      });
    }
  }
}
