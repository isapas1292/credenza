import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AnalysisDraft } from '../models/financial.model';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  private http = inject(HttpClient);
  private readonly STORAGE_KEY = 'credenza_analysis_draft';
  private readonly API_URL = `${environment.apiUrl}/api/recommendations`;
  
  private analysisDraftSig = signal<AnalysisDraft | null>(null);
  public analysisDraft = this.analysisDraftSig.asReadonly();

  private latestResultSig = signal<any>(null);
  public latestResult = this.latestResultSig.asReadonly();

  constructor() {
    this.loadDraft();
  }

  setAnalysisDraft(draft: AnalysisDraft) {
    this.analysisDraftSig.set(draft);
    this.saveDraft();
  }

  getRecommendation(draft: AnalysisDraft): Observable<any> {
    // Pass ALL product data to backend — the Python engine needs it for genuine analysis
    const productData = {
      name: draft.product.name || 'Producto',
      product_category: draft.category.toLowerCase(),
      price: draft.product.price,
      interest_rate: draft.product.interestRate == null ? undefined : draft.product.interestRate / 100,
      condition: draft.product.condition,
      payment_type: draft.product.paymentType,                    // "Contado" | "Financiado" | "Tarjeta / Cuotas"
      term_months: draft.product.paymentDuration || 1,            // 1 = contado
      payment_method: draft.product.paymentType === 'Contado' ? 'contado' : 'cuotas',
      purpose: draft.product.purpose,
      lifespan: draft.product.lifespan,
      main_constraint: draft.product.mainConstraint,
      notes: draft.product.notes,
      provider: draft.product.provider,
      square_meters: draft.product.squareMeters,
      bedrooms: draft.product.bedrooms,
      zone: draft.product.zone
    };

    // El token identifica al usuario. El backend carga perfil y segmento desde
    // SQL; el frontend solo envía el producto que se desea analizar.
    return this.http.post(this.API_URL, { productData }).pipe(
      tap(res => this.latestResultSig.set(res))
    );
  }

  /** Historial de análisis del usuario autenticado (desde la BD). */
  getHistory(): Observable<any> {
    return this.http.get(`${this.API_URL}/history`);
  }

  clearAnalysisDraft() {
    this.analysisDraftSig.set(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private saveDraft() {
    const draft = this.analysisDraftSig();
    if (draft) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(draft));
    }
  }

  private loadDraft() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        this.analysisDraftSig.set(JSON.parse(stored));
      } catch (e) {
        console.error('Error loading analysis draft', e);
      }
    }
  }
}
