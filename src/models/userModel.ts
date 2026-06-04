import mongoose, {Schema,model,Types,InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false, // don't return in queries
    },

    // repositories owned by this user
    repositories: [
      {
        default:[],
        type: Schema.Types.ObjectId,
        ref: "Repository",
      },
    ],

    // repos starred by this user
    starredRepositories: [
      {
        default:[],
        type: Schema.Types.ObjectId,
        ref: "Repository",
      },
    ],

    // users this user follows
    following: [
      {
        default:[],
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
);

// indexes
// UserSchema.index({ username: 1 }, { unique: true });
// UserSchema.index({ email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof UserSchema> & {
  _id: Types.ObjectId;
};

export const User =  model("User", UserSchema);
