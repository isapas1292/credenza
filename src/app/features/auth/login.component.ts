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
  credentials = {
    email: '',
    password: ''
  };

  private router = inject(Router);
  private authService = inject(AuthService);

  login() {
    if (this.credentials.email && this.credentials.password) {
      this.authService.login(this.credentials).subscribe({
        next: (res) => {
          console.log('Login exitoso', res);
          this.router.navigate(['/perfil']);
        },
        error: (err) => {
          console.error('Error de login', err);
          alert('Email o contraseña incorrectos');
        }
      });
    }
  }
}