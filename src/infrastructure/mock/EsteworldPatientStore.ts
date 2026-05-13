/**
 * In-memory store for parsed Esteworld patient records.
 * Loaded once at startup, provides fast access for demo UI.
 */

import { readFile } from "node:fs/promises";
import { parseEsteworldCsv, type PatientRecord } from "../../scripts/esteworld/parseEsteworldCsv.js";
import { logger } from "../../shared/logger.js";

export interface PatientSummary {
  patientId: string;
  patientName: string;
  interest: string;
  value: number;
  messageCount: number;
  agentNames: string[];
  firstMessageAt: string;
}

class EsteworldPatientStore {
  private patients: PatientRecord[] = [];
  private loaded = false;

  async loadFromCsv(csvPath: string = "data/esteworld-data/Aggregated_Patient_Logs.csv"): Promise<void> {
    if (this.loaded) return;

    try {
      const content = await readFile(csvPath, "utf8");
      this.patients = parseEsteworldCsv(content);
      this.loaded = true;

      logger.info(
        {
          totalPatients: this.patients.length,
          totalMessages: this.patients.reduce((sum, p) => sum + p.messageCount, 0),
        },
        "Esteworld patient data loaded"
      );
    } catch (error) {
      logger.warn(
        { err: error, path: csvPath },
        "Failed to load Esteworld CSV — demo patient features will be unavailable"
      );
    }
  }

  listSummaries(limit = 100): PatientSummary[] {
    return this.patients
      .filter((p) => p.messageCount >= 4)
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, limit)
      .map((p) => ({
        patientId: p.patientId,
        patientName: p.patientName,
        interest: p.interest,
        value: p.value,
        messageCount: p.messageCount,
        agentNames: p.agentNames,
        firstMessageAt: p.firstMessageAt,
      }));
  }

  getPatient(patientId: string): PatientRecord | undefined {
    return this.patients.find((p) => p.patientId === patientId);
  }

  searchPatients(query: string, limit = 20): PatientSummary[] {
    const q = query.toLowerCase();
    return this.patients
      .filter((p) =>
        p.patientName.toLowerCase().includes(q) ||
        p.patientId.toLowerCase().includes(q) ||
        p.interest.toLowerCase().includes(q)
      )
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, limit)
      .map((p) => ({
        patientId: p.patientId,
        patientName: p.patientName,
        interest: p.interest,
        value: p.value,
        messageCount: p.messageCount,
        agentNames: p.agentNames,
        firstMessageAt: p.firstMessageAt,
      }));
  }

  /**
   * Convert a patient record into a formatted conversation transcript
   * suitable for the AI copilot analysis.
   */
  formatPatientConversation(record: PatientRecord): string {
    return record.messages
      .filter((m) => m.text.trim().length > 1)
      .map((m) => {
        const role = m.isAgent ? "Sales representative" : "Lead";
        return `${role} (${m.rawTimestamp}): ${m.text}`;
      })
      .join("\n");
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  totalPatients(): number {
    return this.patients.length;
  }
}

export const esteworldPatientStore = new EsteworldPatientStore();
