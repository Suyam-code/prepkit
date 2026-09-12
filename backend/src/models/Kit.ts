import { Schema, model, Document, Types } from "mongoose";
import type { Kit as KitShape } from "@prepkit/shared";

/**
 * We store the Appendix-A content as a single Mixed blob rather than
 * re-declaring every nested field as a Mongoose schema. The shape is
 * already enforced by shared/src/schemas.ts (KitSchema, via zod) at the
 * point of every write — see pipeline/validateKit.ts — so a second,
 * looser enforcement layer here would just be duplicated source of truth
 * for the same rules. Mongoose is used for querying/ownership, not
 * content validation.
 */
export interface PracticeRecord {
  seen: number;
  lastConfidence: number; // 1-5
  lastSeenAt: Date;
}

export interface KitDoc extends Document {
  userId: Types.ObjectId;
  status: "draft" | "generating" | "ready" | "failed";
  content: KitShape;
  /** Flashcard practice tracking — app bookkeeping, not part of the Appendix A schema, so it's kept separate from `content` rather than bolted onto it. Keyed by flashcard id. */
  practice: Record<string, PracticeRecord>;
  createdAt: Date;
  updatedAt: Date;
}

const kitSchema = new Schema<KitDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["draft", "generating", "ready", "failed"],
      default: "draft",
    },
    content: { type: Schema.Types.Mixed, required: true },
    practice: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Kit = model<KitDoc>("Kit", kitSchema);
