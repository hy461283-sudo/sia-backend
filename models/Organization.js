const mongoose = require("mongoose");

/**
 * Organization Schema
 * Represents an organization that posts internship projects
 */
const organizationSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      required: true,
    },
    orgName: {
      type: String,
      required: true,
    },
    cinRegistrationNumber: String,
    country: String,
    state: String,
    detailedAddress: String,
    orgDocumentPath: String,
    coordinator: {
      name: String,
      designation: String,
      email: String,
      alternateEmail: String,
      phone: String,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Create index for username lookups
organizationSchema.index({ username: 1 });

const Organization = mongoose.model("Organization", organizationSchema);

module.exports = Organization;

