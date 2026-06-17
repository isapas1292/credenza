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

  // Requisitos de contraseña fuerte (mismos que valida el servidor).
  // Se muestran en vivo mientras el usuario escribe.
  get passwordRequirements() {
    const pw = this.model.password || '';
    return [
      { label: 'Al menos 8 caracteres', met: pw.length >= 8 },
      { label: 'Una letra mayúscula', met: /[A-Z]/.test(pw) },
      { label: 'Una letra minúscula', met: /[a-z]/.test(pw) },
      { label: 'Un número', met: /[0-9]/.test(pw) },
      { label: 'Un símbolo especial (! @ # $ %)', met: /[^A-Za-z0-9]/.test(pw) },
      { label: 'Sin espacios', met: pw.length > 0 && !/\s/.test(pw) }
    ];
  }

  get isPasswordStrong(): boolean {
    return this.passwordRequirements.every(r => r.met);
  }

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
    if (!this.isPasswordStrong) {
      this.validationError = 'Tu contraseña no cumple los requisitos de seguridad. Revisa la lista debajo del campo.';
      return;
    }
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
