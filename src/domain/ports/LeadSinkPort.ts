import type { LeadAssessment } from "../entities/LeadAssessment.js";

export interface LeadSinkPort {
  save(assessment: LeadAssessment): Promise<void>;
}
