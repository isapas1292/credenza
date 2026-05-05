import { Injectable, signal, computed } from '@angular/core';
import { AnalysisDraft } from '../models/financial.model';

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  private readonly STORAGE_KEY = 'credenza_analysis_draft';
  
  private analysisDraftSig = signal<AnalysisDraft | null>(null);
  public analysisDraft = this.analysisDraftSig.asReadonly();

  constructor() {
    this.loadDraft();
  }

  setAnalysisDraft(draft: AnalysisDraft) {
    this.analysisDraftSig.set(draft);
    this.saveDraft();
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
