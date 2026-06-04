import mongoose, {
  Schema,
  model,
  Types,
  InferSchemaType,
} from "mongoose";

const IssueSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      required: true,
      index: true,
    },

    repository: {
      type: Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
      index: true,
    },

  
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },

);

export type IssueDoc =
  InferSchemaType<typeof IssueSchema> & {
    _id: Types.ObjectId;
  };

export const Issue = model("Issue", IssueSchema);
