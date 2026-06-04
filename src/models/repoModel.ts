import mongoose, {
  Schema,
  model,
  Types,
  InferSchemaType,
} from "mongoose";

const RepositorySchema = new Schema(
  { 
    name: {
      type: String,
      required: true, 
      unique : true,
      index: true,
    },

    description: {
      type: String,
      default: "",
    },

    // temporary simplified content storage
    content: [{
      type: String,
      default: "",
    }],

    visibility: {
      type: String,
      enum: ["PUBLIC", "PRIVATE"],
      default: "PUBLIC",
      required: true,
      index: true,
    },

    // repository owner
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // issues belonging to this repository
    issues: [
      {
        type: Schema.Types.ObjectId,
        ref: "Issue",
      },
    ],
  },
);

RepositorySchema.index(
  { owner: 1, name: 1 },
  { unique: true }
);

export type RepositoryDoc =
  InferSchemaType<typeof RepositorySchema> & {
    _id: Types.ObjectId;
  };

export const Repository =  model("Repository", RepositorySchema);
