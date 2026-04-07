import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css']
})
export class AccountComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit() {
    // Redirigir directamente al login para entrar al flujo de cuenta
    this.router.navigate(['/login']);
  }
}