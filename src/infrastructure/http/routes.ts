import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { EnqueueWazzupMessage } from "../../application/use-cases/EnqueueWazzupMessage.js";
import type { ChatMessage } from "../../domain/entities/ChatMessage.js";
import type { LeadAssessment, SalesBoostType } from "../../domain/entities/LeadAssessment.js";
import {
  GeminiLeadSimulator,
  getScenarioById,
  testScenarios
} from "../gemini/GeminiLeadSimulator.js";
import { inMemoryLeadSink } from "../mock/InMemoryLeadSink.js";
import { esteworldPatientStore } from "../mock/EsteworldPatientStore.js";
import { QdrantRagRepository } from "../qdrant/QdrantRagRepository.js";
import { ValidationAppError } from "../../shared/errors.js";

const wazzupPayloadSchema = z
  .object({
    tenant_id: z.string().min(1),
    clinic_name: z.string().min(1).optional(),
    contact_id: z.string().min(1).optional(),
    patient_name: z.string().min(1).optional(),
    agent_name: z.string().min(1).optional(),
    scenario_id: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    treatment: z.string().min(1).optional(),
    message_id: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    timestamp: z.string().optional(),
    message: z
      .object({
        id: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        from: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        timestamp: z.string().optional()
      })
      .optional()
  })
  .passthrough();

const leadAssessmentSchema = z
  .object({
    tenantId: z.string().min(1),
    contactId: z.string().min(1),
    messageId: z.string().min(1),
    sourceMessageText: z.string().min(1).optional(),
    analysis: z.object({
      language: z.string().min(1),
      treatment: z.string().min(1),
      intent: z.string().min(1),
      leadTemperature: z.enum(["cold", "warm", "hot"]),
      leadScore: z.number().int().min(0).max(100),
      confidence: z.number().int().min(0).max(100),
      signals: z.array(z.string())
    }),
    nextBestAction: z.object({
      title: z.string().min(1),
      rationale: z.string().min(1),
      evidence: z.string().min(1)
    }),
    suggestedReplies: z.array(
      z.object({
        id: z.string().min(1),
        style: z.enum(["professional", "warm_trust", "closing_focused"]),
        label: z.string().min(1),
        text: z.string().min(1),
        isRecommended: z.boolean()
      })
    ),
    salesBoosts: z.array(
      z.object({
        type: z.enum([
          "shorter",
          "more_trustworthy",
          "more_persuasive",
          "ask_for_photos",
          "ask_travel_dates",
          "ask_for_deposit",
          "confirm_flights",
          "make_softer"
        ]),
        label: z.string().min(1),
        promptHint: z.string().min(1)
      })
    ),
    silencePlan: z.array(
      z.object({
        day: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]),
        action: z.string().min(1)
      })
    ),
    leadTemperature: z.enum(["cold", "warm", "hot"]),
    urgencyScore: z.number().int().min(1).max(10),
    intent: z.string().min(1),
    suggestedReply: z.string().min(1),
    rationale: z.string().min(1),
    followUpQuestions: z.array(z.string()),
    riskFlags: z.array(z.string()),
    retrievedDialogueIds: z.array(z.string()),
    createdAt: z.string().min(1)
  })
  .strict();

const boostSchema = z.object({
  boostType: z.enum([
    "shorter",
    "more_trustworthy",
    "more_persuasive",
    "ask_for_photos",
    "ask_travel_dates",
    "ask_for_deposit",
    "confirm_flights",
    "make_softer"
  ])
});

const conversationMessageSchema = z.object({
  role: z.enum(["lead", "agent"]),
  text: z.string().min(1)
});

const failureSchema = z.object({
  messageId: z.string().min(1),
  errorMessage: z.string().min(1)
});

const geminiLeadSimulator = new GeminiLeadSimulator();

export function createRoutes(enqueueWazzupMessage: EnqueueWazzupMessage): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  router.post("/api/webhook/wazzup", async (req: Request, res: Response, next) => {
    try {
      const payload = wazzupPayloadSchema.parse(req.body);
      const message = toChatMessage(payload);
      inMemoryLeadSink.upsertMessage(message);
      const { jobId } = await enqueueWazzupMessage.execute(message);

      res.status(200).json({
        accepted: true,
        jobId,
        messageId: message.messageId
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/mock/zoho", async (req: Request, res: Response, next) => {
    try {
      const assessment = leadAssessmentSchema.parse(req.body) as LeadAssessment;
      await inMemoryLeadSink.save(assessment);

      res.status(201).json({
        stored: true,
        totalStored: inMemoryLeadSink.list().length
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/mock/zoho/fail", (req: Request, res: Response, next) => {
    try {
      const { messageId, errorMessage } = failureSchema.parse(req.body);
      const caseItem = inMemoryLeadSink.markFailed(messageId, errorMessage);
      res.status(200).json({ case: caseItem });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/mock/zoho/leads", (_req: Request, res: Response) => {
    res.status(200).json({
      leads: inMemoryLeadSink.list()
    });
  });

  router.get("/api/copilot/cases", (_req: Request, res: Response) => {
    res.status(200).json({
      cases: inMemoryLeadSink.listCases()
    });
  });

  router.get("/api/copilot/cases/:messageId", (req: Request, res: Response) => {
    const messageId = requireParam(req.params.messageId, "messageId");
    const caseItem = inMemoryLeadSink.getCase(messageId);
    if (!caseItem) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    res.status(200).json({ case: caseItem });
  });

  router.post("/api/copilot/cases/:messageId/replies/:replyId/pick", (req: Request, res: Response) => {
    try {
      const messageId = requireParam(req.params.messageId, "messageId");
      const replyId = requireParam(req.params.replyId, "replyId");
      const caseItem = inMemoryLeadSink.pickReply(messageId, replyId);
      res.status(200).json({ case: caseItem });
    } catch (error) {
      nextError(error, res);
    }
  });

  router.post("/api/copilot/cases/:messageId/boost", (req: Request, res: Response) => {
    try {
      const messageId = requireParam(req.params.messageId, "messageId");
      const { boostType } = boostSchema.parse(req.body);
      const caseItem = inMemoryLeadSink.applyBoost(
        messageId,
        boostType as SalesBoostType
      );
      res.status(200).json({ case: caseItem });
    } catch (error) {
      nextError(error, res);
    }
  });

  router.post("/api/copilot/cases/:messageId/messages", async (req: Request, res: Response) => {
    try {
      const messageId = requireParam(req.params.messageId, "messageId");
      const { role, text } = conversationMessageSchema.parse(req.body);
      const { caseItem, analysisMessage } = inMemoryLeadSink.appendConversationMessage(
        messageId,
        role,
        text
      );
      const { jobId } = await enqueueWazzupMessage.execute(analysisMessage);

      res.status(202).json({
        accepted: true,
        jobId,
        case: caseItem
      });
    } catch (error) {
      nextError(error, res);
    }
  });

  router.get("/api/test/scenarios", (_req: Request, res: Response) => {
    res.status(200).json({ scenarios: testScenarios });
  });

  router.post("/api/test/scenarios/:scenarioId/opening", async (req: Request, res: Response) => {
    try {
      const scenarioId = requireParam(req.params.scenarioId, "scenarioId");
      const scenario = getScenarioById(scenarioId);
      const opening = await geminiLeadSimulator.generateOpeningMessage(scenario.id);
      res.status(200).json({ scenario, opening });
    } catch (error) {
      nextError(error, res);
    }
  });

  router.post("/api/test/cases/:messageId/lead-reply", async (req: Request, res: Response) => {
    try {
      const messageId = requireParam(req.params.messageId, "messageId");
      const caseItem = inMemoryLeadSink.getCase(messageId);
      if (!caseItem) {
        res.status(404).json({ error: "Case not found" });
        return;
      }

      const leadReply = await geminiLeadSimulator.generateLeadReply(caseItem);
      res.status(200).json(leadReply);
    } catch (error) {
      nextError(error, res);
    }
  });

  router.get("/api/admin/metrics", (_req: Request, res: Response) => {
    res.status(200).json(inMemoryLeadSink.getAdminMetrics());
  });

  // --- Demo Patient Endpoints ---

  router.get("/api/demo/patients", (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;

    if (!esteworldPatientStore.isLoaded()) {
      res.status(200).json({ patients: [], loaded: false });
      return;
    }

    const patients = query
      ? esteworldPatientStore.searchPatients(query, limit)
      : esteworldPatientStore.listSummaries(limit);

    res.status(200).json({
      patients,
      loaded: true,
      total: esteworldPatientStore.totalPatients(),
    });
  });

  router.post("/api/demo/load-patient", async (req: Request, res: Response, next) => {
    try {
      const { patientId } = z.object({ patientId: z.string().min(1) }).parse(req.body);
      const record = esteworldPatientStore.getPatient(patientId);
      if (!record) {
        res.status(404).json({ error: `Patient ${patientId} not found.` });
        return;
      }

      // Filter usable messages (skip media-only, very short)
      const usableMessages = record.messages.filter((m) => {
        const text = m.text.trim();
        return text.length >= 2 && !/^[a-f0-9-]+\.(jpeg|jpg|png|gif|mp4|pdf|webp)$/i.test(text);
      });

      if (usableMessages.length === 0) {
        res.status(400).json({ error: "Patient has no usable messages." });
        return;
      }

      // Take the last N messages for conversation context
      const DISPLAY_WINDOW = 12;
      const displayMessages = usableMessages.slice(-DISPLAY_WINDOW);

      const contactId = `whatsapp:esteworld-${record.patientId}`;
      const tenantId = "esteworld-istanbul";
      const messageId = `esteworld-${record.patientId}-${Date.now()}`;

      // Build the full conversation transcript for AI analysis
      const fullTranscript = displayMessages
        .map((m) => {
          const role = m.isAgent ? "Sales representative" : "Lead";
          return `${role} (${m.rawTimestamp}): ${m.text.trim()}`;
        })
        .join("\n");

      // Create a single ChatMessage with the full transcript
      const chatMsg: ChatMessage = {
        tenantId,
        clinicName: "Esteworld Istanbul",
        channel: "whatsapp",
        contactId,
        messageId,
        patientName: record.patientName,
        language: "English (UK)",
        treatment: record.interest,
        text: fullTranscript,
        receivedAt: new Date().toISOString(),
      };

      // Upsert the message (creates the case with conversation bubbles)
      inMemoryLeadSink.upsertMessage(chatMsg);

      // Enqueue for AI analysis (RAG pipeline: embed → search Qdrant → LLM)
      const { jobId } = await enqueueWazzupMessage.execute(chatMsg);

      res.status(200).json({
        accepted: true,
        jobId,
        messageId,
        totalMessages: usableMessages.length,
        displayedMessages: displayMessages.length,
        patient: {
          patientId: record.patientId,
          patientName: record.patientName,
          interest: record.interest,
          value: record.value,
          messageCount: record.messageCount,
          agentNames: record.agentNames,
          firstMessageAt: record.firstMessageAt,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // --- Qdrant Viewer Endpoints ---

  const qdrantRepo = new QdrantRagRepository();

  router.get("/api/qdrant/info", async (_req: Request, res: Response) => {
    try {
      const info = await qdrantRepo.getCollectionInfo();
      res.status(200).json(info);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get("/api/qdrant/points", async (req: Request, res: Response) => {
    try {
      const limit = typeof req.query.limit === "string" ? Math.min(Number(req.query.limit), 100) : 50;
      const offset = typeof req.query.offset === "string" ? req.query.offset : undefined;
      const result = await qdrantRepo.scrollPoints(limit, offset);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.delete("/api/qdrant/collection", async (_req: Request, res: Response) => {
    try {
      const deleted = await qdrantRepo.deleteCollection();
      res.status(200).json({ deleted });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}

type WazzupPayload = z.infer<typeof wazzupPayloadSchema>;

function toChatMessage(payload: WazzupPayload): ChatMessage {
  const text = payload.text ?? payload.message?.text;
  if (!text) {
    throw new ValidationAppError("Wazzup payload must include message text.");
  }

  const contactId = payload.contact_id ?? payload.message?.from;
  if (!contactId) {
    throw new ValidationAppError("Wazzup payload must include contact id.");
  }

  const message: ChatMessage = {
    tenantId: payload.tenant_id,
    channel: "whatsapp",
    contactId,
    messageId: payload.message_id ?? payload.message?.id ?? randomUUID(),
    text,
    receivedAt: payload.timestamp ?? payload.message?.timestamp ?? new Date().toISOString(),
    rawPayload: payload
  };

  if (payload.clinic_name) {
    message.clinicName = payload.clinic_name;
  }

  const patientName = payload.patient_name ?? payload.message?.name;
  if (patientName) {
    message.patientName = patientName;
  }

  if (payload.language) {
    message.language = payload.language;
  }

  if (payload.treatment) {
    message.treatment = payload.treatment;
  }

  return message;
}

function nextError(error: unknown, res: Response) {
  const message = error instanceof Error ? error.message : "Request failed";
  res.status(400).json({ error: message });
}

function requireParam(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || !value) {
    throw new ValidationAppError(`Missing route param "${name}".`);
  }

  return value;
}
