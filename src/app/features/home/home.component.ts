import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  public authService = inject(AuthService);
  
  get financialSummary() {
    const user = this.authService.currentUser();
    if (!user || !user.perfil || !user.perfil.finances) return null;
    const f = user.perfil.finances;
    const monthlyIncome = (Number(f.monthlyIncome) || 0) + (Number(f.extraIncome) || 0);
    const fixedExpenses = Number(f.fixedExpenses) || 0;
    const variableExpenses = Number(f.variableExpenses) || 0;
    const activeDebts = Number(f.activeDebts) || 0;
    return {
      monthlyIncome,
      fixedExpenses: fixedExpenses + variableExpenses,
      activeDebts,
      freeCashFlow: monthlyIncome - fixedExpenses - variableExpenses - activeDebts,
      emergencyStatus: (Number(f.emergencyFundMonths) || 0) >= 3 ? 'Saludable' : 'En construcción'
    };
  }
  
  benefits = [
    {
      title: 'Elige visualmente',
      description: 'Las categorías aparecen primero como tarjetas con iconos para que el inicio del flujo sea más intuitivo.'
    },
    {
      title: 'Tu situación financiera vive en Perfil',
      description: 'Así el usuario no repite los mismos datos cada vez que quiera analizar un producto.'
    },
    {
      title: 'Resultados en su propia pantalla',
      description: 'Las recomendaciones tienen más espacio visual para compararse con claridad.'
    }
  ];

  cultureCards = [
    {
      icon: '✦',
      title: 'Claridad ante todo',
      description: 'Diseñamos experiencias que convierten información financiera compleja en decisiones fáciles de entender.'
    },
    {
      icon: '♥',
      title: 'Experiencia humana',
      description: 'La plataforma acompaña al usuario con lenguaje claro, contexto útil y una navegación natural.'
    },
    {
      icon: '↗',
      title: 'Impulsar mejores decisiones',
      description: 'No solo mostramos números: ayudamos a interpretar impacto, riesgo y conveniencia.'
    },
    {
      icon: '◎',
      title: 'Simplicidad con criterio',
      description: 'Reducimos fricción, eliminamos ruido y organizamos todo dentro de una experiencia coherente.'
    }
  ];

  contactMethods = [
    {
      label: 'Correo',
      value: 'hola@credenza.app'
    },
    {
      label: 'Ciudad',
      value: 'Santo Domingo, RD'
    },
    {
      label: 'Horario',
      value: 'Lun - Vie / 9:00 AM - 6:00 PM'
    },
    {
      label: 'Cuenta',
      value: 'Registro, acceso y perfil en un solo lugar'
    }
  ];
}
