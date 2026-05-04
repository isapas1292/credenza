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
    // Validar contraseñas
    if (this.model.password !== this.model.confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }
    
    // Guardar datos temporalmente en AuthService
    this.authService.setTempRegisterData(this.model);
    
    // Navegar al asistente de perfil
    this.router.navigate(['/perfil-configuracion']);
  }
}