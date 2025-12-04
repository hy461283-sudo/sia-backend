const mongoose = require("mongoose");

/**
 * Application Schema
 * Tracks student applications to projects for counting purposes
 */
const applicationSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for efficient queries
applicationSchema.index({ projectId: 1, studentId: 1 });

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;

