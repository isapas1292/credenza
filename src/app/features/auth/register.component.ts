import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  validationError = '';

  model = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    city: '',
    goal: ''
  };

  constructor(private router: Router, private authService: AuthService) {}

  register() {
    this.validationError = '';
    const required = [
      this.model.firstName,
      this.model.lastName,
      this.model.email,
      this.model.password,
      this.model.confirmPassword,
      this.model.city
    ];
    if (required.some(value => !value.trim())) {
      this.validationError = 'Completa todos los campos obligatorios para continuar.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.model.email.trim())) {
      this.validationError = 'Ingresa un correo electrónico válido.';
      return;
    }
    if (this.model.password.length < 8) {
      this.validationError = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }
    // Validar contraseñas
    if (this.model.password !== this.model.confirmPassword) {
      this.validationError = 'Las contraseñas no coinciden.';
      return;
    }
    
    // Guardar datos temporalmente en AuthService
    this.authService.setTempRegisterData(this.model);
    
    // Navegar al asistente de perfil
    this.router.navigate(['/perfil-configuracion']);
  }
}
