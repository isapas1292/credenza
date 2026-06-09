import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AnalysisDraft, UserProfile } from '../models/financial.model';
import { Observable, tap, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  private http = inject(HttpClient);
  private readonly STORAGE_KEY = 'credenza_analysis_draft';
  private readonly API_URL = 'http://localhost:3000/api/recommendations';
  
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

  getRecommendation(userId: number, draft: AnalysisDraft, profile: UserProfile): Observable<any> {
    // Pass ALL product data to backend — the Python engine needs it for genuine analysis
    const productData = {
      name: draft.product.name || 'Producto',
      product_category: draft.category.toLowerCase(),
      price: draft.product.price,
      condition: draft.product.condition,
      payment_type: draft.product.paymentType,                    // "Contado" | "Financiado" | "Tarjeta / Cuotas"
      term_months: draft.product.paymentDuration || 1,            // 1 = contado
      payment_method: draft.product.paymentType === 'Contado' ? 'contado' : 'cuotas',
      purpose: draft.product.purpose,
      lifespan: draft.product.lifespan,
      main_constraint: draft.product.mainConstraint,
      notes: draft.product.notes
    };

    const payload = {
      userId,
      productData,
      perfil: profile
    };

    return this.http.post(this.API_URL, payload).pipe(
      tap(res => this.latestResultSig.set(res))
    );
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
