import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MockDataService } from '../../core/services/mock-data.service';

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
  private mockDataService = inject(MockDataService);

  login() {
    if (this.credentials.email && this.credentials.password) {
      this.mockDataService.login(this.credentials.email);
      this.router.navigate(['/perfil']);
    }
  }
}