const mongoose = require("mongoose");

/**
 * Project Schema
 * Represents an internship project posted by an organization
 */
const projectSchema = new mongoose.Schema(
  {
    organization_id: {
      type: String,
      required: true,
      index: true, // Index for efficient queries
    },
    project_code: {
      type: String,
      required: true,
    },
    project_name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "completed"],
      default: "draft",
    },
    scheduled_time: {
      type: String,
      default: null,
    },
    start_date: {
      type: Date,
      default: null,
    },
    end_date: {
      type: Date,
      default: null,
    },
    // Additional optional fields
    internsRequired: String,
    cgpaRequirement: String,
    discipline: String,
    skills: String,
    coordinatorName: String,
    coordinatorEmail: String,
    coordinatorAltEmail: String,
    coordinatorPhone: String,
    coordinatorDesignation: String,
    guidelinesFilePath: String,
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Create indexes for better query performance
projectSchema.index({ organization_id: 1, createdAt: -1 });

const Project = mongoose.model("Project", projectSchema);

module.exports = Project;

