import { Schema, model, Document, Types } from "mongoose";

export interface RunStep {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
}

export interface RunDoc extends Document {
  kitId: Types.ObjectId;
  kind: string; // "full" | "section:company_brief" | "section:questions:technical" | ...
  status:
    | "queued"
    | "crawling"
    | "extracting"
    | "generating"
    | "checking_coverage"
    | "scheduling"
    | "validating"
    | "done"
    | "failed";
  steps: RunStep[];
  createdAt: Date;
}

const runStepSchema = new Schema<RunStep>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "done", "failed", "skipped"],
      default: "pending",
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { _id: false }
);

const runSchema = new Schema<RunDoc>({
  kitId: { type: Schema.Types.ObjectId, ref: "Kit", required: true, index: true },
  kind: { type: String, required: true },
  status: {
    type: String,
    enum: [
      "queued",
      "crawling",
      "extracting",
      "generating",
      "checking_coverage",
      "scheduling",
      "validating",
      "done",
      "failed",
    ],
    default: "queued",
  },
  steps: { type: [runStepSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export const Run = model<RunDoc>("Run", runSchema);
